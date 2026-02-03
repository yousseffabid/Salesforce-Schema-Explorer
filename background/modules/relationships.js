/**
 * Salesforce Schema Explorer - Relationship Utilities
 */

import { logger, isSystemObject } from './utils.js';
import { fetchWithRetry, MAX_RETRY_ATTEMPTS } from './api.js';
import { extractSessionIdFromCookies } from './auth.js';
import {
    getRelationshipCacheKey,
    isRelationshipCacheValid,
    storeRelationshipCache,
    getRelationshipCache,
    clearRelationshipCache
} from './cache.js';

// =============================================================================
// FETCHING LOGIC
// =============================================================================

/**
 * Fetches relationships via the REST API.
 * @param {string} instanceUrl - The Salesforce instance URL.
 * @param {string} apiVersion - The API version.
 * @param {string} sessionId - The session ID.
 * @returns {Promise<Object>} The relationship data including outgoing and incoming relationships.
 */
async function fetchRelationshipsViaRestApi(instanceUrl, apiVersion, sessionId) {
    const outgoingRelationships = {};
    const incomingRelationships = {};
    let totalRelationships = 0;
    const failedObjects = [];
    let processedObjects = 0;

    try {
        const version = apiVersion || '66.0';
        const sobjectsUrl = `${instanceUrl}/services/data/v${version}/sobjects`;
        const sobjectsData = await fetchWithRetry(sobjectsUrl, MAX_RETRY_ATTEMPTS, sessionId, false);

        if (!sobjectsData.sobjects) {
            throw new Error('No sobjects found in describe response');
        }

        const queryableObjects = sobjectsData.sobjects
            .filter(object => object.queryable && !object.deprecatedAndHidden)
            .map(object => object.name);

        const batchSize = 10;
        const totalBatches = Math.ceil(queryableObjects.length / batchSize);

        logger.info('[Relationships:fetchREST] Starting relationship fetch', {
            queryableObjects: queryableObjects.length,
            batchSize,
            totalBatches
        });

        for (let i = 0; i < queryableObjects.length; i += batchSize) {
            const batch = queryableObjects.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;

            // Fetch batch in parallel (no logging in loop)
            const describePromises = batch.map(objectName =>
                fetchWithRetry(
                    `${instanceUrl}/services/data/v${version}/sobjects/${objectName}/describe`,
                    MAX_RETRY_ATTEMPTS,
                    sessionId,
                    false
                ).then(data => ({ objectName, data, success: true }))
                    .catch(error => {
                        // Collect failures for summary (no logging in loop)
                        return { objectName, data: null, success: false, error: error.message };
                    })
            );

            const results = await Promise.all(describePromises);

            // Process results without logging in loop
            for (const result of results) {
                if (!result.success || !result.data) {
                    failedObjects.push({ objectName: result.objectName, error: result.error });
                    continue;
                }

                processedObjects++;
                const sourceObject = result.data.name;
                const sourceLabel = result.data.label;

                if (!result.data.fields) continue;

                // Process fields (no logging in loop)
                for (const field of result.data.fields) {
                    if (!field.relationshipName || !field.referenceTo || field.referenceTo.length === 0) {
                        continue;
                    }

                    const isMasterDetail = field.type === 'reference' && field.relationshipOrder !== undefined && field.relationshipOrder !== null;

                    const relationshipInfo = {
                        fieldName: field.name,
                        fieldLabel: field.label,
                        relationshipName: field.relationshipName,
                        isMasterDetail,
                        targetObject: field.referenceTo[0]
                    };

                    if (!outgoingRelationships[sourceObject]) {
                        outgoingRelationships[sourceObject] = [];
                    }
                    outgoingRelationships[sourceObject].push(relationshipInfo);

                    for (const targetObject of field.referenceTo) {
                        if (!incomingRelationships[targetObject]) {
                            incomingRelationships[targetObject] = [];
                        }
                        incomingRelationships[targetObject].push({
                            ...relationshipInfo,
                            sourceObject,
                            sourceLabel: sourceLabel || sourceObject
                        });

                        totalRelationships++;
                    }
                }

                // Process child relationships (no logging in loop)
                if (result.data.childRelationships?.length > 0) {
                    for (const childRelationship of result.data.childRelationships) {
                        if (childRelationship.deprecatedAndHidden) continue;

                        if (isSystemObject(childRelationship.childSObject)) {
                            continue;
                        }

                        if (!incomingRelationships[sourceObject]) {
                            incomingRelationships[sourceObject] = [];
                        }

                        const isMasterDetailRelationship =
                            childRelationship.cascadeDelete === true &&
                            childRelationship.restrictedDelete === true;

                        incomingRelationships[sourceObject].push({
                            fieldName: childRelationship.field,
                            fieldLabel: childRelationship.field,
                            relationshipName: childRelationship.relationshipName,
                            isMasterDetail: isMasterDetailRelationship,
                            sourceObject: childRelationship.childSObject,
                            sourceLabel: childRelationship.childSObject,
                            targetObject: sourceObject
                        });

                        totalRelationships++;
                    }
                }
            }
        }

        // Summary logging after all processing complete
        logger.info('[Relationships:fetchREST] Relationship fetch completed', {
            totalObjects: queryableObjects.length,
            processedObjects,
            failedObjects: failedObjects.length,
            totalRelationships,
            objectsWithOutgoing: Object.keys(outgoingRelationships).length,
            objectsWithIncoming: Object.keys(incomingRelationships).length
        });

        if (failedObjects.length > 0) {
            logger.warn('[Relationships:fetchREST] Some objects failed to describe', {
                failedCount: failedObjects.length,
                failedObjects: failedObjects.map(f => f.objectName).slice(0, 10) // Log first 10
            });
        }

        return {
            timestamp: Date.now(),
            totalRelationships,
            relationships: { outgoing: outgoingRelationships, incoming: incomingRelationships }
        };
    } catch (error) {
        logger.error('[Relationships:fetchREST] REST API fetch failed', { error: error.message });
        throw error;
    }
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Handles the message to fetch all relationships.
 * @param {Object} message - The message object.
 * @param {Function} sendResponse - The response callback.
 */
export async function handleFetchAllRelationships(message, sendResponse) {
    const { instanceUrl, apiVersion, forceRefresh } = message;

    if (!instanceUrl) {
        sendResponse({ success: false, error: 'Missing instanceUrl' });
        return;
    }

    const cacheKey = getRelationshipCacheKey(instanceUrl);

    // Check cache first
    if (!forceRefresh) {
        const cached = await getRelationshipCache(cacheKey);
        if (isRelationshipCacheValid(cached)) {
            const cacheAge = Date.now() - cached.timestamp;
            const cacheAgeHours = (cacheAge / (1000 * 60 * 60)).toFixed(1);
            logger.info('[Relationships:handleFetch] Using cached relationships', {
                totalRelationships: cached.totalRelationships,
                cacheAgeHours,
                objectsWithOutgoing: Object.keys(cached.relationships?.outgoing || {}).length,
                objectsWithIncoming: Object.keys(cached.relationships?.incoming || {}).length
            });
            sendResponse({ success: true, data: cached, fromCache: true });
            return;
        }
        logger.info('[Relationships:handleFetch] Cache expired or invalid, fetching fresh data');
    } else {
        logger.info('[Relationships:handleFetch] Force refresh requested, fetching fresh data');
    }

    try {
        const sessionId = await extractSessionIdFromCookies(instanceUrl);

        if (!sessionId) {
            sendResponse({
                success: false,
                error: 'No valid session ID found. Please log in to Salesforce first.'
            });
            return;
        }

        const version = apiVersion || '66.0';

        // Fetch relationships
        const relationshipData = await fetchRelationshipsViaRestApi(
            instanceUrl,
            version,
            sessionId
        );

        // Store in cache
        await storeRelationshipCache(cacheKey, relationshipData);

        logger.info('[Relationships:handleFetch] Relationships cached successfully', {
            totalRelationships: relationshipData.totalRelationships
        });
        sendResponse({ success: true, data: relationshipData, fromCache: false });

    } catch (error) {
        logger.error('[Relationships:handleFetch] Relationship fetch failed', { error: error.message });
        sendResponse({
            success: false,
            error: error.message || 'Failed to fetch relationships'
        });
    }
}

/**
 * Handles the message to invalidate the relationship cache.
 * @param {Object} message - The message object.
 * @param {Function} sendResponse - The response callback.
 */
export async function handleInvalidateRelationshipCache(message, sendResponse) {
    const { instanceUrl } = message;

    if (!instanceUrl) {
        sendResponse({ success: false, error: 'Missing instanceUrl' });
        return;
    }

    const cacheKey = getRelationshipCacheKey(instanceUrl);
    await clearRelationshipCache(cacheKey);

    sendResponse({ success: true });
}
