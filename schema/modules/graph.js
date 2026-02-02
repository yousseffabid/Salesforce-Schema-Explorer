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

    const activeRelationships = getActiveRelationships();
    const allRelationships = [...activeRelationships.lookup, ...activeRelationships.masterDetail];

    logger.debug('[Graph:build] Building graph', { mainObject: mainMetadata.name, relationshipCount: allRelationships.length });

    // Build the set of related objects, excluding user-excluded and system-excluded
    const relatedObjects = new Set();
    for (const relationship of allRelationships) {
        const objToAdd = relationship.targetObject !== mainMetadata.name
            ? relationship.targetObject
            : relationship.sourceObject;

        if (!objToAdd || objToAdd === mainMetadata.name) continue;

        // Skip if system-excluded OR user-excluded
        if (isObjectExcluded(objToAdd)) continue;
        if (state.userExcludedObjects.has(objToAdd)) continue;

        relatedObjects.add(objToAdd);
    }

    logger.debug('[Graph:build] Graph scope determined', { relatedObjectCount: relatedObjects.size });

    // Fetch metadata for related objects
    await Promise.allSettled([...relatedObjects].map(objectName => fetchObjectMetadata(objectName).catch(() => { })));

    // Build nodes: main object first, then each related object
    const nodes = [{
        data: { id: mainMetadata.name, label: mainMetadata.label || mainMetadata.name, isMain: 'true', hasMetadata: 'true' }
    }];

    for (const objectName of relatedObjects) {
        const objectMetadata = state.metadata.get(objectName);
        const hasMetadata = objectMetadata !== undefined ||
            (state.objectMetadataMap?.[objectName] !== undefined);

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

    // Build edges
    const edges = [];
    let edgeIndex = 0;

    for (const relationship of activeRelationships.lookup) {
        const isOutgoing = relationship.sourceObject === mainMetadata.name;
        const source = isOutgoing ? mainMetadata.name : relationship.sourceObject;
        const target = isOutgoing ? relationship.targetObject : mainMetadata.name;

        if (!shouldIncludeEdge(source, target)) continue;

        edges.push({
            data: {
                id: `lookup-${edgeIndex++}`,
                source,
                target,
                label: 'Lookup',
                relationshipType: 'lookup',
                direction: isOutgoing ? 'outgoing' : 'incoming'
            }
        });
    }

    for (const relationship of activeRelationships.masterDetail) {
        const isOutgoing = relationship.sourceObject === mainMetadata.name;
        const source = isOutgoing ? mainMetadata.name : relationship.sourceObject;
        const target = isOutgoing ? relationship.targetObject : mainMetadata.name;

        if (!shouldIncludeEdge(source, target)) continue;

        // Determine MD Label (Primary/Secondary)
        let mdLabel = 'Master-Detail';
        // Note: relationshipOrder comes from buildObjectMetadataMap
        // It might be 0 (Primary), 1 (Secondary), or undefined (Fallback/Unknown)
        if (relationship.relationshipOrder === 0) {
            mdLabel = 'MD (Primary)';
        } else if (relationship.relationshipOrder === 1) {
            mdLabel = 'MD (Secondary)';
        } else {
            mdLabel = 'MD'; // Fallback for cascadeDelete proxies
        }

        edges.push({
            data: {
                id: `md-${edgeIndex++}`,
                source,
                target,
                label: mdLabel,
                relationshipType: 'masterDetail',
                direction: isOutgoing ? 'outgoing' : 'incoming'
            }
        });
    }

    logger.info('[Graph:build] Graph rendered', { nodes: nodes.length, edges: edges.length });

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
    state.cy.on('tap', 'node', e => {
        const node = e.target;
        const hasMetadata = node.data('hasMetadata') === 'true';
        if (!hasMetadata) return;

        hideRelationshipPopover();

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
    if (!state.objectMetadataMap || !state.objectApiName) return;

    const mainMetadata = state.metadata.get(state.objectApiName);
    if (mainMetadata) {
        await buildGraph(mainMetadata);
    }
}
