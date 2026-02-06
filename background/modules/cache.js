/**
 * Salesforce Schema Explorer - Cache Utilities
 */

import { logger } from './utils.js';
import { getCanonicalHost } from './api.js';

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================


export const METADATA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;


// =============================================================================
// METADATA CACHE (IndexedDB)
// =============================================================================

/**
 * Generates a canonical cache key for metadata based on the instance URL.
 * Ensures consistent keys across different subdomains (lightning, setup, etc.)
 * @param {string} instanceUrl - The Salesforce instance URL.
 * @returns {string} The normalized cache key.
 */
export function getMetadataCacheKey(instanceUrl) {
    const canonicalHost = getCanonicalHost(instanceUrl);
    return `metadata_cache_${canonicalHost}`;
}

function initMetadataDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('sfSchemaExplorer', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('metadata')) {
                db.createObjectStore('metadata', { keyPath: 'cacheKey' });
            }
        };
    });
}

/**
 * Saves metadata map to IndexedDB.
 * @param {string} cacheKey - The cache key.
 * @param {Object} metadataMap - The metadata map to save.
 */
export async function saveMetadataToIndexedDb(cacheKey, metadataMap) {
    try {
        const db = await initMetadataDb();
        const transaction = db.transaction('metadata', 'readwrite');
        const store = transaction.objectStore('metadata');

        const cacheData = {
            cacheKey,
            data: metadataMap,
            timestamp: Date.now(),
            ttl: METADATA_CACHE_TTL_MS
        };

        await new Promise((resolve, reject) => {
            const request = store.put(cacheData);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });

        db.close();
    } catch (error) {
        logger.warn('[Cache:IndexedDB] Save failed', { error: error.message });
    }
}

/**
 * Loads metadata map from IndexedDB.
 * @param {string} cacheKey - The cache key.
 * @returns {Promise<Object|null>} The cached data object or null if not found/expired/error.
 */
export async function loadMetadataFromIndexedDb(cacheKey) {
    try {
        const db = await initMetadataDb();
        const transaction = db.transaction('metadata', 'readonly');
        const store = transaction.objectStore('metadata');

        const cacheData = await new Promise((resolve, reject) => {
            const request = store.get(cacheKey);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });

        db.close();

        if (!cacheData) return null;

        // Check if cache is expired
        const age = Date.now() - cacheData.timestamp;
        if (age > cacheData.ttl) {
            await deleteMetadataFromIndexedDb(cacheKey);
            return null;
        }

        return {
            data: cacheData.data,
            timestamp: cacheData.timestamp,
            fromCache: true
        };
    } catch (error) {
        logger.warn('[Cache:IndexedDB] Load failed', { error: error.message });
        return null;
    }
}

/**
 * Deletes metadata from IndexedDB.
 * @param {string} cacheKey - The cache key.
 */
export async function deleteMetadataFromIndexedDb(cacheKey) {
    try {
        const db = await initMetadataDb();
        const transaction = db.transaction('metadata', 'readwrite');
        const store = transaction.objectStore('metadata');

        await new Promise((resolve, reject) => {
            const request = store.delete(cacheKey);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });

        db.close();
    } catch (error) {
        logger.warn('[Cache:IndexedDB] Delete failed', { error: error.message });
    }
}
