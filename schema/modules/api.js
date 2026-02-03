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
    // Serve from Normalized Nodes if available
    if (state.nodes && state.nodes[objectApiName]) {
        const node = state.nodes[objectApiName];

        // Check if valid (has fields)
        if (node.fields && Object.keys(node.fields).length > 0) {
            const fields = Object.values(node.fields);
            const metadata = {
                name: node.info.name,
                label: node.info.label,
                custom: node.info.custom,
                queryable: node.info.queryable,
                createable: node.info.createable,
                updateable: node.info.updateable,
                deletable: node.info.deletable,
                keyPrefix: node.info.keyPrefix,
                fields
            };

            state.metadata.set(objectApiName, metadata);
            logger.debug('[API:fetchMetadata] Loaded from graph nodes cache', {
                object: objectApiName,
                fieldCount: fields.length
            });
            return metadata;
        } else {
            logger.debug('[API:fetchMetadata] Shadow node found, fetching full metadata from API', {
                object: objectApiName
            });
        }
    }

    if (state.metadata.has(objectApiName)) {
        const cached = state.metadata.get(objectApiName);
        logger.debug('[API:fetchMetadata] Loaded from in-memory metadata cache', {
            object: objectApiName,
            fieldCount: cached.fields?.length || 0
        });
        return cached;
    }

    logger.debug('[API:fetchMetadata] Fetching from Salesforce API', { object: objectApiName });
    const url = `${state.instanceUrl}/services/data/v${state.apiVersion}/sobjects/${objectApiName}/describe`;
    const data = await apiCall(url);
    state.metadata.set(objectApiName, data);
    logger.info('[API:fetchMetadata] Fetched and cached metadata', {
        object: objectApiName,
        fieldCount: data.fields?.length || 0
    });
    return data;
}

/**
 * Loads the normalized graph data (nodes and edges) from cache or backend.
 * Behavior is non-blocking if data exists in cache.
 * @param {boolean} [forceRefresh=false] - Whether to force a rebuild.
 * @returns {Promise<Object>} The graph data with nodes and edges.
 */
export async function loadObjectMetadataMap(forceRefresh = false) {
    logger.info('[API:loadMetadataMap] Loading graph data', { fromCache: !forceRefresh });

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'buildObjectMetadataMap',
            instanceUrl: state.instanceUrl,
            apiVersion: state.apiVersion,
            sessionId: state.sessionId,
            isSetupDomain: state.isSetupDomain,
            forceRefresh
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (response?.success && response.nodes) {
                const nodeCount = Object.keys(response.nodes || {}).length;
                const edgeCount = Object.keys(response.edges || {}).length;
                
                state.nodes = response.nodes;
                state.edges = response.edges; // Standardized: object format { [edgeId]: edge }
                
                logger.info('[API:loadMetadataMap] Graph data loaded', {
                    source: response.fromCache ? 'cache' : 'API',
                    nodeCount,
                    edgeCount,
                    timestamp: response.timestamp ? new Date(response.timestamp).toISOString() : 'N/A'
                });
                resolve({ nodes: response.nodes, edges: response.edges });
            } else {
                reject(new Error(response?.error || 'Failed to load graph data'));
            }
        });
    });
}

/**
 * Ensures metadata exists for the given root object and its neighbors.
 * Triggers a backend fetch if missing.
 * @param {string} rootObjectName - The object to center the graph on.
 * @returns {Promise<void>}
 */
export async function ensureGraphMetadata(rootObjectName) {
    if (!rootObjectName) return;

    logger.debug('[API:ensureGraphMetadata] Ensuring metadata for graph', { root: rootObjectName });

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'buildObjectMetadataMap',
            instanceUrl: state.instanceUrl,
            apiVersion: state.apiVersion,
            sessionId: state.sessionId,
            isSetupDomain: state.isSetupDomain,
            rootObjectName,
            forceRefresh: false
        }, (response) => {
            if (chrome.runtime.lastError) {
                logger.error('[API:ensureGraphMetadata] Runtime error', { error: chrome.runtime.lastError.message });
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (response?.success && response.nodes) {
                const nodeCount = Object.keys(response.nodes).length;
                const edgeCount = Object.keys(response.edges || {}).length;
                
                // Update our local state with the enriched map
                state.nodes = response.nodes;
                state.edges = response.edges;
                
                logger.info('[API:ensureGraphMetadata] Graph metadata ensured', {
                    rootObject: rootObjectName,
                    source: response.fromCache ? 'cache' : 'API',
                    nodeCount,
                    edgeCount
                });
                resolve();
            } else {
                reject(new Error(response?.error || 'Failed to ensure graph metadata'));
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
                // Clear normalized graph data
                state.nodes = {};
                state.edges = {};
                state.metadata.clear();
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
                const cacheAge = response.fromCache ? Date.now() - response.data.timestamp : 0;
                const cacheAgeHours = response.fromCache ? (cacheAge / (1000 * 60 * 60)).toFixed(1) : 0;
                
                logger.info('[API:loadRelationshipCache] Relationship cache loaded', {
                    source: response.fromCache ? 'cache' : 'API',
                    totalRelationships: response.data.totalRelationships,
                    cacheAgeHours: response.fromCache ? cacheAgeHours : 'N/A',
                    objectsWithOutgoing: Object.keys(response.data.relationships?.outgoing || {}).length,
                    objectsWithIncoming: Object.keys(response.data.relationships?.incoming || {}).length
                });
                
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
