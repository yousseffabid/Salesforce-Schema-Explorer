/**
 * Salesforce Schema Explorer - UI Filters
 * Handles field filtering logic and UI.
 */

import { state, elements } from '../state.js';
import { escapeHtml } from '../utils.js';
import {
    getFieldTypeCategory,
    isRequiredField,
    isCalculatedField,
    isRestrictedPicklist
} from '../data.js';
import { renderFields } from './details.js';

// =============================================================================
// FIELDS & FILTERING
// =============================================================================

function createFilterOption(value, label, special = null) {
    const specialAttr = special ? ` data-special="${escapeHtml(special)}"` : '';
    return `
    <div class="type-filter__option" role="option" aria-selected="false" 
         data-value="${escapeHtml(value)}"${specialAttr}>
      <span class="type-filter__checkbox"></span>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

/**
 * Populates the type filter dropdown based on available fields.
 * @param {Array<Object>} fields - List of fields to derive types from.
 */
export function populateTypeFilter(fields) {
    const types = new Set();
    let hasRequired = false, hasCalculated = false, hasRestricted = false;

    fields.forEach(field => {
        types.add(getFieldTypeCategory(field));
        if (isRequiredField(field)) hasRequired = true;
        if (isCalculatedField(field)) hasCalculated = true;
        if (isRestrictedPicklist(field)) hasRestricted = true;
    });

    let html = '';
    if (hasRequired) html += createFilterOption('Required', '⚠ Required', 'required');
    if (hasCalculated) html += createFilterOption('Calculated', '🔢 Calculated', 'calculated');
    if (hasRestricted) html += createFilterOption('Restricted', '🔒 Restricted', 'restricted');
    html += Array.from(types).sort().map(type => createFilterOption(type, type)).join('');

    elements.typeFilterMenu.innerHTML = html;
    // Listeners must be attached after setting innerHTML
    elements.typeFilterMenu.querySelectorAll('.type-filter__option').forEach(option => {
        option.addEventListener('click', event => {
            event.stopPropagation();
            toggleTypeOption(option);
        });
    });

    updateTriggerText();
}

/**
 * Toggles a type filter option.
 * @param {HTMLElement} option - The filter option element.
 */
export function toggleTypeOption(option) {
    const value = option.dataset.value;
    const selected = option.getAttribute('aria-selected') === 'true';
    option.setAttribute('aria-selected', !selected);

    if (selected) state.selectedTypes.delete(value);
    else state.selectedTypes.add(value);

    updateTriggerText();
    updateActiveFiltersDisplay();
    applyFilters();
}

function updateTriggerText() {
    const placeholder = elements.typeFilterTrigger.querySelector('.type-filter__placeholder');
    if (state.selectedTypes.size === 0) {
        placeholder.textContent = 'Filter by type...';
        placeholder.style.color = '';
    } else if (state.selectedTypes.size === 1) {
        placeholder.textContent = Array.from(state.selectedTypes)[0];
        placeholder.style.color = 'var(--color-text)';
    } else {
        placeholder.textContent = `${state.selectedTypes.size} filters`;
        placeholder.style.color = 'var(--color-text)';
    }
}

/**
 * Opens the filter dropdown.
 */
export function openFilterDropdown() {
    state.filterDropdownOpen = true;
    elements.typeFilterTrigger.setAttribute('aria-expanded', 'true');
    elements.typeFilterMenu.classList.remove('hidden');
}

/**
 * Closes the filter dropdown.
 */
export function closeFilterDropdown() {
    state.filterDropdownOpen = false;
    elements.typeFilterTrigger.setAttribute('aria-expanded', 'false');
    elements.typeFilterMenu.classList.add('hidden');
}

/**
 * Updates the display of active filters (chips).
 */
export function updateActiveFiltersDisplay() {
    if (state.selectedTypes.size === 0) {
        elements.activeFilters.classList.add('hidden');
        elements.activeFilters.innerHTML = '';
        return;
    }

    elements.activeFilters.innerHTML = Array.from(state.selectedTypes).map(type => `
    <span class="badge badge--chip" data-type="${escapeHtml(type)}">
      <span>${escapeHtml(type)}</span><span class="chip__remove">×</span>
    </span>
  `).join('');
    elements.activeFilters.classList.remove('hidden');

    elements.activeFilters.querySelectorAll('.badge--chip').forEach(chip => {
        chip.querySelector('.chip__remove').addEventListener('click', e => {
            e.stopPropagation();
            state.selectedTypes.delete(chip.dataset.type);
            const opt = elements.typeFilterMenu.querySelector(`[data-value="${chip.dataset.type}"]`);
            if (opt) opt.setAttribute('aria-selected', 'false');
            updateTriggerText();
            updateActiveFiltersDisplay();
            applyFilters();
        });
    });
}

/**
 * Applies search and type filters to the field list.
 */
export function applyFilters() {
    const searchTerm = elements.fieldSearch.value.toLowerCase().trim();
    let filteredFields = state.currentPanelFields;

    if (searchTerm) {
        filteredFields = filteredFields.filter(field =>
            field.label?.toLowerCase().includes(searchTerm) || field.name?.toLowerCase().includes(searchTerm)
        );
    }

    if (state.selectedTypes.size > 0) {
        filteredFields = filteredFields.filter(field => {
            if (state.selectedTypes.has('Required') && isRequiredField(field)) return true;
            if (state.selectedTypes.has('Calculated') && isCalculatedField(field)) return true;
            if (state.selectedTypes.has('Restricted') && isRestrictedPicklist(field)) return true;
            return state.selectedTypes.has(getFieldTypeCategory(field));
        });
    }

    renderFields(filteredFields);
    elements.detailsFieldCount.textContent = (searchTerm || state.selectedTypes.size > 0)
        ? `${filteredFields.length}/${state.currentPanelFields.length}` : state.currentPanelFields.length;
}
