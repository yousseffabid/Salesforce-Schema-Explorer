/**
 * Salesforce Schema Explorer - Relationship Utilities
 */

import { logger, shouldExcludeObject } from './utils.js';
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

        logger.info('[Relationships:fetchREST] Found queryable objects', { count: queryableObjects.length });

        const batchSize = 10;

        for (let i = 0; i < queryableObjects.length; i += batchSize) {
            const batch = queryableObjects.slice(i, i + batchSize);
            const describePromises = batch.map(objectName =>
                fetchWithRetry(
                    `${instanceUrl}/services/data/v${version}/sobjects/${objectName}/describe`,
                    MAX_RETRY_ATTEMPTS,
                    sessionId,
                    false
                ).then(data => ({ objectName, data }))
                    .catch(error => {
                        logger.warn('[Relationships:fetchREST] Failed to describe', { objectName, error: error.message });
                        return null;
                    })
            );

            const results = await Promise.all(describePromises);

            for (const result of results) {
                if (!result?.data) continue;

                const sourceObject = result.data.name;
                const sourceLabel = result.data.label;

                if (!result.data.fields) continue;

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

                if (result.data.childRelationships?.length > 0) {
                    for (const childRelationship of result.data.childRelationships) {
                        if (childRelationship.deprecatedAndHidden) continue;

                        if (shouldExcludeObject({
                            queryable: false,
                            deprecatedAndHidden: false,
                            createable: false,
                            name: childRelationship.childSObject
                        })) {
                            continue;
                        }

                        if (!incomingRelationships[sourceObject]) {
                            incomingRelationships[sourceObject] = [];
                        }

                        const isMasterDetailRelationship = childRelationship.cascadeDelete === true;

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

        return {
            timestamp: Date.now(),
            totalRelationships,
            relationships: { outgoing: outgoingRelationships, incoming: incomingRelationships }
        };
    } catch (error) {
        logger.error('[Relationships:fetchREST] REST API describe fallback failed', { error: error.message });
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
            logger.info('[Relationships:handleFetch] Returning cached relationships', { count: cached.totalRelationships });
            sendResponse({ success: true, data: cached, fromCache: true });
            return;
        }
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

        logger.info('[Relationships:handleFetch] Starting REST API fetch');

        // Directly use REST API now, no Tooling API fallback logic needed
        const relationshipData = await fetchRelationshipsViaRestApi(
            instanceUrl,
            version,
            sessionId
        );

        // Store in cache
        await storeRelationshipCache(cacheKey, relationshipData);

        logger.info('[Relationships:handleFetch] Fetch completed');
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
