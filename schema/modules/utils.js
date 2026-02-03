/**
 * Salesforce Schema Explorer - Schema Utilities
 */

export const DEBUG = false;

/**
 * Centralized logging utility for SF Schema Explorer.
 * All methods are silenced when DEBUG is false, except error()
 * which always logs to ensure critical failures are never hidden.
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

/**
 * Escapes HTML characters in a string to prevent XSS.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped HTML string.
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
