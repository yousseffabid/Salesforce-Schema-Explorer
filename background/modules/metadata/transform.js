/**
 * Salesforce Schema Explorer - Metadata Transformation
 */

import { isSystemObject } from '../utils.js';

/**
 * Strips unnecessary fields from the metadata object to save memory.
 * @param {Object} metadata - The raw metadata object.
 * @returns {Object} The stripped metadata object.
 */
export function stripMetadataFields(metadata) {
    const strippedFields = metadata.fields.map(field => ({
        name: field.name,
        label: field.label,
        type: field.type,
        length: field.length,
        precision: field.precision,
        scale: field.scale,
        digits: field.digits,
        nillable: field.nillable,
        createable: field.createable,
        updateable: field.updateable,
        referenceTo: field.referenceTo,
        relationshipName: field.relationshipName,
        relationshipOrder: field.relationshipOrder,
        calculated: field.calculated,
        restrictedPicklist: field.restrictedPicklist,
        defaultedOnCreate: field.defaultedOnCreate,
        cascadeDelete: field.cascadeDelete
    }));

    // Extract childRelationships (incoming relationships)
    const childRelationships = (metadata.childRelationships || []).map(child => ({
        relationshipName: child.relationshipName,
        childSObject: child.childSObject,
        field: child.field,
        junctionIdListNames: child.junctionIdListNames,
        junctionReferenceTo: child.junctionReferenceTo,
        cascadeDelete: child.cascadeDelete,
        restrictedDelete: child.restrictedDelete,
        deprecatedAndHidden: child.deprecatedAndHidden
    }));

    return {
        name: metadata.name,
        label: metadata.label,
        custom: metadata.custom,
        queryable: metadata.queryable,
        createable: metadata.createable,
        updateable: metadata.updateable,
        deletable: metadata.deletable,
        keyPrefix: metadata.keyPrefix,
        fields: strippedFields,
        childRelationships: childRelationships
    };
}

/**
 * Builds the Object Metadata Map, processing relationships.
 * Returns edges as an object { [edgeId]: edge } for efficient lookups and merging.
 * @param {Object} metadataMap - The raw metadata map.
 * @returns {Object} The processed Object Metadata Map with nodes and edges.
 */
export function buildObjectMetadataMap(metadataMap) {
    const nodes = {};
    const edges = {};

    // Pass 1: Create nodes and extract outgoing edges
    for (const [objectName, metadata] of Object.entries(metadataMap)) {
        const strippedMetadata = stripMetadataFields(metadata);
        const { fieldsMap, outgoingEdges } = processOutgoingRelationships(objectName, strippedMetadata);

        nodes[objectName] = {
            info: {
                name: strippedMetadata.name,
                label: strippedMetadata.label,
                custom: strippedMetadata.custom,
                queryable: strippedMetadata.queryable,
                createable: strippedMetadata.createable,
                updateable: strippedMetadata.updateable,
                deletable: strippedMetadata.deletable,
                keyPrefix: strippedMetadata.keyPrefix
            },
            fields: fieldsMap
        };

        // Add outgoing edges to object
        outgoingEdges.forEach(edge => {
            if (edge.id) edges[edge.id] = edge;
        });
    }

    // Pass 2: Extract incoming edges from childRelationships (for Shadow Nodes)
    for (const [objectName, metadata] of Object.entries(metadataMap)) {
        const incomingEdges = processIncomingFromChildRelationships(objectName, metadata, nodes, edges);
        incomingEdges.forEach(edge => {
            if (edge.id) edges[edge.id] = edge;
        });
    }

    return { nodes, edges };
}

/**
 * Helper: Processes outgoing relationships (Reference Fields) for an object.
 */
function processOutgoingRelationships(objectName, strippedMetadata) {
    const fieldsMap = {};
    const outgoingEdges = [];

    for (const field of strippedMetadata.fields) {
        fieldsMap[field.name] = field;

        if (field.type === 'reference' && field.referenceTo?.length) {
            const isMasterDetail = field.relationshipOrder !== undefined && field.relationshipOrder !== null;

            for (const targetObject of field.referenceTo) {
                if (targetObject === objectName) continue;

                outgoingEdges.push({
                    id: `${objectName}.${field.name}`, // Unique Edge ID
                    source: objectName,
                    sourceLabel: strippedMetadata.label,
                    target: targetObject,
                    fieldName: field.name,
                    fieldLabel: field.label,
                    relationshipName: field.relationshipName,
                    type: 'Lookup',
                    isMasterDetail,
                    order: field.relationshipOrder
                });
            }
        }
    }
    return { fieldsMap, outgoingEdges };
}

/**
 * Helper: Processes incoming relationships derived from childRelationships (Fallback).
 * @param {string} objectName - The object name.
 * @param {Object} metadata - The raw metadata.
 * @param {Object} nodes - The nodes object (mutated to add shadow nodes).
 * @param {Object} existingEdges - The existing edges object { [id]: edge }.
 * @returns {Array} Array of incoming edge objects.
 */
function processIncomingFromChildRelationships(objectName, metadata, nodes, existingEdges) {
    const strippedMetadata = stripMetadataFields(metadata);
    if (!strippedMetadata.childRelationships?.length) return [];

    const incomingEdges = [];

    for (const childRelationship of strippedMetadata.childRelationships) {
        if (childRelationship.deprecatedAndHidden) continue;

        const childSObject = childRelationship.childSObject;
        if (isSystemObject(childSObject)) continue;

        const fieldName = childRelationship.field;

        // Deduplication: Check if this edge already exists (from the Source's outgoing pass)
        // Edge ID format: Source.Field
        const edgeId = `${childSObject}.${fieldName}`;
        const alreadyExists = edgeId in existingEdges;

        if (alreadyExists) continue;

        // If the child node already exists fully, we assume its outgoing pass covered it.
        // But if it's a Shadow Node or missing, we add this "reverse discovered" edge.

        // Create Shadow Node if missing
        if (!nodes[childSObject]) {
            nodes[childSObject] = {
                info: {
                    name: childSObject,
                    label: childSObject, // Best guess
                    custom: childSObject.endsWith('__c'),
                    queryable: false,
                    createable: false, // Shadow node marker
                    updateable: false,
                    deletable: false,
                    keyPrefix: null
                },
                fields: {}
            };
        }

        // Master-Detail relationships have both cascadeDelete=true AND restrictedDelete=true
        // Lookup relationships may have cascadeDelete but not restrictedDelete
        const isMasterDetail =
            childRelationship.cascadeDelete === true &&
            childRelationship.restrictedDelete === true;

        incomingEdges.push({
            id: edgeId,
            source: childSObject,
            sourceLabel: childSObject, // Best guess
            target: objectName,
            fieldName: fieldName,
            fieldLabel: fieldName, // Best guess
            relationshipName: childRelationship.relationshipName,
            type: isMasterDetail ? 'MasterDetail' : 'Lookup',
            isMasterDetail,
            order: null // Not available from childRelationships
        });
    }

    return incomingEdges;
}