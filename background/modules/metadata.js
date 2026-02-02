/**
 * Salesforce Schema Explorer - Metadata Utilities
 */

import { logger, shouldExcludeObject } from './utils.js';
import { fetchWithRetry, MAX_RETRY_ATTEMPTS } from './api.js';
import {
    getMetadataCacheKey,
    loadMetadataFromIndexedDb,
    saveMetadataToIndexedDb,
    deleteMetadataFromIndexedDb
} from './cache.js';
import { extractSessionIdFromCookies } from './auth.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Optimization: Batch size of 15 balances browser concurrency limits (avg 6) with speed.
// Delay of 100ms prevents "burstable" rate limiting from Salesforce.
export const METADATA_BATCH_SIZE = 15;
export const METADATA_BATCH_DELAY_MS = 100;

// =============================================================================
// METADATA PROCESSING
// =============================================================================

/**
 * Filters the list of objects to determine which ones should have their metadata fetched.
 * @param {Array<Object>} allObjects - List of all objects from describeGlobal.
 * @returns {Array<Object>} Filtered list of objects.
 */
function filterObjectsForMetadataFetch(allObjects) {
    return allObjects.filter(object => !shouldExcludeObject(object));
}

/**
 * Fetches metadata for a list of objects in batches.
 * @param {string} instanceUrl - The Salesforce instance URL.
 * @param {string} apiVersion - The API version.
 * @param {Array<string>} objectNames - List of object API names to fetch.
 * @param {string} sessionId - The session ID.
 * @param {boolean} isSetupDomain - Flag for setup domain.
 * @returns {Promise<Object>} Map of object names to metadata.
 */
async function batchFetchObjectMetadata(instanceUrl, apiVersion, objectNames, sessionId, isSetupDomain) {
    const metadataMap = {};

    logger.info('[Metadata:batchFetch] Fetching metadata', { count: objectNames.length, batchSize: METADATA_BATCH_SIZE });

    for (let i = 0; i < objectNames.length; i += METADATA_BATCH_SIZE) {
        const batch = objectNames.slice(i, i + METADATA_BATCH_SIZE);

        // Fetch this batch in parallel
        const batchPromises = batch.map(objectName =>
            fetchWithRetry(
                `${instanceUrl}/services/data/v${apiVersion}/sobjects/${objectName}/describe`,
                MAX_RETRY_ATTEMPTS,
                sessionId,
                isSetupDomain
            ).then(metadata => ({ objectName, metadata }))
                .catch(error => {
                    logger.warn('[Metadata:batchFetch] Failed to fetch object', { objectName, error: error.message });
                    return { objectName, metadata: null };
                })
        );

        const results = await Promise.all(batchPromises);
        results.forEach(result => {
            if (result.metadata) {
                metadataMap[result.objectName] = result.metadata;
            }
        });

        // Delay before next batch (except after last batch)
        if (i + METADATA_BATCH_SIZE < objectNames.length) {
            await new Promise(resolve => setTimeout(resolve, METADATA_BATCH_DELAY_MS));
        }
    }

    return metadataMap;
}

/**
 * Strips unnecessary fields from the metadata object to save memory.
 * @param {Object} metadata - The raw metadata object.
 * @returns {Object} The stripped metadata object.
 */
function stripMetadataFields(metadata) {
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
                    sourceLabel: childSObject, // Best guess
                    fieldName: fieldName,
                    fieldLabel: fieldName, // Best guess
                    relationshipName: childRelationship.relationshipName,
                    isMasterDetail: isMasterDetailRelationship,
                    targetObject: objectName,
                    relationshipOrder: null // Unknown
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

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Handles the message to build or fetch the Object Metadata Map.
 * @param {Object} message - The message object.
 * @param {Function} sendResponse - The response callback.
 */
export async function handleBuildObjectMetadataMap(message, sendResponse) {
    const { instanceUrl, apiVersion, isSetupDomain, forceRefresh } = message;

    if (!instanceUrl || !apiVersion) {
        sendResponse({ success: false, error: 'Missing instanceUrl or apiVersion' });
        return;
    }

    try {
        const cacheKey = getMetadataCacheKey(instanceUrl);

        // Check cache first
        if (!forceRefresh) {
            const cached = await loadMetadataFromIndexedDb(cacheKey);
            if (cached) {
                logger.info('[Metadata:handleBuild] Returning cached Object Metadata Map');
                sendResponse({ success: true, metadataMap: cached.data, fromCache: true, timestamp: cached.timestamp });
                return;
            }
        }

        logger.info('[Metadata:handleBuild] Building fresh Object Metadata Map');

        // Extract fresh session ID (ignore the one from message as it might be stale/limited)
        const sessionId = await extractSessionIdFromCookies(instanceUrl);
        if (!sessionId) {
            sendResponse({
                success: false,
                error: 'No valid session ID found. Please log in to Salesforce first.'
            });
            return;
        }

        // Step 1: Fetch describeGlobal
        logger.debug('[Metadata:handleBuild] Fetching describeGlobal');
        const describeGlobalUrl = `${instanceUrl}/services/data/v${apiVersion}/sobjects`;
        const describeGlobalResponse = await fetchWithRetry(
            describeGlobalUrl,
            MAX_RETRY_ATTEMPTS,
            sessionId,
            isSetupDomain
        );

        const allObjects = describeGlobalResponse.sobjects || [];
        logger.debug('[Metadata:handleBuild] describeGlobal returned objects', { count: allObjects.length });

        // Step 2: Filter objects
        const filteredObjects = filterObjectsForMetadataFetch(allObjects);
        logger.debug('[Metadata:handleBuild] Filtered queryable objects', { count: filteredObjects.length });

        // Step 3: Batch fetch metadata
        const objectNames = filteredObjects.map(obj => obj.name);
        const metadataMap = await batchFetchObjectMetadata(
            instanceUrl,
            apiVersion,
            objectNames,
            sessionId,
            isSetupDomain
        );

        logger.info('[Metadata:handleBuild] Successfully fetched metadata', { count: Object.keys(metadataMap).length });

        // Step 4: Build Object Metadata Map
        const objectMetadataMap = buildObjectMetadataMap(metadataMap);

        // Step 5: Cache in IndexedDB
        await saveMetadataToIndexedDb(cacheKey, objectMetadataMap);
        logger.debug('[Metadata:handleBuild] Cached Object Metadata Map to IndexedDB');

        // Step 6: Return to caller
        sendResponse({
            success: true,
            metadataMap: objectMetadataMap,
            fromCache: false,
            timestamp: Date.now()
        });

    } catch (error) {
        logger.error('[Metadata:handleBuild] Error building Object Metadata Map', { error: error.message });
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handles the message to clear the metadata cache.
 * @param {Object} message - The message object.
 * @param {Function} sendResponse - The response callback.
 */
export async function handleClearMetadataCache(message, sendResponse) {
    const { instanceUrl } = message;

    if (!instanceUrl) {
        sendResponse({ success: false, error: 'Missing instanceUrl' });
        return;
    }

    try {
        const cacheKey = getMetadataCacheKey(instanceUrl);
        await deleteMetadataFromIndexedDb(cacheKey);
        logger.info('[Metadata:handleClear] Cleared metadata cache');
        sendResponse({ success: true });
    } catch (error) {
        logger.error('[Metadata:handleClear] Error clearing metadata cache', { error: error.message });
        sendResponse({ success: false, error: error.message });
    }
}
