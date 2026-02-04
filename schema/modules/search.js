/**
 * Salesforce Schema Explorer - Object Search
 */

import { state, elements } from './state.js';
import { escapeHtml } from './utils.js';
import { showEmptyState, hideDetailsPanel, hideRelationshipPopover } from './ui.js';

// Global from excludedObjects.js
const isObjectExcluded = window.isObjectExcluded || (() => false);

/**
 * Filters the list of objects based on a query string.
 * Uses exact match, starts-with, and contains logic.
 * @param {string} query - The search query.
 * @returns {Array<Object>} List of matching objects.
 */
export function filterObjects(query) {
    if (!query || query.length < 2) return [];

    const lowerQuery = query.toLowerCase();
    const exactMatches = [], startsWithMatches = [], containsMatches = [];

    for (const obj of state.allObjects) {
        if (isObjectExcluded(obj.name)) continue;

        const lowerLabel = obj.label.toLowerCase();
        const lowerName = obj.name.toLowerCase();

        if (lowerLabel === lowerQuery || lowerName === lowerQuery) {
            exactMatches.push(obj);
        } else if (lowerLabel.startsWith(lowerQuery) || lowerName.startsWith(lowerQuery)) {
            startsWithMatches.push(obj);
        } else if (lowerLabel.includes(lowerQuery) || lowerName.includes(lowerQuery)) {
            containsMatches.push(obj);
        }
    }

    return [...exactMatches, ...startsWithMatches, ...containsMatches];
}

/**
 * Renders the search results into the dropdown.
 * @param {Array<Object>} results - The list of matching objects.
 * @param {Function} onLoadSchema - Callback when an object is selected.
 */
export function renderSearchResults(results, onLoadSchema) {
    if (results.length === 0) {
        elements.objectSearchResults.innerHTML = '<div class="object-search__no-results">No objects found</div>';
        return;
    }

    elements.objectSearchResults.innerHTML = results.map((obj, index) => `
    <div class="object-search__item ${obj.custom ? 'object-search__item--custom' : ''}"
         data-api-name="${escapeHtml(obj.name)}" data-index="${index}" role="option"
         aria-selected="${index === state.activeSearchIndex}">
      <span class="object-search__item-label">${escapeHtml(obj.label)}</span>
      <span class="object-search__item-api">${escapeHtml(obj.name)}</span>
    </div>
  `).join('');

    elements.objectSearchResults.querySelectorAll('.object-search__item').forEach(item => {
        item.addEventListener('click', () => selectObject(item.dataset.apiName, onLoadSchema));
    });
}

/**
 * Shows the search dropdown.
 */
export function showSearchDropdown() {
    state.searchDropdownOpen = true;
    elements.objectSearchResults.classList.remove('hidden');
}

/**
 * Hides the search dropdown and resets selection index.
 */
export function hideSearchDropdown() {
    state.searchDropdownOpen = false;
    elements.objectSearchResults.classList.add('hidden');
    state.activeSearchIndex = -1;
}

/**
 * Selects an object from the search results.
 * @param {string} apiName - The API name of the selected object.
 * @param {Function} onLoadSchema - Callback to load the object schema.
 */
export function selectObject(apiName, onLoadSchema) {
    const obj = state.allObjects.find(o => o.name === apiName);
    if (obj) {
        elements.objectSearchInput.value = obj.label;
        elements.objectSearchClear.classList.remove('hidden');
    }
    hideSearchDropdown();
    if (onLoadSchema) onLoadSchema(apiName);
}

/**
 * Handles input events on the search box.
 * @param {Function} onLoadSchema - Callback for selection.
 */
export function handleSearchInput(onLoadSchema) {
    const query = elements.objectSearchInput.value.trim();

    if (query.length === 0) {
        elements.objectSearchClear.classList.add('hidden');
        hideSearchDropdown();
        clearSchema();
        return;
    }

    elements.objectSearchClear.classList.remove('hidden');
    if (query.length < 2) {
        hideSearchDropdown();
        return;
    }

    const results = filterObjects(query);
    state.activeSearchIndex = -1;
    renderSearchResults(results, onLoadSchema);
    showSearchDropdown();
}

/**
 * Handles keyboard navigation within the search dropdown.
 * @param {KeyboardEvent} event - The keydown event.
 * @param {Function} onLoadSchema - Callback for selection.
 */
export function handleSearchKeydown(event, onLoadSchema) {
    if (!state.searchDropdownOpen) return;

    const items = elements.objectSearchResults.querySelectorAll('.object-search__item');

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            state.activeSearchIndex = Math.min(state.activeSearchIndex + 1, items.length - 1);
            updateActiveSearchItem(items);
            break;
        case 'ArrowUp':
            event.preventDefault();
            state.activeSearchIndex = Math.max(state.activeSearchIndex - 1, 0);
            updateActiveSearchItem(items);
            break;
        case 'Enter':
            event.preventDefault();
            if (state.activeSearchIndex >= 0 && items[state.activeSearchIndex]) {
                selectObject(items[state.activeSearchIndex].dataset.apiName, onLoadSchema);
            }
            break;
        case 'Escape':
            hideSearchDropdown();
            break;
    }
}

/**
 * Updates the visual active state of search items based on selection index.
 * @param {NodeList} items - List of search result elements.
 */
export function updateActiveSearchItem(items) {
    items.forEach((item, index) => {
        item.classList.toggle('object-search__item--active', index === state.activeSearchIndex);
        item.setAttribute('aria-selected', index === state.activeSearchIndex);
        if (index === state.activeSearchIndex) item.scrollIntoView({ block: 'nearest' });
    });
}

/**
 * Clears the search input and results.
 */
export function clearSearch() {
    elements.objectSearchInput.value = '';
    elements.objectSearchClear.classList.add('hidden');
    hideSearchDropdown();
    clearSchema();
}

/**
 * Clears the currently loaded schema and resets the state to empty.
 */
export function clearSchema() {
    if (state.cy) {
        state.cy.destroy();
        state.cy = null;
    }

    state.objectApiName = null;
    state.relationships = { outgoing: { lookup: [], masterDetail: [] }, incoming: { lookup: [], masterDetail: [] } };
    state.excludedRelationships = { outgoing: { lookup: [], masterDetail: [] }, incoming: { lookup: [], masterDetail: [] } };

    hideDetailsPanel();
    hideRelationshipPopover();
    showEmptyState();
    document.title = 'SF Schema Explorer';
}
