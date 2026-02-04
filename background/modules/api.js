/**
 * Salesforce Schema Explorer - API Utilities
 */

import { logger } from './utils.js';

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 1000;
export const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// =============================================================================
// API HELPERS
// =============================================================================

/**
 * Helper to normalize Salesforce domains.
 * 
 * @param {string} host - The hostname to normalize
 * @returns {string} The normalized hostname (e.g., my.salesforce.com)
 */
export function getMyDomain(host) {
    if (!host) return host;

    let normalized = host.toLowerCase();

    // 1. Handle Lightning to MyDomain pivot
    // lightning.force.com -> my.salesforce.com
    // sandbox.lightning.force.com -> sandbox.my.salesforce.com
    normalized = normalized.replace(/\.lightning\.force\.com$/, ".my.salesforce.com");

    // 2. Remove Microsoft Defender for Cloud Apps suffix
    normalized = normalized.replace(/\.mcas\.ms$/, "");

    return normalized;
}

/**
 * Fetches a URL with automatic retry logic for transient failures.
 * 
 * @param {string} url - The full URL to fetch
 * @param {number} retriesLeft - Number of retry attempts remaining
 * @param {string|null} sessionId - Session ID (required for Bearer auth)
 * @param {boolean} isSetupDomain - Legacy flag (logic now handled by getMyDomain)
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} If all retries exhausted or non-retryable error
 */
export async function fetchWithRetry(url, retriesLeft, sessionId = null, isSetupDomain = false) {
    try {
        // AUTHENTICATION STRATEGY:
        // 1. Normalize hostname to use .my.salesforce.com where possible
        // 2. Always use Bearer token if we have a session ID
        // 3. Add Sforce-Call-Options to track client usage

        // Parse and normalize the URL
        const urlObj = new URL(url);
        const originalHost = urlObj.hostname;
        urlObj.hostname = getMyDomain(originalHost);
        const normalizedUrl = urlObj.toString();

        if (originalHost !== urlObj.hostname) {
            logger.debug('[API:fetchWithRetry] Normalized host', { original: originalHost, normalized: urlObj.hostname });
        }

        // Build headers
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        // Apply authentication
        if (sessionId) {
            headers['Authorization'] = `Bearer ${sessionId}`;
            headers['Sforce-Call-Options'] = 'client=SF Schema Explorer';
        }

        // Make request
        const response = await fetch(normalizedUrl, {
            method: 'GET',
            headers,
            // IMPORTANT: Always include credentials (cookies) for Salesforce API calls
            credentials: 'include'
        });

        // Handle HTTP error responses
        if (!response.ok) {
            // Get error details from response body
            const errorText = await response.text();
            const error = new Error(`HTTP ${response.status}: ${errorText}`);
            error.status = response.status;

            // Special handling for 401
            if (response.status === 401) {
                logger.warn('[API:fetchWithRetry] 401 Unauthorized - Session likely expired');
            }

            // Check if this error is retryable
            if (RETRYABLE_STATUS_CODES.has(response.status) && retriesLeft > 1) {
                logger.warn('[API:fetchWithRetry] Retryable error encountered', { status: response.status, retriesLeft: retriesLeft - 1 });
                return await retryWithBackoff(normalizedUrl, retriesLeft - 1, sessionId, isSetupDomain);
            }

            // Non-retryable error or out of retries
            throw error;
        }

        // Success! Parse and return JSON
        return await response.json();

    } catch (error) {
        // Handle network errors (no internet, DNS failure,...)
        if (error.name === 'TypeError' && retriesLeft > 1) {
            logger.warn('[API:fetchWithRetry] Network error encountered', { error: error.message, retriesLeft: retriesLeft - 1 });
            // Pass original URL to retry logic, it will call us back
            return await retryWithBackoff(url, retriesLeft - 1, sessionId, isSetupDomain);
        }
        throw error;
    }
}

/**
 * Waits with exponential backoff, then retries the fetch.
 */
async function retryWithBackoff(url, retriesLeft, sessionId = null, isSetupDomain = false) {
    const attempt = MAX_RETRY_ATTEMPTS - retriesLeft;
    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);

    logger.info('[API:retryWithBackoff] Waiting before retry', { delay });
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(url, retriesLeft, sessionId, isSetupDomain);
}
