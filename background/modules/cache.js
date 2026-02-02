/**
 * Salesforce Schema Explorer - Cache Utilities
 */

import { logger } from './utils.js';

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

export const RELATIONSHIP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const METADATA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// =============================================================================
// RELATIONSHIP CACHE (chrome.storage.local)
// =============================================================================

/**
 * Generates a cache key for relationship data based on the instance URL.
 * @param {string} instanceUrl - The Salesforce instance URL.
 * @returns {string} The cache key.
 */
export function getRelationshipCacheKey(instanceUrl) {
    try {
        const hostname = new URL(instanceUrl).hostname.toLowerCase();
        return `relationships_${hostname.replace(/\./g, '_')}`;
    } catch {
        return 'relationships_default';
    }
}

/**
 * Checks if the cached relationship data is valid and not expired.
 * @param {Object} cachedData - The cached data object.
 * @returns {boolean} True if valid, false otherwise.
 */
export function isRelationshipCacheValid(cachedData) {
    if (!cachedData?.timestamp || !cachedData?.relationships) {
        return false;
    }
    return (Date.now() - cachedData.timestamp) < RELATIONSHIP_CACHE_TTL_MS;
}

/**
 * Stores relationship data in local storage.
 * @param {string} key - The cache key.
 * @param {Object} data - The data to store.
 */
export async function storeRelationshipCache(key, data) {
    try {
        await chrome.storage.local.set({ [key]: data });
        logger.debug('[Cache:store] Relationship cache stored', { key });
    } catch (error) {
        logger.error('[Cache:store] Storage failed', { error: error.message });
    }
}

/**
 * Retrieves relationship data from local storage.
 * @param {string} key - The cache key.
 * @returns {Promise<Object|null>} The cached data or null if not found/error.
 */
export async function getRelationshipCache(key) {
    try {
        const result = await chrome.storage.local.get(key);
        return result[key] || null;
    } catch (error) {
        logger.error('[Cache:get] Retrieval failed', { error: error.message });
        return null;
    }
}

/**
 * Clears relationship data from local storage.
 * @param {string} key - The cache key.
 */
export async function clearRelationshipCache(key) {
    try {
        await chrome.storage.local.remove(key);
        logger.debug('[Cache:clear] Relationship cache cleared', { key });
    } catch (error) {
        logger.error('[Cache:clear] Clear failed', { error: error.message });
    }
}

// =============================================================================
// METADATA CACHE (IndexedDB)
// =============================================================================

/**
 * Generates a cache key for metadata based on the instance URL.
 * @param {string} instanceUrl - The Salesforce instance URL.
 * @returns {string} The cache key.
 */
export function getMetadataCacheKey(instanceUrl) {
    return `metadata_cache_${instanceUrl}`;
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
