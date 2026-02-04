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

        return null;
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
