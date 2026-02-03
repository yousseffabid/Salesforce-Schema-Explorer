/**
 * Salesforce Schema Explorer - Authentication Utilities
 */

import { logger } from './utils.js';
import { getMyDomain } from './api.js';

/**
 * Extracts the valid Salesforce session ID from cookies.
 * 
 * CRITICAL INSIGHT:
 * The session ID from *.lightning.force.com is RESTRICTED and NOT valid for API access.
 * The valid session ID for REST API comes from *.my.salesforce.com.
 * 
 * @param {string} instanceUrl - The Salesforce instance URL (e.g., https://myorg.my.salesforce.com)
 * @returns {Promise<string|null>} The session ID (sid) or null if not found
 */
export async function extractSessionIdFromCookies(instanceUrl) {
    try {
        if (!instanceUrl) {
            logger.warn('[Auth:extractSessionId] No instanceUrl provided');
            return null;
        }

        const urlObj = new URL(instanceUrl);
        const originalHostname = urlObj.hostname;
        const normalizedHostname = getMyDomain(originalHostname);

        logger.debug('[Auth:extractSessionId] Normalizing host', { original: originalHostname, normalized: normalizedHostname });

        // Construct a URL with the normalized hostname to retrieve cookies
        // This is more reliable than filtering by domain name
        const cookieUrl = `https://${normalizedHostname}/`;

        logger.debug('[Auth:extractSessionId] Checking cookie', { url: cookieUrl });

        // Try to get the sid cookie using the URL approach
        const sidCookie = await chrome.cookies.get({
            url: cookieUrl,
            name: 'sid'
        });

        if (sidCookie && sidCookie.value) {
            logger.debug('[Auth:extractSessionId] Session ID found via get()');
            return sidCookie.value;
        }

        // Fallback: Try getAll with more permissive domain matching
        logger.debug('[Auth:extractSessionId] sid cookie not found via get(), trying getAll()');
        const cookies = await chrome.cookies.getAll({
            url: cookieUrl,
            name: 'sid'
        });

        if (cookies && cookies.length > 0) {
            logger.debug('[Auth:extractSessionId] Session ID found via getAll()');
            return cookies[0].value;
        }

        // Last resort: Try without normalizing domain (in case normalization is wrong)
        if (originalHostname !== normalizedHostname) {
            logger.warn('[Auth:extractSessionId] Domain mismatch, trying original hostname as fallback');
            const fallbackUrl = `https://${originalHostname}/`;
            const fallbackCookie = await chrome.cookies.get({
                url: fallbackUrl,
                name: 'sid'
            });

            if (fallbackCookie && fallbackCookie.value) {
                logger.debug('[Auth:extractSessionId] Session ID found via fallback');
                return fallbackCookie.value;
            }
        }

        logger.warn('[Auth:extractSessionId] No session ID found - User may need to login');
        return null;
    } catch (error) {
        logger.error('[Auth:extractSessionId] Failed to extract session ID', { error: error.message });
        return null;
    }
}
