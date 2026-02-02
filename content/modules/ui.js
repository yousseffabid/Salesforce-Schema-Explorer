/**
 * Salesforce Schema Explorer - UI Components
 */

window.SFSchema = window.SFSchema || {};

(function (NS) {
    'use strict';

    const Utils = NS.Utils;
    const Url = NS.Url;
    const Session = NS.Session;

    let floatingButton = null;

    /**
         * Creates and injects the floating button into the DOM.
         * @returns {HTMLElement} The created button element.
         */
    function createFloatingButton() {
        const existing = document.getElementById('sfschema-floating-btn');
        if (existing) {
            existing.remove();
        }

        const button = document.createElement('button');
        button.id = 'sfschema-floating-btn';
        button.className = 'sfschema-floating-btn';
        button.setAttribute('aria-label', 'Open SF Schema Explorer');
        button.setAttribute('title', 'Explore object schema and relationships');
        button.innerHTML = `<span class="sfschema-btn-icon">🔗</span>`;

        button.addEventListener('click', handleButtonClick);
        document.body.appendChild(button);

        return button;
    }

    /**
         * Updates the visibility of the floating button based on the current URL.
         */
    function updateButtonVisibility() {
        if (!floatingButton) {
            if (Url.shouldShowButton()) {
                floatingButton = createFloatingButton();
            }
            return;
        }

        if (Url.shouldShowButton()) {
            floatingButton.classList.remove('sfschema-hidden');
        } else {
            floatingButton.classList.add('sfschema-hidden');
        }
    }

    /**
         * Handles the click event on the floating button.
         * Extracts context and sends message to open schema explorer.
         * @param {Event} event - The click event.
         */
    async function handleButtonClick(event) {
        if (event && event.preventDefault) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (!floatingButton && event.target !== floatingButton) {
            // If called programmatically without button, might need handling
            // But logic below assumes floatingButton exists for loading state
        }

        if (floatingButton) {
            floatingButton.disabled = true;
            floatingButton.classList.add('sfschema-loading');
        }

        Utils.Logger.info('[UI:Button] User clicked floating button');

        try {
            Utils.Logger.debug('[UI:Context] Extracting object context from current page');
            const objectInfo = await Url.extractObjectInfo();

            if (objectInfo) {
                Utils.Logger.info('[UI:Context] Found object context', { object: objectInfo.apiName });
            } else {
                Utils.Logger.info('[UI:Context] No object context found - opening with empty state');
            }

            Utils.Logger.debug('[UI:Message] Sending openSchemaTab message to background');
            const instanceUrl = Utils.getInstanceUrl();
            const sessionId = Session.getSessionId();
            const isSetupDomain = Utils.isSetupDomain();

            Utils.Logger.debug('[UI:MessagePayload]', { instanceUrl, objectApiName: objectInfo?.apiName || 'null' });

            chrome.runtime.sendMessage({
                action: 'openSchemaTab',
                instanceUrl: instanceUrl,
                objectApiName: objectInfo?.apiName || null,
                sessionId: sessionId,
                isSetupDomain: isSetupDomain
            }, (response) => {
                if (chrome.runtime.lastError) {
                    Utils.Logger.error('[UI:Message] Error sending message', { error: chrome.runtime.lastError.message });
                    Utils.showNotification('Failed to open schema explorer. Please try again.', 'error');
                } else {
                    Utils.Logger.debug('[UI:Message] Message sent successfully');
                }
            });

        } catch (error) {
            Utils.Logger.error('[UI:Click] Error handling button click', { error: error.message });
            Utils.showNotification('Failed to open schema explorer. Please try again.', 'error');
        } finally {
            if (floatingButton) {
                floatingButton.disabled = false;
                floatingButton.classList.remove('sfschema-loading');
            }
        }
    }

    // Export to namespace
    NS.UI = {
        createFloatingButton,
        updateButtonVisibility,
        handleButtonClick
    };

})(window.SFSchema);
