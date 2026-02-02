/**
 * Salesforce Schema Explorer - Background Utilities
 */

// =============================================================================
// DEBUG CONFIGURATION
// =============================================================================

/**
 * Debug mode flag. When true, enables verbose console logging.
 * Set to false for production builds to reduce console noise.
 */
export const DEBUG = false;

/**
 * Centralized logging utility for SF Schema Explorer.
 * All methods are silenced when DEBUG is false, except error()
 * which always logs to ensure critical failures are never hidden.
 *
 * Usage:
 *   logger.info('[Auth:login] Session started', { userId });
 *   logger.error('[API:fetch] Request failed', { status, message });
 */
export const logger = {
  /** Detailed diagnostic output for development only. */
  debug: (...args) => DEBUG && console.debug('[SF Schema Explorer]', ...args),

  /** High-level lifecycle events (loaded, connected, authenticated). */
  info: (...args) => DEBUG && console.info('[SF Schema Explorer]', ...args),

  /** Degraded behavior, fallbacks, deprecations. */
  warn: (...args) => DEBUG && console.warn('[SF Schema Explorer]', ...args),

  /** Failures that break functionality — always logged regardless of DEBUG flag. */
  error: (...args) => console.error('[SF Schema Explorer]', ...args),
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Checks if a URL belongs to a Salesforce domain.
 * 
 * @param {string} url - The URL to check
 * @returns {boolean} True if URL is a Salesforce domain
 */
export function isSalesforceUrl(url) {
  if (!url) return false;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname.includes('.salesforce.com') ||
      hostname.includes('.force.com') ||
      hostname.includes('.salesforce-setup.com')
    );
  } catch {
    return false;
  }
}

/**
 * Determines if an object should be excluded from the schema explorer.
 * 
 * @param {Object} objectMetadata - Object info from describeGlobal or metadata map
 * @returns {boolean} True if object should be excluded from display
 */
export function shouldExcludeObject(objectMetadata) {
  if (!objectMetadata) return true;  // null/undefined objects excluded

  const { queryable, deprecatedAndHidden, createable, name } = objectMetadata;

  // Criteria 1: Must be queryable
  if (!queryable) return true;

  // Criteria 2: Must not be deprecated
  if (deprecatedAndHidden) return true;

  // Criteria 3: Must be creatable
  if (!createable) return true;

  // Special case: Always include User
  if (name === 'User') return false;

  return false;
}
