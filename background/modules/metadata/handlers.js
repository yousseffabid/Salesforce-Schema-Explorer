/**
 * Salesforce Schema Explorer - Metadata Handlers
 */

import { logger, isSystemObject } from '../utils.js';
import { getMetadataCacheKey, loadMetadataFromIndexedDb, saveMetadataToIndexedDb, deleteMetadataFromIndexedDb } from '../cache.js';
import { extractSessionIdFromCookies } from '../auth.js';
import { batchFetchObjectMetadata } from './fetch.js';
import { stripMetadataFields, buildObjectMetadataMap } from './transform.js';

function isShadowNode(node) {
    return !node?.fields || Object.keys(node.fields).length === 0;
}

function isMissingOrShadow(nodes, objectName) {
    return !nodes?.[objectName] || isShadowNode(nodes[objectName]);
}

/**
 * Handles the message to build or fetch the Object Metadata Map.
 * Supports lazy loading by fetching only the specified root object and its neighbors.
 * @param {Object} message - The message object.
 * @param {Function} sendResponse - The response callback.
 */
export async function handleBuildObjectMetadataMap(message, sendResponse) {
    const { instanceUrl, apiVersion, isSetupDomain, forceRefresh, rootObjectName } = message;

    if (!instanceUrl || !apiVersion) {
        sendResponse({ success: false, error: 'Missing instanceUrl or apiVersion' });
        return;
    }

    try {
        // Load Cache
        const { nodes, edges, cachedTimestamp, shouldReturnImmediately } = await loadInitialCache(instanceUrl, forceRefresh, rootObjectName);

        if (shouldReturnImmediately) {
            const cacheAge = Date.now() - cachedTimestamp;
            const cacheAgeHours = (cacheAge / (1000 * 60 * 60)).toFixed(1);
            logger.info('[Metadata:handleBuild] Using cached graph data', {
                nodeCount: Object.keys(nodes).length,
                edgeCount: Object.keys(edges).length,
                cacheAgeHours
            });
            sendResponse({ success: true, nodes, edges, fromCache: true, timestamp: cachedTimestamp });
            return;
        }

        // Verify Session
        const sessionId = await extractSessionIdFromCookies(instanceUrl);
        if (!sessionId) {
            sendResponse({ success: false, error: 'No valid session ID found. Please log in to Salesforce first.' });
            return;
        }

        // Determine Missing Objects
        const objectsToFetch = determineObjectsToFetch(rootObjectName, nodes, edges);
        const initialNodeCount = Object.keys(nodes).length;
        const initialEdgeCount = Object.keys(edges).length;

        // Fetch & Merge
        let isUpdated = false;
        if (objectsToFetch.size > 0) {
            logger.info('[Metadata:handleBuild] Lazy loading initiated', {
                rootObject: rootObjectName,
                missingObjects: objectsToFetch.size,
                existingNodes: initialNodeCount,
                existingEdges: initialEdgeCount
            });
            isUpdated = await fetchAndMergeMissingObjects(
                instanceUrl, apiVersion, sessionId, isSetupDomain,
                objectsToFetch, rootObjectName, nodes, edges
            );
        } else {
            logger.info('[Metadata:handleBuild] All required objects already cached', {
                rootObject: rootObjectName,
                nodeCount: initialNodeCount,
                edgeCount: initialEdgeCount
            });
        }

        // Save & Respond
        const finalNodeCount = Object.keys(nodes).length;
        const finalEdgeCount = Object.keys(edges).length;

        if (isUpdated) {
            const cacheKey = getMetadataCacheKey(instanceUrl);
            await saveMetadataToIndexedDb(cacheKey, { nodes, edges });
            logger.info('[Metadata:handleBuild] Cache updated with new data', {
                nodesAdded: finalNodeCount - initialNodeCount,
                edgesAdded: finalEdgeCount - initialEdgeCount,
                totalNodes: finalNodeCount,
                totalEdges: finalEdgeCount
            });
        } else {
            logger.info('[Metadata:handleBuild] Returning existing graph data', {
                nodeCount: finalNodeCount,
                edgeCount: finalEdgeCount
            });
        }

        sendResponse({
            success: true,
            nodes,
            edges,
            fromCache: !isUpdated,
            timestamp: Date.now()
        });

    } catch (error) {
        logger.error('[Metadata:handleBuild] Error building Object Metadata Map', { error: error.message });
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Helper: Loads initial metadata from IndexedDB.
 */
async function loadInitialCache(instanceUrl, forceRefresh, rootObjectName) {
    let nodes = {};
    let edges = {}; // Standardized: always an object { [edgeId]: edge }
    let cachedTimestamp = null;
    let shouldReturnImmediately = false;

    if (!forceRefresh) {
        const cacheKey = getMetadataCacheKey(instanceUrl);
        const cached = await loadMetadataFromIndexedDb(cacheKey);

        if (cached && cached.data.nodes) {
            nodes = cached.data.nodes;
            edges = cached.data.edges || {}; // Assumes object format (standardized)

            cachedTimestamp = cached.timestamp;

            if (!rootObjectName) {
                shouldReturnImmediately = true;
            }
        }
    }
    return { nodes, edges, cachedTimestamp, shouldReturnImmediately };
}

function determineObjectsToFetch(rootObjectName, nodes, edges) {
    const objectsToFetch = new Set();

    if (rootObjectName) {
        // If root is missing OR only a shadow node, fetch it to ensure edges are complete.
        if (isMissingOrShadow(nodes, rootObjectName)) {
            objectsToFetch.add(rootObjectName);
        } else {
            // Check neighbors from edges (standardized as object)
            Object.values(edges).forEach(edge => {
                if (edge.source === rootObjectName && isMissingOrShadow(nodes, edge.target) && !isSystemObject(edge.target)) {
                    objectsToFetch.add(edge.target);
                }
                if (edge.target === rootObjectName && isMissingOrShadow(nodes, edge.source) && !isSystemObject(edge.source)) {
                    objectsToFetch.add(edge.source);
                }
            });
        }
    }
    return objectsToFetch;
}

/**
 * Helper: Merges new edges into the existing map without losing high-quality data.
 * Prevents "incoming best guess" edges from overwriting "outgoing describe" edges.
 * @param {Object} existingEdges - The current edge map.
 * @param {Object} newEdges - The newly discovered edges.
 */
function mergeEdges(existingEdges, newEdges) {
    for (const [id, newEdge] of Object.entries(newEdges)) {
        const existingEdge = existingEdges[id];

        if (!existingEdge) {
            existingEdges[id] = newEdge;
            continue;
        }

        // Logic for merging:
        // 1. Data Source Quality: Describe > Discovery (Guess)
        // 2. Structural Preference: Master-Detail > Lookup

        const isNewEdgeGuess = newEdge.discoveredFromDescribe === false;
        const isExistingEdgeReal = existingEdge.discoveredFromDescribe === true;
        const isExistingMD = existingEdge.isMasterDetail === true;
        const isNewMD = newEdge.isMasterDetail === true;

        // Don't overwrite Describe data with a Guess
        if (isNewEdgeGuess && isExistingEdgeReal) {
            continue;
        }

        // Don't downgrade MD to Lookup if the new one is just a guess
        if (isExistingMD && !isNewMD && isNewEdgeGuess) {
            continue;
        }

        // If existing is a guess but new is real, OR if new discovered MD where existing was lookup guess
        existingEdges[id] = newEdge;
    }
}

/**
 * Helper: Fetches missing objects in batches and merges them into the map.
 * Standardized to work with edges as an object { [edgeId]: edge }.
 */
async function fetchAndMergeMissingObjects(instanceUrl, apiVersion, sessionId, isSetupDomain, objectsToFetch, rootObjectName, nodes, edges) {
    let missingRootData = null;
    let rootNodes = null;
    let rootEdges = null;

    // Fetch Root Object
    if (objectsToFetch.has(rootObjectName)) {
        const rootMap = await batchFetchObjectMetadata(instanceUrl, apiVersion, [rootObjectName], sessionId, isSetupDomain);
        if (rootMap[rootObjectName]) {
            missingRootData = rootMap[rootObjectName];

            // Transform once and cache the result
            const transformed = buildObjectMetadataMap({ [rootObjectName]: missingRootData });
            rootNodes = transformed.nodes;
            rootEdges = transformed.edges; // Now an object { [id]: edge }

            // Discover neighbors from root edges
            Object.values(rootEdges).forEach(edge => {
                if (edge.source === rootObjectName && isMissingOrShadow(nodes, edge.target) && !isSystemObject(edge.target)) {
                    objectsToFetch.add(edge.target);
                }
                // Check incoming (Shadow nodes might have been created)
                if (edge.target === rootObjectName && isMissingOrShadow(nodes, edge.source) && !isSystemObject(edge.source)) {
                    objectsToFetch.add(edge.source);
                }
            });
        }
        objectsToFetch.delete(rootObjectName);
    }

    // Fetch neighbors
    const neighborsToFetch = [...objectsToFetch];
    if (neighborsToFetch.length > 0) {
        const neighborsMap = await batchFetchObjectMetadata(instanceUrl, apiVersion, neighborsToFetch, sessionId, isSetupDomain);
        const { nodes: newNodes, edges: newEdges } = buildObjectMetadataMap(neighborsMap);

        // Merge Nodes
        Object.assign(nodes, newNodes);

        // Merge Edges (using smart logic)
        mergeEdges(edges, newEdges);
    }

    // Merge Root (if we have cached root data)
    if (missingRootData && rootNodes && rootEdges) {
        Object.assign(nodes, rootNodes);
        mergeEdges(edges, rootEdges);
    }

    return true;
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
