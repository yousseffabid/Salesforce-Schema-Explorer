/**
 * Salesforce Schema Explorer - Content Utilities
 */

// Establish namespace
window.SFSchema = window.SFSchema || {};

(function (NS) {
    'use strict';

    // ===========================================================================
    // DEBUG CONFIGURATION
    // ===========================================================================

    const DEBUG = true;

    const Logger = {
        /** Detailed diagnostic output for development only. */
        debug: (...args) => {
            if (DEBUG) console.debug('[SF Schema Explorer]', ...args);
        },

        /** High-level lifecycle events. */
        info: (...args) => {
            if (DEBUG) console.info('[SF Schema Explorer]', ...args);
        },

        /** Degraded behavior, fallbacks. */
        warn: (...args) => {
            if (DEBUG) console.warn('[SF Schema Explorer]', ...args);
        },

        /** Failures that break functionality. */
        error: (...args) => {
            console.error('[SF Schema Explorer]', ...args);
        }
    };

    // ===========================================================================
    // DOMAIN & URL UTILITIES
    // ===========================================================================

    /**
         * Checks if the current page is on a Salesforce domain.
         * @returns {boolean} True if Salesforce domain.
         */
    function isSalesforceDomain() {
        const hostname = window.location.hostname.toLowerCase();
        return (
            hostname.includes('.salesforce.com') ||
            hostname.includes('.force.com') ||
            hostname.includes('.salesforce-setup.com')
        );
    }

    /**
         * Checks if the current page is a setup domain.
         * @returns {boolean} True if setup domain.
         */
    function isSetupDomain() {
        return window.location.hostname.includes('salesforce-setup.com');
    }

    /**
         * Gets the normalized instance URL.
         * @returns {string} Instance URL.
         */
    function getInstanceUrl() {
        const hostname = window.location.hostname;
        // Setup domain: convert to main salesforce.com domain
        if (hostname.includes('.salesforce-setup.com')) {
            return window.location.origin.replace('.salesforce-setup.com', '.salesforce.com');
        }
        return window.location.origin;
    }

    // ===========================================================================
    // UI HELPERS
    // ===========================================================================

    /**
         * Shows a temporary notification on the UI.
         * @param {string} message - The message to display.
         * @param {string} [type='info'] - The type of notification (info/error).
         */
    function showNotification(message, type = 'info') {
        const existing = document.getElementById('sfschema-notification');
        if (existing) {
            existing.remove();
        }

        const notification = document.createElement('div');
        notification.id = 'sfschema-notification';
        notification.className = `sfschema-notification sfschema-notification--${type}`;
        notification.setAttribute('role', 'alert');
        notification.textContent = message;

        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.add('sfschema-notification--visible');
        });

        setTimeout(() => {
            notification.classList.remove('sfschema-notification--visible');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    // Export to namespace
    NS.Utils = {
        DEBUG,
        Logger,
        isSalesforceDomain,
        isSetupDomain,
        getInstanceUrl,
        showNotification
    };

})(window.SFSchema);
