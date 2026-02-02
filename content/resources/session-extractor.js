/**
 * Salesforce Schema Explorer - Session Extractor
 * Extracts session ID from window context.
 */
(function () {
    'use strict';

    /**
     * Extracts Aure session ID from window context.
     * @returns {string|null} Session ID or null.
     */
    function extractAuraSession() {
        try {
            // Try to access Aura framework code via UserContext
            // This runs in the main page context (world: MAIN)
            if (window.UserContext && window.UserContext.sessionId) {
                return window.UserContext.sessionId;
            }

            // Try accessing standard Salesforce SFDCSession variable
            if (window.SFDCSessionVars && window.SFDCSessionVars.oid && window.SFDCSessionVars.uid && window.SFDCSessionVars.sid) {
                return window.SFDCSessionVars.sid;
            }

            return null;
        } catch (e) {
            console.error('[SF Schema Explorer] Extraction error:', e);
            return null;
        }
    }

    const sessionId = extractAuraSession();

    // Communicate back to content script via DOM (hidden element or event)
    // Using a hidden element regarding the read implementation in session.js
    const sessionElement = document.getElementById('sfschema-aura-session');
    if (sessionElement) {
        if (sessionId) {
            sessionElement.setAttribute('data-session', sessionId);
            // Dispatch event to notify content script
            sessionElement.dispatchEvent(new CustomEvent('SFAuraSessionReady'));
        } else {
            sessionElement.setAttribute('data-session', 'null');
        }
    }
})();
