/**
 * Salesforce Schema Explorer - Content Script Entry Point
 * Orchestrates the initialization of the content script using modular components.
 */

(function () {
  'use strict';

  // Namespace references
  const NS = window.SFSchema || {};
  const Utils = NS.Utils;
  const Session = NS.Session;
  const Url = NS.Url;
  const UI = NS.UI;

  if (!Utils || !Session || !Url || !UI) {
    console.error('[SF Schema Explorer] Critical Error: Modules failed to load.');
    return;
  }

  // ===========================================================================
  // INJECTION GUARD
  // ===========================================================================

  if (window.sfSchemaExplorerInjected) {
    Utils.Logger.debug('[Content:Guard] Content script already injected, skipping');
    return;
  }
  window.sfSchemaExplorerInjected = true;

  // ===========================================================================
  // MESSAGE HANDLING
  // ===========================================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'togglePanel') {
      // Simulate a button click
      UI.handleButtonClick(new Event('click'));
      sendResponse({ success: true });
    }
    return true; // Keep channel open for async response
  });

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
     * Initializes the content script.
     * verfies domain, injects extractor, sets up UI and listeners.
     */
  function init() {
    // Verify we're on a Salesforce domain
    if (!Utils.isSalesforceDomain()) {
      Utils.Logger.debug('[Content:Init] Not a Salesforce domain, exiting');
      return;
    }

    // Inject session extractor
    Session.injectSessionExtractor();

    // Create button if on a valid page
    UI.updateButtonVisibility();

    // Set up navigation listeners
    // Pass the UI update function as callback for URL changes
    Url.setupNavigationListener(() => {
      UI.updateButtonVisibility();
    });

    Utils.Logger.info('[Content:Init] Content script initialized');
  }

  // ===========================================================================
  // ENTRY POINT
  // ===========================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }

})();
