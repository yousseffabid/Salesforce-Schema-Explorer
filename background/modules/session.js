/**
 * Salesforce Schema Explorer - Simple Session Manager
 * Unified session extraction with minimal complexity
 */

import { logger } from './utils.js';
import { getMyDomain, getCanonicalUrl } from './api.js';

/**
 * Session manager with cookie extraction only
 */
export class SessionManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Get session ID from cookies with caching
   */
  async getSessionId(instanceUrl) {
    if (!instanceUrl) {
      throw new Error('Instance URL required');
    }

    // Check cache first (using canonical URL)
    const canonicalUrl = getCanonicalUrl(instanceUrl);
    const cached = this.cache.get(canonicalUrl);

    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      logger.debug('[SessionManager] Using cached session');
      return cached.sessionId;
    }

    // Extract from cookies (the reliable method)
    const sessionId = await this.extractFromCookies(instanceUrl);

    if (sessionId) {
      // Cache the result (using canonical URL)
      this.cache.set(canonicalUrl, {
        sessionId,
        timestamp: Date.now()
      });

      logger.debug('[SessionManager] Session extracted and cached');
      return sessionId;
    }

    logger.warn('[SessionManager] No session ID found for: ' + instanceUrl);
    return null;
  }

  /**
   * Extract session ID from cookies
   * This is the most reliable method for Salesforce
   */
  async extractFromCookies(instanceUrl) {
    try {
      if (!instanceUrl) return null;
      const urlObj = new URL(instanceUrl);
      const originalHost = urlObj.hostname;
      const normalizedHost = getMyDomain(originalHost);

      logger.debug('[SessionManager] Extracting sid cookie', {
        originalHost,
        normalizedHost
      });

      // 1. Try exact match first for performance
      const exactCookie = await chrome.cookies.get({
        url: `https://${normalizedHost}/`,
        name: 'sid'
      });

      if (exactCookie?.value) {
        logger.debug('[SessionManager] Exact sid match found');
        return this.validateSessionId(exactCookie.value);
      }

      // 2. Broad search for all 'sid' cookies
      const allSidCookies = await chrome.cookies.getAll({ name: 'sid' });

      if (!allSidCookies || allSidCookies.length === 0) {
        logger.warn('[SessionManager] No sid cookies found in browser');
        return null;
      }

      // 3. Find the best match by domain suffix
      // Salesforce cookies often use .my.salesforce.com or specific subdomains
      const matches = allSidCookies.filter(c => {
        const cookieDomain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
        return normalizedHost.endsWith(cookieDomain) || originalHost.endsWith(cookieDomain);
      });

      if (matches.length > 0) {
        // Sort by domain length (most specific first)
        matches.sort((a, b) => b.domain.length - a.domain.length);
        logger.debug('[SessionManager] Fuzzy sid match found', {
          domain: matches[0].domain
        });
        return this.validateSessionId(matches[0].value);
      }

      return null;
    } catch (error) {
      logger.error('[SessionManager] Cookie extraction failed', error);
      return null;
    }
  }

  /**
   * Basic session ID validation
   */
  validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      return null;
    }

    const trimmed = sessionId.trim();

    // Salesforce session IDs are typically > 15 chars.
    // Modern "sid" cookies can be very long (100-200+ chars).
    if (trimmed.length < 15) {
      return null;
    }

    // Basic alphanumeric + special chars check (allowing more characters)
    if (/[^A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]/.test(trimmed)) {
      return null;
    }

    return trimmed;
  }

  /**
   * Clear cache for specific URL or all
   */
  clearCache(instanceUrl = null) {
    if (instanceUrl) {
      this.cache.delete(getCanonicalUrl(instanceUrl));
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache stats for debugging
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()).map(url => ({
        url: this.sanitizeUrl(url),
        cached: true
      }))
    };
  }

  /**
   * Sanitize URL for logging
   */
  sanitizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch {
      return '[invalid-url]';
    }
  }
}

// Global instance
export const sessionManager = new SessionManager();
