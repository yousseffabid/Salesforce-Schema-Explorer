/**
 * Salesforce Schema Explorer - API Interactions
 */

import { state } from './state.js';
import { logger } from './utils.js';
import { updateCacheStatusUI, startLoadingOperation, completeLoadingOperation } from './ui.js';

/**
 * Makes a generic API call to Salesforce.
 * @param {string} url - The full URL to call.
 * @returns {Promise<any>} The JSON response.
 */
export async function apiCall(url) {
    logger.debug('[API:call] Executing API call', { url });

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'fetchApi',
            url,
            sessionId: state.sessionId,
            isSetupDomain: state.isSetupDomain
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (response?.success) {
                resolve(response.data);
            } else {
                const error = response?.error || 'API request failed';
                if (error.includes('401') || error.includes('INVALID_SESSION_ID')) {
                    reject(new Error('Authentication failed.\n\nPlease ensure you are logged in to Salesforce and try again.'));
                } else {
                    reject(new Error(error));
                }
            }
        });
    });
}

/**
 * Fetches all available SObjects from Salesforce.
 * @returns {Promise<Array<Object>>} List of SObjects.
 */
export async function fetchSObjects() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'fetchSObjects',
            instanceUrl: state.instanceUrl,
            apiVersion: state.apiVersion,
            sessionId: state.sessionId,
            isSetupDomain: state.isSetupDomain
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.success) {
                resolve(response.objects);
            } else {
                reject(new Error(response?.error || 'Failed to fetch objects'));
            }
        });
    });
}

/**
 * Fetches the latest available API version.
 * @returns {Promise<string>} The API version string (e.g., "60.0").
 */
export async function fetchLatestApiVersion() {
    const data = await apiCall(`${state.instanceUrl}/services/data/`);
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Could not retrieve API versions');
    }
    return data[data.length - 1].version;
}

/**
 * Fetches metadata for a specific object.
 * Tries the Metadata Map first, then in-memory cache, then API.
 * @param {string} objectApiName - The API name of the object.
 * @returns {Promise<Object>} The object metadata.
 */
export async function fetchObjectMetadata(objectApiName) {
    // Serve from Object Metadata Map if available
    if (state.objectMetadataMap && state.objectMetadataMap[objectApiName]) {
        const mapEntry = state.objectMetadataMap[objectApiName];

        // Convert map structure to legacy metadata format
        const fields = Object.values(mapEntry.fields);
        const metadata = {
            name: mapEntry.info.name,
            label: mapEntry.info.label,
            custom: mapEntry.info.custom,
            queryable: mapEntry.info.queryable,
            createable: mapEntry.info.createable,
            updateable: mapEntry.info.updateable,
            deletable: mapEntry.info.deletable,
            keyPrefix: mapEntry.info.keyPrefix,
            fields
        };

        state.metadata.set(objectApiName, metadata);
        logger.debug('[API:fetchMetadata] Metadata loaded from Metadata Map', { object: objectApiName });
        return metadata;
    }

    if (state.metadata.has(objectApiName)) {
        logger.debug('[API:fetchMetadata] Metadata loaded from in-memory cache', { object: objectApiName });
        return state.metadata.get(objectApiName);
    }

    logger.debug('[API:fetchMetadata] Fetching metadata from API', { object: objectApiName });
    const url = `${state.instanceUrl}/services/data/v${state.apiVersion}/sobjects/${objectApiName}/describe`;
    const data = await apiCall(url);
    state.metadata.set(objectApiName, data);
    logger.debug('[API:fetchMetadata] Metadata fetched from API', { object: objectApiName });
    return data;
}

/**
 * Loads the Object Metadata Map, either from cache or by building it.
 * @param {boolean} [forceRefresh=false] - Whether to force a rebuild.
 * @returns {Promise<Object>} The metadata map.
 */
export async function loadObjectMetadataMap(forceRefresh = false) {
    if (state.metadataMapLoading) return state.objectMetadataMap;

    state.metadataMapLoading = true;
    logger.info('[API:loadMetadataMap] Loading map', { fromCache: !forceRefresh });

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'buildObjectMetadataMap',
            instanceUrl: state.instanceUrl,
            apiVersion: state.apiVersion,
            sessionId: state.sessionId,
            isSetupDomain: state.isSetupDomain,
            forceRefresh
        }, (response) => {
            state.metadataMapLoading = false;

            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (response?.success && response.metadataMap) {
                state.objectMetadataMap = response.metadataMap;
                logger.info('[API:loadMetadataMap] Map loaded', { count: Object.keys(response.metadataMap).length, fromCache: response.fromCache });
                resolve(response.metadataMap);
            } else {
                reject(new Error(response?.error || 'Failed to build Object Metadata Map'));
            }
        });
    });
}

/**
 * Clears the object metadata cache in the background.
 * @returns {Promise<void>}
 */
export async function clearObjectMetadataCache() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'clearMetadataCache',
            instanceUrl: state.instanceUrl
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (response?.success) {
                state.objectMetadataMap = null;
                logger.info('[API:clearMetadataCache] Cache cleared');
                resolve();
            } else {
                reject(new Error(response?.error || 'Failed to clear cache'));
            }
        });
    });
}

/**
 * Loads the relationship cache in the background.
 * @param {boolean} [forceRefresh=false] - Whether to force a refresh.
 * @param {boolean} [updateUI=true] - Whether to show loading UI.
 * @returns {Promise<Object>} The relationship cache data.
 */
export async function loadRelationshipCache(forceRefresh = false, updateUI = true) {
    if (state.relationshipCacheLoading) return;

    state.relationshipCacheLoading = true;
    if (updateUI) {
        logger.debug('[API:loadRelationshipCache] Called with updateUI=true');
        startLoadingOperation();
    }

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'fetchAllRelationships',
            instanceUrl: state.instanceUrl,
            apiVersion: state.apiVersion,
            sessionId: state.sessionId,
            isSetupDomain: state.isSetupDomain,
            forceRefresh
        }, (response) => {
            state.relationshipCacheLoading = false;

            if (chrome.runtime.lastError) {
                logger.error('[API:loadRelationshipCache] Runtime error', { error: chrome.runtime.lastError.message });
                if (updateUI) completeLoadingOperation();
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (response?.success && response.data) {
                state.relationshipCache = response.data;
                logger.info('[API:loadRelationshipCache] Cache loaded', { count: response.data.totalRelationships });
                if (updateUI) {
                    completeLoadingOperation(response.data.timestamp, response.fromCache);
                }
                resolve(response.data);
            } else {
                logger.error('[API:loadRelationshipCache] Load failed', { error: response?.error });
                if (updateUI) completeLoadingOperation();
                reject(new Error(response?.error || 'Failed to load relationship cache'));
            }
        });
    });
}

/**
 * Invalidates the relationship cache in the background.
 * @returns {Promise<void>}
 */
export async function refreshRelationshipCache() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'invalidateRelationshipCache',
            instanceUrl: state.instanceUrl
        }, (response) => {
            if (response?.success) {
                resolve();
            } else {
                reject(new Error(response?.error || 'Failed to invalidate cache'));
            }
        });
    });
}
