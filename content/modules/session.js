/**
 * Salesforce Schema Explorer - Session Utilities
 */

window.SFSchema = window.SFSchema || {};

(function (NS) {
    'use strict';

    const Utils = NS.Utils;

    // ===========================================================================
    // SESSION EXTRACTION
    // ===========================================================================

    /**
         * Retrieves the Salesforce session ID.
         * Tries cookies first, then page context.
         * @returns {string|null} The session ID or null if not found.
         */
    function getSessionId() {
        // Method 1: Try reading from cookies directly
        const cookieSession = getSessionIdFromCookie();
        if (cookieSession) {
            return cookieSession;
        }

        // Method 2: Try reading from page context
        const pageSession = getSessionIdFromPage();
        if (pageSession) {
            return pageSession;
        }

        return null;
    }

    /**
         * Extracts session ID from cookies.
         * @returns {string|null} Session ID or null.
         */
    function getSessionIdFromCookie() {
        try {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [cookieName, ...cookieValueParts] = cookie.trim().split('=');
                if (cookieName === 'sid') {
                    const cookieValue = cookieValueParts.join('=');
                    return cookieValue ? decodeURIComponent(cookieValue) : null;
                }
            }
        } catch (error) {
            Utils.Logger.warn('[Session:Cookie] Cookie access failed', { error: error.message });
        }
        return null;
    }

    /**
         * Extracts session ID from the page context (meta tags, URL hash, inline scripts).
         * @returns {string|null} Session ID or null.
         */
    function getSessionIdFromPage() {
        try {
            // Method 1: Meta tags
            const metaElement = document.querySelector('meta[name="sid"]');
            if (metaElement?.content) {
                return metaElement.content;
            }

            // Method 2: URL hash
            const hashParams = new URLSearchParams(window.location.hash.slice(1));
            const hashSessionId = hashParams.get('sid');
            if (hashSessionId) {
                return hashSessionId;
            }

            // Method 3: Inline scripts
            const inlineScripts = document.querySelectorAll('script:not([src])');
            for (const script of inlineScripts) {
                const scriptContent = script.textContent;
                const sessionIdMatch = scriptContent.match(/"sid"\s*:\s*"([^"]+)"/);
                if (sessionIdMatch?.[1] && sessionIdMatch[1].length > 10) {
                    return sessionIdMatch[1];
                }
            }

            // Method 4: Aura framework token (via injected element)
            const auraSessionElement = document.getElementById('sfschema-aura-session');
            if (auraSessionElement) {
                const auraSessionId = auraSessionElement.getAttribute('data-session');
                if (auraSessionId && auraSessionId !== 'null') {
                    return auraSessionId;
                }
            }

        } catch (error) {
            Utils.Logger.warn('[Session:Page] Session extraction from page failed', { error: error.message });
        }
        return null;
    }

    // Inject extraction script into the main page context
    /**
         * Injects the session extractor script into the page.
         */
    function injectSessionExtractor() {
        try {
            // Create a communication element if it doesn't exist
            if (!document.getElementById('sfschema-aura-session')) {
                const sessionElement = document.createElement('div');
                sessionElement.id = 'sfschema-aura-session';
                sessionElement.style.display = 'none';
                (document.head || document.documentElement).appendChild(sessionElement);
            }

            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('content/resources/session-extractor.js');
            script.onload = function () {
                this.remove();
            };
            (document.head || document.documentElement).appendChild(script);

            Utils.Logger.debug('[Session:Injector] Session extraction script injected');
        } catch (e) {
            Utils.Logger.error('[Session:Injector] Failed to inject session extractor', { error: e.message });
        }
    }

    // Export to namespace
    NS.Session = {
        getSessionId,
        injectSessionExtractor: injectSessionExtractor
    };

})(window.SFSchema);
