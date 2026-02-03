/**
 * Salesforce Schema Explorer - Graph Visualization
 */

import { state, elements } from './state.js';
import { logger } from './utils.js';
import { fetchObjectMetadata } from './api.js';
import { getActiveRelationships } from './ui.js';
import { showDetailsPanel, hideDetailsPanel, hideRelationshipPopover, updateLegendCounts, updateObjectsCount } from './ui.js';
import { loadObjectExclusions } from './storage.js';

// Global from excludedObjects.js
import { isObjectExcluded } from './excludedObjects.js';

// =============================================================================
// GRAPH BUILDING
// =============================================================================

/**
 * Builds the graph visualization for a given root object.
 * @param {Object} mainMetadata - The metadata of the root object.
 * @returns {Promise<void>}
 */
export async function buildGraph(mainMetadata) {
    // Load user object exclusions for this root
    state.userExcludedObjects = loadObjectExclusions(mainMetadata.name);

    updateLegendCounts();
    updateObjectsCount();

    // Use Normalized Edges
    const edgesList = state.edges ? Object.values(state.edges) : [];
    const totalEdgesInCache = edgesList.length;

    logger.info('[Graph:build] Building graph visualization', {
        mainObject: mainMetadata.name,
        totalEdgesInCache,
        activeView: state.activeRelationshipView,
        userExcludedCount: state.userExcludedObjects.size
    });

    // Build the set of related objects from Edges
    const relatedObjects = new Set();
    const edgesToRender = [];
    let excludedBySystem = 0;
    let excludedByUser = 0;

    // Filter relevant edges (connected to Main AND matching active view)
    for (const edge of edgesList) {
        // Must be connected to main
        if (edge.source !== mainMetadata.name && edge.target !== mainMetadata.name) continue;

        // Filter by active relationship view (tab)
        const isOutgoing = edge.source === mainMetadata.name;
        const isIncoming = edge.target === mainMetadata.name;

        if (state.activeRelationshipView === 'outgoing' && !isOutgoing) continue;
        if (state.activeRelationshipView === 'incoming' && !isIncoming) continue;
        // 'all' shows both outgoing and incoming

        const neighbor = isOutgoing ? edge.target : edge.source;

        if (isObjectExcluded(neighbor)) {
            excludedBySystem++;
            continue;
        }
        if (state.userExcludedObjects.has(neighbor)) {
            excludedByUser++;
            continue;
        }

        relatedObjects.add(neighbor);
        edgesToRender.push(edge);
    }

    logger.info('[Graph:build] Graph scope determined', {
        relatedObjects: relatedObjects.size,
        edgesToRender: edgesToRender.length,
        excludedBySystem,
        excludedByUser
    });

    // Fetch metadata for related objects (no logging in Promise.allSettled)
    await Promise.allSettled([...relatedObjects].map(objectName => fetchObjectMetadata(objectName).catch(() => { })));

    // Build nodes: main object first, then each related object
    const nodes = [{
        data: { id: mainMetadata.name, label: mainMetadata.label || mainMetadata.name, isMain: 'true', hasMetadata: 'true' }
    }];

    for (const objectName of relatedObjects) {
        let objectMetadata = state.metadata.get(objectName);
        const nodeData = state.nodes?.[objectName];
        let hasMetadata = objectMetadata !== undefined;

        if (!hasMetadata && nodeData) {
            // Check if it's a shadow node (has no fields)
            const fieldCount = Object.keys(nodeData.fields || {}).length;
            hasMetadata = fieldCount > 0;
        }

        nodes.push({
            data: {
                id: objectName,
                label: objectMetadata?.label ?? objectName,
                isMain: 'false',
                hasMetadata: hasMetadata ? 'true' : 'false'
            }
        });
    }

    // Helper: should we include this edge? (both endpoints must be in the graph)
    const shouldIncludeEdge = (source, target) => {
        if (source !== mainMetadata.name && !relatedObjects.has(source)) return false;
        if (target !== mainMetadata.name && !relatedObjects.has(target)) return false;
        return true;
    };

    // Build edges (Cytoscape format)
    const edges = edgesToRender.map((edge, index) => {
        const isOutgoing = edge.source === mainMetadata.name;

        let label = 'Lookup';
        let type = 'lookup';

        if (edge.isMasterDetail) {
            type = 'masterDetail';
            if (edge.order === 0) label = 'MD (Primary)';
            else if (edge.order === 1) label = 'MD (Secondary)';
            else label = 'MD';
        }

        return {
            data: {
                id: `edge-${index}`,
                source: edge.source,
                target: edge.target,
                label: label,
                relationshipType: type,
                direction: isOutgoing ? 'outgoing' : 'incoming'
            }
        };
    });

    logger.info('[Graph:build] Graph visualization rendered', {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        mainObject: mainMetadata.name,
        relatedObjects: relatedObjects.size
    });

    if (state.cy) state.cy.destroy();

    state.cy = cytoscape({
        container: elements.cyContainer,
        elements: { nodes, edges },
        style: getCytoscapeStyles(),
        layout: getOptimalLayout(nodes.length),
        minZoom: 0.2,
        maxZoom: 3,
        boxSelectionEnabled: false
    });

    // Interaction listeners
    state.cy.on('tap', 'node', async e => {
        const node = e.target;
        const objectName = node.id();

        hideRelationshipPopover();

        // Lazy Load: Check if we have metadata for this node
        let hasMetadata = node.data('hasMetadata') === 'true';

        if (!hasMetadata) {
            // It's a shallow node. Try to fetch metadata for it so we can show details.
            try {
                const { fetchObjectMetadata } = await import('./api.js');
                const metadata = await fetchObjectMetadata(objectName);
                if (metadata) {
                    node.data('hasMetadata', 'true');
                    hasMetadata = true;
                }
            } catch (err) {
                logger.warn('[Graph:tap] Failed to lazy-load metadata for node', { object: objectName });
            }
        }

        if (!hasMetadata) return;

        const detailsPanel = document.getElementById('details-panel');
        const isPanelOpen = !detailsPanel.classList.contains('hidden');
        const currentTitle = document.getElementById('details-title').textContent;
        const clickedLabel = node.data('label');

        // Toggle logic: Close if already open for the same node, otherwise open
        if (isPanelOpen && currentTitle === clickedLabel) {
            hideDetailsPanel();
        } else {
            showDetailsPanel(node.id());
        }
    });

    state.cy.on('mouseover', 'node', e => {
        const hasMetadata = e.target.data('hasMetadata') === 'true';
        elements.cyContainer.style.cursor = hasMetadata ? 'pointer' : 'default';
        if (hasMetadata) elements.cyContainer.title = 'Click to view fields';
    });

    state.cy.on('mouseout', 'node', () => {
        elements.cyContainer.style.cursor = 'default';
        elements.cyContainer.title = '';
    });
    state.cy.on('tap', e => { if (e.target === state.cy) { hideDetailsPanel(); hideRelationshipPopover(); } });
    state.cy.on('layoutstop', () => setTimeout(() => state.cy.fit(50), 100));
}

function getOptimalLayout(nodeCount) {
    if (nodeCount <= 8) {
        return { name: 'concentric', concentric: n => n.data('isMain') === 'true' ? 10 : 1, levelWidth: () => 1, minNodeSpacing: 120, spacingFactor: 1.8, padding: 80, animate: true, animationDuration: 500 };
    }
    if (nodeCount <= 20) {
        return { name: 'cose', animate: true, animationDuration: 500, nodeRepulsion: 20000, idealEdgeLength: 220, padding: 80, gravity: 0.2 };
    }
    return { name: 'breadthfirst', directed: true, roots: 'node[isMain = "true"]', padding: 80, spacingFactor: 2, animate: true, animationDuration: 500 };
}

function getCytoscapeStyles() {
    return [
        { selector: 'node', style: { 'shape': 'round-rectangle', 'width': 180, 'height': 70, 'background-color': '#6b7280', 'border-width': 2, 'border-color': '#4b5563', 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center', 'color': '#fff', 'font-size': 14, 'font-weight': 600, 'text-wrap': 'wrap', 'text-max-width': 160 } },
        { selector: 'node[isMain = "true"]', style: { 'background-color': '#0176d3', 'border-color': '#014486', 'border-width': 3, 'width': 220, 'height': 85, 'font-size': 16, 'font-weight': 700 } },
        { selector: 'node[hasMetadata = "false"]', style: { 'background-color': '#9ca3af', 'opacity': 0.85 } },
        { selector: 'node:active', style: { 'overlay-color': '#0176d3', 'overlay-padding': 10, 'overlay-opacity': 0.2 } },
        { selector: 'node:selected', style: { 'border-width': 4, 'border-color': '#0176d3' } },
        { selector: 'edge', style: { 'width': 2, 'line-color': '#6366f1', 'target-arrow-color': '#6366f1', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'label': 'data(label)', 'font-size': 11, 'text-background-color': '#f4f6f9', 'text-background-opacity': 1, 'text-background-padding': 4 } },
        { selector: 'edge[direction = "incoming"]', style: { 'line-color': '#6366f1', 'target-arrow-color': '#6366f1', 'line-style': 'dashed', 'line-dash-pattern': [6, 3], 'width': 2 } },
        { selector: 'edge[relationshipType = "masterDetail"]', style: { 'line-color': '#dc2626', 'target-arrow-color': '#dc2626', 'width': 3 } },
        { selector: 'edge[relationshipType = "masterDetail"][direction = "incoming"]', style: { 'line-color': '#b91c1c', 'target-arrow-color': '#b91c1c', 'line-style': 'dashed' } }
    ];
}

// =============================================================================
// CONTROLS
// =============================================================================

/**
 * Fits the graph to the viewport.
 */
export function fitGraph() { if (state.cy) state.cy.fit(50); }

/**
 * Centers the viewport on the main object node.
 */
export function centerOnMain() {
    if (!state.cy) return;
    const main = state.cy.nodes('[isMain = "true"]');
    if (main.length) state.cy.animate({ center: { eles: main }, zoom: 1.2, duration: 300 });
}

/**
 * Resets the graph layout to the optimal one for the node count.
 */
export function resetLayout() {
    if (state.cy) state.cy.layout(getOptimalLayout(state.cy.nodes().length)).run();
}

/**
 * Refresh graph visibility based on current exclusion state
 * Re-runs the graph build process using cached metadata
 */
export async function refreshGraphVisibility() {
    if (!state.objectApiName) return;

    const mainMetadata = state.metadata.get(state.objectApiName);
    if (mainMetadata) {
        await buildGraph(mainMetadata);
    }
}
