/**
 * Salesforce Schema Explorer - Event Listeners
 */

import { elements, state } from './state.js';
import {
    handleSearchInput,
    handleSearchKeydown,
    clearSearch,
    hideSearchDropdown
} from './search.js';
import {
    fitGraph,
    centerOnMain,
    resetLayout
} from './graph.js';
import {
    hideDetailsPanel,
    hideRelationshipPopover,
    showObjectPopover,
    showRelationshipPopover,
    openFilterDropdown,
    closeFilterDropdown as uiCloseFilterDropdown,
    applyFilters
} from './ui.js';

/**
 * Sets up all event listeners for the UI.
 * @param {Object} callbacks - Object containing callback functions for various events.
 * @param {Function} callbacks.onLoadObjectSchema - Callback to load object schema.
 * @param {Function} callbacks.onSwitchRelationshipView - Callback to switch relationship view.
 * @param {Function} callbacks.onRefreshCache - Callback to refresh cache.
 */
export function setupEventListeners(callbacks) {
    const {
        onLoadObjectSchema,
        onSwitchRelationshipView,
        onRefreshCache
    } = callbacks;

    // Object Search
    let searchTimeout;
    elements.objectSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => handleSearchInput(onLoadObjectSchema), 150);
    });

    elements.objectSearchInput.addEventListener('keydown', (e) => handleSearchKeydown(e, onLoadObjectSchema));

    elements.objectSearchInput.addEventListener('focus', () => {
        if (elements.objectSearchInput.value.length >= 2) handleSearchInput(onLoadObjectSchema);
    });

    elements.objectSearchClear.addEventListener('click', clearSearch);

    // Graph Controls
    elements.btnFit.addEventListener('click', fitGraph);
    elements.btnCenter.addEventListener('click', centerOnMain);
    elements.btnLayout.addEventListener('click', resetLayout);
    elements.retryBtn.addEventListener('click', () => {
        if (state.objectApiName) onLoadObjectSchema(state.objectApiName);
    });

    // See Objects Button
    const seeObjectsBtn = document.getElementById('see-objects-btn');
    if (seeObjectsBtn) {
        seeObjectsBtn.addEventListener('click', () => {
            hideDetailsPanel();
            showObjectPopover();
        });
    }

    // Legend counts - clicking opens relationship popover for that type
    elements.lookupCount.addEventListener('click', () => {
        hideDetailsPanel();
        showRelationshipPopover('lookup');
    });
    elements.mdCount.addEventListener('click', () => {
        hideDetailsPanel();
        showRelationshipPopover('masterDetail');
    });

    // Relationship Tabs
    if (elements.tabOutgoing) elements.tabOutgoing.addEventListener('click', () => onSwitchRelationshipView('outgoing'));
    if (elements.tabIncoming) elements.tabIncoming.addEventListener('click', () => onSwitchRelationshipView('incoming'));
    if (elements.tabAll) elements.tabAll.addEventListener('click', () => onSwitchRelationshipView('all'));

    // Cache Refresh
    if (elements.cacheRefreshBtn) {
        elements.cacheRefreshBtn.addEventListener('click', async () => {
            await onRefreshCache();
        });
    }

    // UI Interactions
    elements.popoverClose.addEventListener('click', hideRelationshipPopover);
    elements.detailsClose.addEventListener('click', hideDetailsPanel);

    let fieldSearchTimeout;
    elements.fieldSearch.addEventListener('input', () => {
        clearTimeout(fieldSearchTimeout);
        fieldSearchTimeout = setTimeout(applyFilters, 200);
    });

    elements.typeFilterTrigger.addEventListener('click', e => {
        e.stopPropagation();
        state.filterDropdownOpen ? uiCloseFilterDropdown() : openFilterDropdown();
    });

    // Global Clicks
    document.addEventListener('click', e => {
        if (state.filterDropdownOpen && !elements.typeFilterMenu.contains(e.target) && !elements.typeFilterTrigger.contains(e.target)) {
            uiCloseFilterDropdown();
        }

        if (state.searchDropdownOpen && !elements.objectSearchResults.contains(e.target) && !elements.objectSearchInput.contains(e.target)) {
            hideSearchDropdown();
        }

        // Close popover when clicking outside
        const seeObjectsBtn = document.getElementById('see-objects-btn');
        if (!elements.relationshipPopover.contains(e.target) &&
            e.target !== elements.lookupCount &&
            e.target !== elements.mdCount &&
            (!seeObjectsBtn || !seeObjectsBtn.contains(e.target))) {
            hideRelationshipPopover();
        }
    });

    // Global Keydown
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            hideDetailsPanel();
            hideRelationshipPopover();
            uiCloseFilterDropdown();
            hideSearchDropdown();
        }
    });

    // Window Resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (state.cy) {
                state.cy.resize();
                state.cy.fit(50);
            }

            // Auto-close popover if it becomes too small to be useful
            const popover = document.getElementById('relationship-popover');
            if (popover && !popover.classList.contains('hidden')) {
                if (popover.offsetHeight < 200) {
                    hideRelationshipPopover();
                }
            }
        }, 250);
    });
}
