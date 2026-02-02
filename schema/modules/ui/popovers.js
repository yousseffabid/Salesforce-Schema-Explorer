/**
 * Salesforce Schema Explorer - UI Popovers
 * Handles Object and Relationship popovers.
 */

import { state, elements } from '../state.js';
import { escapeHtml, logger } from '../utils.js';
import { getObjectManagerUrl } from '../data.js';
import { isObjectExcluded } from '../excludedObjects.js';
import { refreshGraphVisibility } from '../graph.js';
import {
    updateRelationshipTabs,
    updateObjectsCount,
    getRelatedObjectsList,
    getActiveRelationships
} from './legend.js';

// =============================================================================
// OBJECT POPOVER
// =============================================================================

/**
 * Shows the Object Popover for selecting/excluding objects.
 */
export function showObjectPopover() {
    // TOGGLE LOGIC: If already visible AND title implies it's the Object list, close it.
    if (!elements.relationshipPopover.classList.contains('hidden') &&
        elements.popoverTitle.textContent.includes('Objects')) {
        hideRelationshipPopover();
        return;
    }

    // Get ALL objects (Visible + Excluded)
    const objects = getRelatedObjectsList(true);
    if (objects.length === 0) return;

    // Initialize selection from current user exclusions
    state.objectPopoverSelection = new Set(state.userExcludedObjects);

    const totalCount = objects.length;
    const visibleCount = objects.filter(obj =>
        !state.userExcludedObjects.has(obj) && !isObjectExcluded(obj)
    ).length;

    elements.popoverTitle.textContent = `Objects (${visibleCount}/${totalCount})`;

    // Build popover content
    const headerHtml = `
        <div class="popover-search">
            <svg class="popover-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <input type="text" class="popover-search__input" placeholder="Search objects..." id="popover-object-search">
        </div>
        <div class="popover-actions">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                <input type="checkbox" id="popover-select-all"> Select All 
                <span id="popover-selected-count" class="popover-selected-count"></span>
            </label>
            <button id="popover-save-btn" class="btn btn--brand btn--xs">Save Changes</button>
        </div>
    `;

    const listHtml = objects.map(objectName => {
        const metadata = state.metadata.get(objectName);
        const label = metadata?.label || objectName;
        const isSystemExcluded = isObjectExcluded(objectName);
        const isUserExcluded = state.userExcludedObjects.has(objectName);
        const isIncluded = !isSystemExcluded && !isUserExcluded;

        return `
        <div class="obj-item ${isSystemExcluded ? 'obj-item--disabled' : ''}" 
             data-name="${objectName.toLowerCase()}" 
             data-label="${label.toLowerCase()}">
            <div class="obj-item__checkbox">
                <input type="checkbox" 
                       class="obj-checkbox" 
                       data-id="${escapeHtml(objectName)}"
                       ${isIncluded ? 'checked' : ''}
                       ${isSystemExcluded ? 'disabled' : ''}
                       title="${isSystemExcluded ? 'Excluded by extension' : ''}">
            </div>
            <div class="obj-item__info">
                <div class="obj-item__label">${escapeHtml(label)}</div>
                <div class="obj-item__api">${escapeHtml(objectName)}</div>
            </div>
            ${isSystemExcluded ? '<span class="obj-item__badge">System</span>' : ''}
        </div>`;
    }).join('');

    elements.popoverBody.innerHTML = headerHtml + '<div class="popover-list">' + listHtml + '</div>';

    elements.relationshipPopover.classList.remove('hidden');

    // Reset scroll position (wrapped in RAF to ensure layout is ready)
    requestAnimationFrame(() => {
        elements.popoverBody.scrollTop = 0;
        const list = elements.popoverBody.querySelector('.popover-list');
        if (list) list.scrollTop = 0;

        // Focus search input
        const searchInput = document.getElementById('popover-object-search');
        if (searchInput) searchInput.focus();
    });

    // Attach event listeners
    attachObjectPopoverListeners(objects);
}

function attachObjectPopoverListeners(objects) {
    const selectAllCb = document.getElementById('popover-select-all');
    const saveBtn = document.getElementById('popover-save-btn');
    const searchInput = document.getElementById('popover-object-search');
    const selectedCountSpan = document.getElementById('popover-selected-count');
    const checkboxes = Array.from(elements.popoverBody.querySelectorAll('.obj-checkbox:not(:disabled)'));
    const allItems = Array.from(elements.popoverBody.querySelectorAll('.obj-item'));

    // Update Select All state & Count based on VISIBLE checkboxes
    const updateUIState = () => {
        // Only consider currently visible checkboxes for "Select All" state
        const visibleItems = allItems.filter(item => !item.classList.contains('hidden'));
        const visibleCheckboxes = visibleItems
            .map(item => item.querySelector('.obj-checkbox'))
            .filter(cb => !cb.disabled);

        if (visibleCheckboxes.length > 0) {
            const visibleChecked = visibleCheckboxes.filter(cb => cb.checked).length;
            const isAllVisibleChecked = visibleChecked === visibleCheckboxes.length;

            selectAllCb.checked = isAllVisibleChecked && visibleChecked > 0;
            selectAllCb.indeterminate = visibleChecked > 0 && !isAllVisibleChecked;
            selectAllCb.disabled = false;
        } else {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
            selectAllCb.disabled = true;
        }

        const allCheckedCount = checkboxes.filter(cb => cb.checked).length;
        selectedCountSpan.textContent = `(${allCheckedCount} selected)`;
    };

    updateUIState();

    // Search Listener
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        allItems.forEach(item => {
            const name = item.dataset.name;
            const label = item.dataset.label;

            if (label.includes(query) || name.includes(query)) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });

        updateUIState();
    });

    // Checkbox change listener
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                state.objectPopoverSelection.delete(cb.dataset.id);
            } else {
                state.objectPopoverSelection.add(cb.dataset.id);
            }
            updateUIState();
        });
    });

    // Select All listener
    selectAllCb.addEventListener('change', () => {
        const isChecked = selectAllCb.checked;

        // Only affect VISIBLE checkboxes
        const visibleItems = allItems.filter(item => !item.classList.contains('hidden'));

        visibleItems.forEach(item => {
            const cb = item.querySelector('.obj-checkbox');
            if (cb && !cb.disabled) {
                cb.checked = isChecked;
                if (isChecked) {
                    state.objectPopoverSelection.delete(cb.dataset.id); // Remove from exclusion = Include
                } else {
                    state.objectPopoverSelection.add(cb.dataset.id); // Add to exclusion = Exclude
                }
            }
        });

        updateUIState();
    });

    // Save button listener
    saveBtn.addEventListener('click', handleObjectPopoverSave);
}

async function handleObjectPopoverSave() {
    // Calculate changes for feedback
    const added = [...state.objectPopoverSelection].filter(id => !state.userExcludedObjects.has(id));
    const removed = [...state.userExcludedObjects].filter(id => !state.objectPopoverSelection.has(id));

    // Update state atomically
    state.userExcludedObjects = new Set(state.objectPopoverSelection);

    // Persist changes
    const { saveObjectExclusions } = await import('../storage.js');
    saveObjectExclusions(state.objectApiName, state.userExcludedObjects);

    // Refresh the graph
    refreshGraphVisibility(); // This rebuilds the graph

    // Explicitly update UI counts to reflect new exclusions
    updateRelationshipTabs();
    updateObjectsCount();

    hideRelationshipPopover();

    // Show feedback (brief, non-blocking)
    const feedbackParts = [];
    if (removed.length > 0) feedbackParts.push(`${removed.length} included`);
    if (added.length > 0) feedbackParts.push(`${added.length} excluded`);

    if (feedbackParts.length > 0) {
        logger.info('[Popovers:save] User updated exclusions', { detail: feedbackParts.join(', ') });
    }
}

/**
 * Hides the relationship/object popover.
 */
export function hideRelationshipPopover() {
    elements.relationshipPopover.classList.add('hidden');
}

// =============================================================================
// RELATIONSHIP POPOVER
// =============================================================================

function renderRelationshipPopoverItem(relationship) {
    const isOutgoing = relationship.sourceObject === state.objectApiName;
    const directionIcon = isOutgoing ? '→' : '←';
    const targetOrSource = isOutgoing ? relationship.targetObject : relationship.sourceObject;
    const directionTitle = isOutgoing ? 'references' : 'referenced by';
    const typeLabel = relationship.isMasterDetail ? 'Master-Detail' : 'Lookup';

    return `
    <div class="rel-item">
      <div class="rel-item__info">
        <div class="rel-item__label">
          <span class="rel-item__direction" title="${directionTitle}">${directionIcon}</span>
          ${escapeHtml(relationship.fieldLabel || relationship.fieldName)}
        </div>
        <div class="rel-item__api">${escapeHtml(targetOrSource)} · ${typeLabel}</div>
      </div>
      <a href="${getObjectManagerUrl(targetOrSource)}" target="_blank" rel="noopener noreferrer" 
         class="rel-item__link" title="Open in Object Manager">↗</a>
    </div>
  `;
}

/**
 * Shows the Relationship Popover for a specific type (Lookup/Master-Detail).
 * @param {string} type - 'lookup' or 'masterDetail'.
 */
export function showRelationshipPopover(type) {
    const titleType = type === 'lookup' ? 'Lookup Relationships' : 'Master-Detail Relationships';

    // TOGGLE LOGIC: If already visible AND title matches, close it.
    if (!elements.relationshipPopover.classList.contains('hidden') &&
        elements.popoverTitle.textContent.includes(titleType.split(' ')[0])) { // Simple check
        hideRelationshipPopover();
        return;
    }

    const activeRelationships = getActiveRelationships(); // Only active (visible) relationships
    let relationships = type === 'lookup' ? activeRelationships.lookup : activeRelationships.masterDetail;

    // Filter by visibility (must match the Count logic)
    relationships = relationships.filter(rel => {
        const partner = rel.targetObject === state.objectApiName ? rel.sourceObject : rel.targetObject;
        if (!partner || partner === state.objectApiName) return false;

        return !state.userExcludedObjects.has(partner) && !isObjectExcluded(partner);
    });

    if (relationships.length === 0) return;

    elements.popoverTitle.textContent = `${titleType} (${relationships.length})`;

    const listHtml = relationships
        .map(rel => renderRelationshipPopoverItem(rel))
        .join('');

    elements.popoverBody.innerHTML = '<div class="popover-list">' + listHtml + '</div>';

    elements.relationshipPopover.classList.remove('hidden');

    // Reset scroll position (wrapped in RAF to ensure layout is ready)
    requestAnimationFrame(() => {
        elements.popoverBody.scrollTop = 0;
        const list = elements.popoverBody.querySelector('.popover-list');
        if (list) list.scrollTop = 0;
    });
}
