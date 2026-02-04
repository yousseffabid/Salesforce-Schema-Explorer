/**
 * Salesforce Schema Explorer - Simple Session Module
 * Requests session ID from background script (reliable method)
 */

window.SFSchema = window.SFSchema || {};

(function(NS) {
    'use strict';

    const Utils = NS.Utils;

    /**
     * Get session ID from background script (primary) or injected fallback (secondary)
     * Background script has access to cookies API - most reliable.
     * Injected fallback handles Lightning edge cases where cookies aren't accessible.
     */
    async function getSessionId() {
        // 1. Try background script (Cookie-based)
        try {
            const instanceUrl = Utils.getInstanceUrl();
            if (instanceUrl) {
                const response = await chrome.runtime.sendMessage({
                    action: 'getSessionId',
                    instanceUrl: instanceUrl
                });

                if (response?.success && response.sessionId) {
                    Utils.Logger.debug('[Session] Found via background');
                    return response.sessionId;
                }
            }
        } catch (error) {
            Utils.Logger.warn('[Session] Background request failed', { error: error.message });
        }

        // 2. Fallback: Try UserContext/Aura (Lightning edge cases)
        const injectedId = await getSessionIdFromInjectedScript();
        if (injectedId) {
            Utils.Logger.debug('[Session] Found via injected UserContext');
            return injectedId;
        }

        return null;
    }

    /**
     * Injects a script to steal window.UserContext.sessionId.
     * This is the fallback for Lightning edge cases.
     */
    async function getSessionIdFromInjectedScript() {
        return new Promise((resolve) => {
            // Create communication element
            let sessionElement = document.getElementById('sfschema-aura-session');
            if (!sessionElement) {
                sessionElement = document.createElement('div');
                sessionElement.id = 'sfschema-aura-session';
                sessionElement.style.display = 'none';
                (document.head || document.documentElement).appendChild(sessionElement);
            }

            // Listen for the custom event
            const onReady = () => {
                const sid = sessionElement.getAttribute('data-session');
                sessionElement.removeEventListener('SFAuraSessionReady', onReady);
                resolve(sid !== 'null' ? sid : null);
            };
            sessionElement.addEventListener('SFAuraSessionReady', onReady);

            // Inject the extractor
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('content/resources/session-extractor.js');
            script.onload = () => script.remove();
            (document.head || document.documentElement).appendChild(script);

            // Timeout after 1 second
            setTimeout(() => {
                sessionElement.removeEventListener('SFAuraSessionReady', onReady);
                resolve(null);
            }, 1000);
        });
    }

    /**
     * Initialize session module
     */
    async function initialize() {
        Utils.Logger.debug('[Session] Session module initialized');
    }

    // Export to namespace
    NS.Session = {
        getSessionId,
        initialize
    };

})(window.SFSchema);
