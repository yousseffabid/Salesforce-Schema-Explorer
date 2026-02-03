/**
 * Salesforce Schema Explorer - Data Utilities
 */

import { state } from './state.js';
import { logger } from './utils.js';

// Global from excludedObjects.js
import { isObjectExcluded } from './excludedObjects.js';

// =============================================================================
// FIELD ATTRIBUTES
// =============================================================================

/**
 * Checks if a field represents a Master-Detail relationship.
 * @param {Object} field - The field metadata.
 * @returns {boolean} True if Master-Detail.
 */
export function isMasterDetailField(field) {
    return field.type === 'reference' && (
        field.relationshipOrder !== undefined && field.relationshipOrder !== null
    );
}

/**
 * Checks if a field is required.
 * @param {Object} field - The field metadata.
 * @returns {boolean} True if required.
 */
export function isRequiredField(field) {
    return !field.nillable && !field.defaultedOnCreate && field.createable;
}

/**
 * Checks if a field is calculated (formula).
 * @param {Object} field - The field metadata.
 * @returns {boolean} True if calculated.
 */
export function isCalculatedField(field) {
    return field.calculated === true;
}

/**
 * Checks if a field is a restricted picklist.
 * @param {Object} field - The field metadata.
 * @returns {boolean} True if restricted picklist.
 */
export function isRestrictedPicklist(field) {
    return (field.type === 'picklist' || field.type === 'multipicklist') && field.restrictedPicklist === true;
}

/**
 * Gets a list of attributes for a field (Required, Calculated, etc.).
 * @param {Object} field - The field metadata.
 * @returns {Array<{type: string, label: string}>} List of attributes.
 */
export function getFieldAttributes(field) {
    const attrs = [];
    if (isRequiredField(field)) attrs.push({ type: 'required', label: 'Required' });
    if (isCalculatedField(field)) attrs.push({ type: 'calculated', label: 'Calculated' });
    if (isRestrictedPicklist(field)) attrs.push({ type: 'restricted', label: 'Restricted' });
    return attrs;
}

/**
 * Gets a displayable label for a field's type, including length/precision.
 * @param {Object} field - The field metadata.
 * @returns {{label: string, isMasterDetail: boolean}} Display label and MD flag.
 */
export function getFieldTypeDisplay(field) {
    if (field.type === 'reference' && field.referenceTo?.length > 0) {
        const isMd = isMasterDetailField(field);
        return {
            label: `${isMd ? 'Master-Detail' : 'Lookup'}`,
            isMasterDetail: isMd
        };
    }

    if (field.type === 'double' || field.type === 'currency' || field.type === 'percent') {
        const precision = field.precision || 0;
        const scale = field.scale || 0;
        const typeNames = { double: 'Number', currency: 'Currency', percent: 'Percent' };
        return { label: `${typeNames[field.type]}(${precision - scale},${scale})`, isMasterDetail: false };
    }

    if (field.type === 'int') return { label: `Number(${field.digits || 0},0)`, isMasterDetail: false };
    if (field.type === 'textarea') return { label: `Textarea(${field.length || 0})`, isMasterDetail: false };
    if (field.type === 'string') return { label: `Text(${field.length || 0})`, isMasterDetail: false };

    const typeMap = {
        url: 'URL', email: 'Email', phone: 'Phone', date: 'Date',
        datetime: 'Date/Time', time: 'Time', boolean: 'Checkbox',
        id: 'ID', picklist: 'Picklist', multipicklist: 'Multi-Select',
        encryptedstring: 'Encrypted', address: 'Address', location: 'Geolocation'
    };

    return { label: typeMap[field.type?.toLowerCase()] || field.type || 'Unknown', isMasterDetail: false };
}

/**
 * Categorizes a field type into a broader group (Text, Number, Date/Time, etc.).
 * @param {Object} field - The field metadata.
 * @returns {string} The category name.
 */
export function getFieldTypeCategory(field) {
    if (field.type === 'reference') return isMasterDetailField(field) ? 'Master-Detail' : 'Lookup';

    const categoryMap = {
        string: 'Text', textarea: 'Text', url: 'Text', email: 'Text', phone: 'Text',
        int: 'Number', double: 'Number', currency: 'Number', percent: 'Number',
        date: 'Date/Time', datetime: 'Date/Time', time: 'Date/Time',
        boolean: 'Checkbox', id: 'ID', picklist: 'Picklist', multipicklist: 'Picklist'
    };

    return categoryMap[field.type?.toLowerCase()] || field.type || 'Other';
}

// =============================================================================
// RELATIONSHIP PROCESSING
// =============================================================================

function buildRelationshipInfo(relationship, objectApiName, direction) {
    const isMasterDetail = relationship.isMasterDetail === true;
    const info = direction === 'outgoing'
        ? {
            fieldName: relationship.fieldName,
            fieldLabel: relationship.fieldLabel,
            targetObject: relationship.targetObject,
            relationshipName: relationship.relationshipName,
            sourceObject: objectApiName,
            isMasterDetail,
            relationshipOrder: relationship.relationshipOrder
        }
        : {
            fieldName: relationship.fieldName,
            fieldLabel: relationship.fieldLabel,
            sourceObject: relationship.sourceObject,
            sourceLabel: relationship.sourceLabel ?? relationship.sourceObject,
            relationshipName: relationship.relationshipName,
            targetObject: objectApiName,
            isMasterDetail,
            relationshipOrder: relationship.relationshipOrder
        };
    return { info, isMasterDetail };
}

/**
 * Retrieves raw relationship data from the relationship cache.
 * @param {string} objectApiName - The object name.
 * @returns {Object} Raw outgoing/incoming arrays.
 */
export function getRelationshipsForObject(objectApiName) {
    if (!state.relationshipCache?.relationships) {
        return { outgoing: [], incoming: [] };
    }

    const { outgoing, incoming } = state.relationshipCache.relationships;
    return {
        outgoing: outgoing[objectApiName] || [],
        incoming: incoming[objectApiName] || []
    };
}

/**
 * Extracts relationships from the relationship cache, formatting them for the graph.
 * @param {string} objectApiName - The object name.
 * @returns {Object} Formatted relationship data.
 */
export function extractRelationshipsFromCache(objectApiName) {
    const cached = getRelationshipsForObject(objectApiName);
    const outgoing = { lookup: [], masterDetail: [] };
    const incoming = { lookup: [], masterDetail: [] };
    const outgoingExcluded = { lookup: [], masterDetail: [] };
    const incomingExcluded = { lookup: [], masterDetail: [] };

    for (const relationship of cached.outgoing) {
        const { info, isMasterDetail } = buildRelationshipInfo(relationship, objectApiName, 'outgoing');
        const bucket = isMasterDetail ? 'masterDetail' : 'lookup';

        if (isObjectExcluded(relationship.targetObject)) {
            outgoingExcluded[bucket].push(info);
            continue;
        }
        outgoing[bucket].push(info);
    }

    for (const relationship of cached.incoming) {
        const { info, isMasterDetail } = buildRelationshipInfo(relationship, objectApiName, 'incoming');
        const bucket = isMasterDetail ? 'masterDetail' : 'lookup';

        if (isObjectExcluded(relationship.sourceObject)) {
            incomingExcluded[bucket].push(info);
            continue;
        }
        incoming[bucket].push(info);
    }

    return { outgoing, incoming, excludedOutgoing: outgoingExcluded, excludedIncoming: incomingExcluded };
}

/**
 * Extracts relationships directly from a single object's metadata (fallback).
 * Only supports outgoing relationships.
 * @param {Object} metadata - The object metadata.
 * @returns {Object} Formatted outgoing relationships.
 */
export function extractRelationshipsFromMetadata(metadata) {
    const outgoing = { lookup: [], masterDetail: [] };
    const excludedOutgoing = { lookup: [], masterDetail: [] };

    for (const field of metadata.fields) {
        if (field.type !== 'reference' || !field.referenceTo?.length) continue;

        // Strict Master-Detail check based on relationshipOrder.
        const isMasterDetail = field.relationshipOrder !== undefined && field.relationshipOrder !== null;

        for (const targetObject of field.referenceTo) {
            if (targetObject === metadata.name) continue;

            const relationshipInfo = {
                fieldName: field.name,
                fieldLabel: field.label,
                targetObject,
                relationshipName: field.relationshipName,
                sourceObject: metadata.name,
                isMasterDetail,
                relationshipOrder: field.relationshipOrder
            };

            const bucket = isMasterDetail ? 'masterDetail' : 'lookup';

            if (isObjectExcluded(targetObject)) {
                excludedOutgoing[bucket].push(relationshipInfo);
            } else {
                outgoing[bucket].push(relationshipInfo);
            }
        }
    }

    return { outgoing, excludedOutgoing };
}

// =============================================================================
// URL GENERATION
// =============================================================================

/**
 * Generates the URL for the object in Object Manager.
 * @param {string} objectApiName - The object API name.
 * @returns {string} The URL.
 */
export function getObjectManagerUrl(objectApiName) {
    return `${state.instanceUrl}/lightning/setup/ObjectManager/${objectApiName}/Details/view`;
}

/**
 * Generates the URL for the object's fields in Object Manager.
 * @param {string} objectApiName - The object API name.
 * @returns {string} The URL.
 */
export function getObjectManagerFieldsUrl(objectApiName) {
    return `${state.instanceUrl}/lightning/setup/ObjectManager/${objectApiName}/FieldsAndRelationships/view`;
}
