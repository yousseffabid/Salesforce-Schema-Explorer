/**
 * Salesforce Schema Explorer - UI Core
 * Handles loading states, error display, and basic controls.
 */

import { state, elements } from '../state.js';

// =============================================================================
// LOADING STATE
// =============================================================================

/**
 * Displays the empty state UI.
 */
export function showEmptyState() {
    elements.emptyState.classList.remove('hidden');
    elements.loading.classList.add('hidden');
    elements.error.classList.add('hidden');
    elements.cyContainer.classList.add('hidden');
    elements.legend.classList.add('hidden');
    if (elements.relationshipTabs) elements.relationshipTabs.classList.add('hidden');
    setControlsEnabled(false);
}

/**
 * Displays the loading state UI.
 */
export function showLoading() {
    elements.emptyState.classList.add('hidden');
    elements.loading.classList.remove('hidden');
    elements.error.classList.add('hidden');
    elements.cyContainer.classList.add('hidden');
    elements.legend.classList.add('hidden');
    if (elements.relationshipTabs) elements.relationshipTabs.classList.add('hidden');
}

/**
 * Displays an error message.
 * @param {string} message - The error message to display.
 */
export function showError(message) {
    elements.emptyState.classList.add('hidden');
    elements.loading.classList.add('hidden');
    elements.error.classList.remove('hidden');
    elements.cyContainer.classList.add('hidden');
    elements.legend.classList.add('hidden');
    if (elements.relationshipTabs) elements.relationshipTabs.classList.add('hidden');
    elements.errorMessage.textContent = message;
    setControlsEnabled(false);
}

/**
 * Displays the graph UI.
 */
export function showGraph() {
    elements.emptyState.classList.add('hidden');
    elements.loading.classList.add('hidden');
    elements.error.classList.add('hidden');
    elements.cyContainer.classList.remove('hidden');
    elements.legend.classList.remove('hidden');
    if (elements.relationshipTabs) elements.relationshipTabs.classList.remove('hidden');
    setControlsEnabled(true);
}

/**
 * Enables or disables graph control buttons.
 * @param {boolean} enabled - Whether controls should be enabled.
 */
export function setControlsEnabled(enabled) {
    elements.btnFit.disabled = !enabled;
    elements.btnCenter.disabled = !enabled;
    elements.btnLayout.disabled = !enabled;
}

/**
 * Signals the start of a background loading operation.
 */
export function startLoadingOperation() {
    state.activeLoadingOperations++;
    updateCacheStatusUI('loading');
}

/**
 * Signals the completion of a background loading operation.
 * @param {number|null} [timestamp=null] - Timestamp of the data loaded.
 * @param {boolean} [fromCache=false] - Whether data was from cache.
 */
export function completeLoadingOperation(timestamp = null, fromCache = false) {
    state.activeLoadingOperations = Math.max(0, state.activeLoadingOperations - 1);
    if (state.activeLoadingOperations === 0) {
        updateCacheStatusUI('loaded', timestamp || new Date().getTime(), fromCache);
    }
}

/**
 * Resets the loading operation counter.
 */
export function resetLoadingOperations() {
    state.activeLoadingOperations = 0;
}

/**
 * Updates the cache status indicator in the UI.
 * @param {string} status - 'loading', 'loaded', or 'error'.
 * @param {number|null} [timestamp=null] - Timestamp of the data.
 * @param {boolean} [fromCache=false] - Whether data was from cache.
 */
export function updateCacheStatusUI(status, timestamp = null, fromCache = false) {
    if (!elements.cacheStatus) return;

    switch (status) {
        case 'loading':
            elements.cacheStatus.innerHTML = '<span class="cache-status__indicator cache-status__indicator--loading"></span> Loading relationships...';
            elements.cacheStatus.title = 'Fetching relationship data from Salesforce';
            if (elements.cacheRefreshBtn) elements.cacheRefreshBtn.disabled = true;
            break;
        case 'loaded':
            const date = timestamp ? new Date(timestamp) : new Date();
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const finalStatus = fromCache ? 'Cached' : 'Fresh';
            elements.cacheStatus.innerHTML = `<span class="cache-status__indicator cache-status__indicator--loaded"></span> ${finalStatus}`;
            elements.cacheStatus.title = `Last updated: ${date.toLocaleDateString()} ${timeStr}`;
            if (elements.cacheRefreshBtn) elements.cacheRefreshBtn.disabled = false;
            break;
        case 'error':
            elements.cacheStatus.innerHTML = '<span class="cache-status__indicator cache-status__indicator--error"></span> Cache unavailable';
            elements.cacheStatus.title = 'Failed to load relationship cache';
            if (elements.cacheRefreshBtn) elements.cacheRefreshBtn.disabled = false;
            break;
    }
}
