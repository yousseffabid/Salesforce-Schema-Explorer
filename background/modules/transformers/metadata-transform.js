/**
 * Salesforce Schema Explorer - Metadata Transformers
 * Pure functions for transforming Salesforce metadata into internal format.
 */

import { shouldExcludeObject } from '../utils.js';

/**
 * Strips unnecessary fields from the metadata object.
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
 * Builds the Object Metadata Map from the raw metadata map.
 * @param {Object} metadataMap - The raw metadata map.
 * @returns {Object} The processed Object Metadata Map.
 */
export function buildObjectMetadataMap(metadataMap) {
    const objectMetadataMap = {};
    const relationshipIndex = { outgoing: {}, incoming: {} };

    // First pass: create object entries and index outgoing relationships
    for (const [objectName, metadata] of Object.entries(metadataMap)) {
        const strippedMetadata = stripMetadataFields(metadata);

        // Build fields map for O(1) lookup
        const fieldsMap = {};
        const outgoingRelationships = [];

        for (const field of strippedMetadata.fields) {
            fieldsMap[field.name] = field;

            // Extract outgoing relationships (reference fields)
            if (field.type === 'reference' && field.referenceTo?.length) {
                // Determine if this is a Master-Detail relationship based on relationshipOrder
                // relationshipOrder is only present on MD fields (0 or 1)
                const isMasterDetail = (field.relationshipOrder !== undefined && field.relationshipOrder !== null) || field.cascadeDelete === true;
                const relationshipOrder = isMasterDetail ? field.relationshipOrder : null;

                for (const targetObject of field.referenceTo) {
                    if (targetObject === objectName) continue;

                    const relationshipInfo = {
                        fieldName: field.name,
                        fieldLabel: field.label,
                        targetObject,
                        relationshipName: field.relationshipName,
                        sourceObject: objectName,
                        isMasterDetail,
                        relationshipOrder // Include order for UI
                    };

                    outgoingRelationships.push(relationshipInfo);

                    // Index for reverse lookup (incoming relationships)
                    if (!relationshipIndex.incoming[targetObject]) {
                        relationshipIndex.incoming[targetObject] = [];
                    }
                    relationshipIndex.incoming[targetObject].push({
                        ...relationshipInfo,
                        sourceLabel: strippedMetadata.label
                    });
                }
            }
        }

        objectMetadataMap[objectName] = {
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
            fields: fieldsMap,
            relationships: {
                outgoing: outgoingRelationships,
                incoming: [] // Will be populated in second pass
            }
        };
    }

    // Process childRelationships for complete data (Fallback/Enrichment)
    for (const [objectName, metadata] of Object.entries(metadataMap)) {
        const strippedMetadata = stripMetadataFields(metadata);

        if (strippedMetadata.childRelationships?.length > 0) {
            const incomingFromChildren = [];

            for (const childRelationship of strippedMetadata.childRelationships) {
                if (childRelationship.deprecatedAndHidden) continue;

                if (shouldExcludeObject({
                    queryable: false, // We assume false to be safe if checking exclusion by name
                    deprecatedAndHidden: false,
                    createable: false,
                    name: childRelationship.childSObject
                })) {
                    continue;
                }

                const childSObject = childRelationship.childSObject;
                const fieldName = childRelationship.field;

                // Check if we already have this relationship from the First Pass (Field Index).
                // If we have the child object's metadata (fields), we trust THAT (Primary Source).
                // We only use this ChildRelationship (Secondary Source) if the child object is NOT in our map.
                // This prevents duplicates.

                // Do we have the child object loaded?
                const childObjectLoaded = objectMetadataMap[childSObject] !== undefined;

                // If loaded, does it have this reference field?
                // (We check the incoming index we built in pass 1)
                const existingIncoming = relationshipIndex.incoming[objectName] || [];
                const alreadyIndexed = existingIncoming.some(rel =>
                    rel.sourceObject === childSObject &&
                    rel.fieldName === fieldName
                );

                if (childObjectLoaded && alreadyIndexed) {
                    // We already have the high-fidelity field data for this. Skip the childRelationship fallback.
                    continue;
                }

                // If NOT loaded (or field somehow missing), use this as fallback proxy.
                // Note: We won't have relationshipOrder here, so we can't label Primary/Secondary.
                const isMasterDetailRelationship = childRelationship.cascadeDelete === true;

                incomingFromChildren.push({
                    sourceObject: childSObject,
                    sourceLabel: childSObject,
                    fieldName: fieldName,
                    fieldLabel: fieldName,
                    relationshipName: childRelationship.relationshipName,
                    isMasterDetail: isMasterDetailRelationship,
                    targetObject: objectName,
                    relationshipOrder: null
                });
            }

            if (incomingFromChildren.length > 0) {
                // These are "Shadow" incoming relationships from objects we typically didn't fully load
                if (!objectMetadataMap[objectName].relationships.incoming) {
                    objectMetadataMap[objectName].relationships.incoming = [];
                }
                objectMetadataMap[objectName].relationships.incoming.push(...incomingFromChildren);
            }
        }
    }

    // Second pass: populate incoming relationships from the high-fidelity Index
    for (const [objectName, incomingRelationships] of Object.entries(relationshipIndex.incoming)) {
        if (objectMetadataMap[objectName]) {
            // Merge field-based incoming relationships
            if (!objectMetadataMap[objectName].relationships.incoming) {
                objectMetadataMap[objectName].relationships.incoming = [];
            }
            objectMetadataMap[objectName].relationships.incoming.push(...incomingRelationships);
        } else {
            // Check if this object itself should be excluded
            if (shouldExcludeObject({
                queryable: false,
                deprecatedAndHidden: false,
                createable: false,
                name: objectName
            })) {
                continue;  // Skip creating shadow node
            }

            // Create "shadow node" for objects pointed TO, but not fully loaded
            objectMetadataMap[objectName] = {
                info: {
                    name: objectName,
                    label: objectName,
                    custom: objectName.endsWith('__c'),
                    queryable: false,
                    createable: false,
                    updateable: false,
                    deletable: false,
                    keyPrefix: null
                },
                fields: {},
                relationships: {
                    outgoing: [],
                    incoming: incomingRelationships
                }
            };
        }
    }

    return objectMetadataMap;
}
