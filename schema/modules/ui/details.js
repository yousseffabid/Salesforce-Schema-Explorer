/**
 * Salesforce Schema Explorer - UI Details Panel
 * Handles rendering of object details and fields.
 */

import { state, elements } from '../state.js';
import { escapeHtml } from '../utils.js';
import {
    getFieldTypeCategory,
    getFieldTypeDisplay,
    getFieldAttributes,
    isMasterDetailField,
    getObjectManagerFieldsUrl,
    getObjectManagerUrl
} from '../data.js';
import {
    populateTypeFilter,
    updateActiveFiltersDisplay,
    closeFilterDropdown,
    applyFilters
} from './filters.js';

// =============================================================================
// DETAILS PANEL
// =============================================================================

/**
 * Shows the details panel for a specific object.
 * @param {string} objectApiName - The API name of the object.
 */
export function showDetailsPanel(objectApiName) {
    const metadata = state.metadata.get(objectApiName);
    if (!metadata) return;

    state.currentPanelObject = objectApiName;
    state.currentPanelFields = metadata.fields;
    state.selectedTypes.clear();

    elements.detailsTitle.textContent = metadata.label || metadata.name;
    elements.detailsApiName.textContent = objectApiName;
    elements.detailsDescription.textContent = metadata.description || '';
    elements.objectManagerLink.querySelector('a').href = getObjectManagerFieldsUrl(objectApiName);
    elements.detailsFieldCount.textContent = metadata.fields.length;
    elements.fieldSearch.value = '';

    populateTypeFilter(metadata.fields);
    updateActiveFiltersDisplay();
    closeFilterDropdown();
    renderFields(metadata.fields);

    elements.detailsFields.scrollTop = 0;
    elements.detailsPanel.classList.remove('hidden');
    requestAnimationFrame(() => elements.detailsPanel.classList.add('visible'));
}

/**
 * Hides the details panel.
 */
export function hideDetailsPanel() {
    elements.detailsPanel.classList.remove('visible');
    closeFilterDropdown();
    setTimeout(() => elements.detailsPanel.classList.add('hidden'), 300);
}

/**
 * Renders the list of fields in the details panel.
 * @param {Array<Object>} fields - List of field metadata objects.
 */
export function renderFields(fields) {
    const sorted = [...fields].sort((fieldA, fieldB) =>
        (fieldA.label || fieldA.name).localeCompare(fieldB.label || fieldB.name)
    );

    elements.detailsFields.innerHTML = sorted.map(field => {
        const typeInfo = getFieldTypeDisplay(field);
        const fieldAttributes = getFieldAttributes(field);

        let typeHtml;
        let typeClass = 'field-item__type';
        if (field.type === 'reference' && field.referenceTo?.length) {
            const isMasterDetail = isMasterDetailField(field);
            const refLinks = field.referenceTo
                .map(targetObject =>
                    `<a href="${getObjectManagerUrl(targetObject)}" target="_blank" class="field-item__ref-link">${escapeHtml(targetObject)}</a>`
                )
                .join(', ');
            typeHtml = `${isMasterDetail ? 'Master-Detail' : 'Lookup'} (${refLinks})`;
            if (isMasterDetail) typeClass += ' field-item__type--master-detail';
        } else {
            typeHtml = escapeHtml(typeInfo.label);
        }

        const attributesHtml = fieldAttributes
            .map(attr => `<span class="field-attr field-attr--${attr.type}">${attr.label}</span>`)
            .join('');

        return `
      <div class="field-item" data-type="${escapeHtml(getFieldTypeCategory(field))}">
        <div class="field-item__label" title="${escapeHtml(field.label || field.name)}">${escapeHtml(field.label || field.name)}</div>
        <div class="field-item__api" title="${escapeHtml(field.name)}">${escapeHtml(field.name)}</div>
        <div class="${typeClass}" title="${escapeHtml(typeInfo.label)}">${typeHtml}</div>
        <div class="field-item__attrs">${attributesHtml}</div>
      </div>
    `;
    }).join('');
}
