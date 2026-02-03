/**
 * Salesforce Schema Explorer - Metadata Fetching
 */

import { logger, shouldExcludeObject } from '../utils.js';
import { fetchWithRetry, MAX_RETRY_ATTEMPTS } from '../api.js';
import { METADATA_BATCH_SIZE, METADATA_BATCH_DELAY_MS } from './config.js';

/**
 * Filters the list of objects to determine which ones should have their metadata fetched.
 * @param {Array<Object>} allObjects - List of all objects from describeGlobal.
 * @returns {Array<Object>} Filtered list of objects.
 */
export function filterObjectsForMetadataFetch(allObjects) {
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
export async function batchFetchObjectMetadata(instanceUrl, apiVersion, objectNames, sessionId, isSetupDomain) {
    const metadataMap = {};
    const failedObjects = [];

    const totalBatches = Math.ceil(objectNames.length / METADATA_BATCH_SIZE);
    logger.info('[Metadata:batchFetch] Starting metadata fetch', { 
        totalObjects: objectNames.length, 
        batchSize: METADATA_BATCH_SIZE,
        totalBatches 
    });

    for (let i = 0; i < objectNames.length; i += METADATA_BATCH_SIZE) {
        const batch = objectNames.slice(i, i + METADATA_BATCH_SIZE);
        const batchNumber = Math.floor(i / METADATA_BATCH_SIZE) + 1;

        // Fetch this batch in parallel
        const batchPromises = batch.map(objectName =>
            fetchWithRetry(
                `${instanceUrl}/services/data/v${apiVersion}/sobjects/${objectName}/describe`,
                MAX_RETRY_ATTEMPTS,
                sessionId,
                isSetupDomain
            ).then(metadata => ({ objectName, metadata, success: true }))
                .catch(error => {
                    // Collect failures for summary logging (no logging in loop)
                    return { objectName, metadata: null, success: false, error: error.message };
                })
        );

        const results = await Promise.all(batchPromises);
        
        // Process results without logging in loop
        results.forEach(result => {
            if (result.success && result.metadata) {
                metadataMap[result.objectName] = result.metadata;
            } else {
                failedObjects.push({ objectName: result.objectName, error: result.error });
            }
        });

        // Delay before next batch (except after last batch)
        if (i + METADATA_BATCH_SIZE < objectNames.length) {
            await new Promise(resolve => setTimeout(resolve, METADATA_BATCH_DELAY_MS));
        }
    }

    // Summary logging after all batches complete
    const successCount = Object.keys(metadataMap).length;
    logger.info('[Metadata:batchFetch] Metadata fetch completed', {
        totalRequested: objectNames.length,
        successCount,
        failedCount: failedObjects.length,
        successRate: `${((successCount / objectNames.length) * 100).toFixed(1)}%`
    });

    if (failedObjects.length > 0) {
        logger.warn('[Metadata:batchFetch] Some objects failed to fetch', {
            failedCount: failedObjects.length,
            failedObjects: failedObjects.map(f => f.objectName).slice(0, 10) // Log first 10
        });
    }

    return metadataMap;
}
