/**
 * Salesforce Schema Explorer - URL Utilities
 */

window.SFSchema = window.SFSchema || {};

(function (NS) {
    'use strict';

    const Utils = NS.Utils;
    // Session module might be used in resolveCustomObjectId

    // ===========================================================================
    // CONFIGURATION CONSTANTS
    // ===========================================================================

    const SF_ID_PATTERN = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;
    const CUSTOM_OBJECT_KEY_PREFIX = '01I';
    const EXCLUDED_PATHS = [
        '/login',
        '/secur/logout',
        '/_ui/common/login'
    ];

    // ===========================================================================
    // STATE VARIABLES
    // ===========================================================================

    let isResolving = false;
    let cachedObjectInfo = null;
    let lastCheckedUrl = null;

    // ===========================================================================
    // URL PARSING
    // ===========================================================================

    /**
         * Determines if the floating button should be shown on the current page.
         * @returns {boolean} True if button should be shown.
         */
    function shouldShowButton() {
        // Must be on Salesforce domain
        if (!Utils.isSalesforceDomain()) {
            return false;
        }

        const pathname = window.location.pathname.toLowerCase();
        const fullUrl = window.location.href.toLowerCase();

        // Check if on an excluded path
        for (const excluded of EXCLUDED_PATHS) {
            if (pathname.includes(excluded.toLowerCase()) ||
                fullUrl.includes(excluded.toLowerCase())) {
                return false;
            }
        }

        // Must be in Lightning Experience
        if (!pathname.includes('/lightning/')) {
            return false;
        }

        // Show on home page
        if (pathname.includes('/lightning/page/home')) {
            return true;
        }

        // Show on object home/list
        if (/\/lightning\/o\/[^/]+/i.test(pathname)) {
            return true;
        }

        // Show on record pages
        if (/\/lightning\/r\/[^/]+/i.test(pathname)) {
            return true;
        }

        // Show on Object Manager pages
        if (/\/lightning\/setup\/objectmanager\/[^/]+/i.test(pathname)) {
            return true;
        }

        return false;
    }

    /**
         * Checks if the current page is the Lightning home page.
         * @returns {boolean} True if home page.
         */
    function isHomePage() {
        return window.location.pathname.toLowerCase().includes('/lightning/page/home');
    }

    /**
         * Parses the object list URL to extract object name.
         * @param {string} pathname - The URL pathname.
         * @returns {Object|null} Object info or null.
         */
    function parseObjectListUrl(pathname) {
        const objectMatch = pathname.match(/\/lightning\/o\/([^/]+)/i);
        if (!objectMatch) return null;

        const objectName = decodeURIComponent(objectMatch[1]);
        return {
            apiName: objectName,
            isCustom: objectName.endsWith('__c')
        };
    }

    /**
         * Parses the record URL to extract object name and record ID.
         * @param {string} pathname - The URL pathname.
         * @returns {Object|null} Object info or null.
         */
    function parseRecordUrl(pathname) {
        const recordMatch = pathname.match(/\/lightning\/r\/([^/]+)\/([a-zA-Z0-9]{15,18})/i);
        if (!recordMatch) return null;

        const objectName = decodeURIComponent(recordMatch[1]);
        const recordId = recordMatch[2];
        return {
            apiName: objectName,
            isCustom: objectName.endsWith('__c'),
            recordId
        };
    }

    /**
         * Parses the Object Manager URL to extract object name.
         * Resolves DurableId if present.
         * @param {string} pathname - The URL pathname.
         * @returns {Promise<Object|null>} Object info or null.
         */
    async function parseObjectManagerUrl(pathname) {
        const objectManagerMatch = pathname.match(/\/lightning\/setup\/ObjectManager\/([^/]+)/i);
        if (!objectManagerMatch) return null;

        const identifier = decodeURIComponent(objectManagerMatch[1]);

        if (identifier.toLowerCase() === 'home') {
            return null;
        }

        if (isCustomObjectId(identifier)) {
            Utils.Logger.debug('[URL:Parser] Identifier looks like DurableId, attempting to resolve', { identifier });
            const apiName = await resolveCustomObjectId(identifier);
            if (apiName) {
                Utils.Logger.debug('[URL:Parser] Resolved DurableId to API name', { apiName });
                return { apiName, isCustom: true };
            }
            Utils.Logger.warn('[URL:Parser] Failed to resolve DurableId to API name');
            return null;
        }

        return {
            apiName: identifier,
            isCustom: identifier.endsWith('__c')
        };
    }

    /**
         * Extracts object information from the current URL.
         * Uses caching to avoid redundant parsing.
         * @returns {Promise<Object|null>} Object info or null.
         */
    async function extractObjectInfo() {
        const pathname = window.location.pathname;

        Utils.Logger.debug('[URL:Extract] Extracting object info form URL', { pathname });

        if (isHomePage()) {
            Utils.Logger.debug('[URL:Extract] On home page - no object context');
            return null;
        }

        if (lastCheckedUrl === window.location.href && cachedObjectInfo) {
            Utils.Logger.debug('[URL:Extract] Returning cached object info', { object: cachedObjectInfo.apiName });
            return cachedObjectInfo;
        }

        lastCheckedUrl = window.location.href;

        const objectListInfo = parseObjectListUrl(pathname);
        if (objectListInfo) {
            cachedObjectInfo = objectListInfo;
            Utils.Logger.debug('[URL:Extract] Detected object from list view', { object: objectListInfo.apiName });
            return cachedObjectInfo;
        }

        const recordInfo = parseRecordUrl(pathname);
        if (recordInfo) {
            cachedObjectInfo = recordInfo;
            Utils.Logger.debug('[URL:Extract] Detected object from record page', { object: recordInfo.apiName, recordId: recordInfo.recordId });
            return cachedObjectInfo;
        }

        const objectManagerInfo = await parseObjectManagerUrl(pathname);
        if (objectManagerInfo) {
            cachedObjectInfo = objectManagerInfo;
            Utils.Logger.debug('[URL:Extract] Detected object from Object Manager', { object: objectManagerInfo.apiName });
            return cachedObjectInfo;
        }

        Utils.Logger.warn('[URL:Extract] Could not extract object info from URL', { pathname });
        cachedObjectInfo = null;
        return null;
    }

    /**
         * Checks if the identifier matches a custom object ID pattern.
         * @param {string} identifier - The identifier to check.
         * @returns {boolean} True if custom object ID.
         */
    function isCustomObjectId(identifier) {
        return (
            SF_ID_PATTERN.test(identifier) &&
            identifier.startsWith(CUSTOM_OBJECT_KEY_PREFIX)
        );
    }

    /**
         * Resolves a custom object ID to its API name via the background script.
         * @param {string} objectId - The custom object ID.
         * @returns {Promise<string|null>} API name or null.
         */
    async function resolveCustomObjectId(objectId) {
        if (isResolving) return null;
        isResolving = true;

        try {
            const authSessionId = NS.Session.getSessionId();

            return await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        action: 'resolveObjectId',
                        instanceUrl: Utils.getInstanceUrl(),
                        objectId: objectId,
                        sessionId: authSessionId,
                        isSetupDomain: Utils.isSetupDomain()
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (response?.success) {
                            resolve(response.apiName);
                        } else {
                            reject(new Error(response?.error || 'Resolution failed'));
                        }
                    }
                );
            });
        } catch (error) {
            Utils.Logger.error('[URL:Resolve] Failed to resolve object ID', { error: error.message });
            return null;
        } finally {
            isResolving = false;
        }
    }

    /**
         * Sets up a listener for URL changes (SPA navigation).
         * @param {Function} onUrlChange - Callback function.
         */
    function setupNavigationListener(onUrlChange) {
        let lastUrl = location.href;

        // MutationObserver to watch for DOM changes (SPA navigation)
        const observer = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;

                // Reset cache
                cachedObjectInfo = null;
                lastCheckedUrl = null;

                // Notify callback
                if (onUrlChange && typeof onUrlChange === 'function') {
                    // Delay allows Salesforce to finish rendering
                    setTimeout(onUrlChange, 300);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        window.addEventListener('popstate', () => {
            cachedObjectInfo = null;
            lastCheckedUrl = null;
            if (onUrlChange && typeof onUrlChange === 'function') {
                setTimeout(onUrlChange, 300);
            }
        });
    }

    // Export to namespace
    NS.Url = {
        shouldShowButton,
        extractObjectInfo,
        setupNavigationListener
    };

})(window.SFSchema);
