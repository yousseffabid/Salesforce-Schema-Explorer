/**
 * Salesforce Schema Explorer - UI Legend
 * Handles relationship count updates and active tab management.
 */

import { state, elements } from '../state.js';
import { isObjectExcluded } from '../excludedObjects.js';

// =============================================================================
// LEGEND & TABS
// =============================================================================

/**
 * Updates the relationship tab counts based on current visibility.
 */
export function updateRelationshipTabs() {
    const edges = state.edges ? Object.values(state.edges) : [];

    // Helper to count unique partners
    const count = (viewType) => {
        const uniqueTotal = new Set();
        const uniqueVisible = new Set();

        edges.forEach(edge => {
            // Filter by view type
            const isOutgoing = edge.source === state.objectApiName;
            const isIncoming = edge.target === state.objectApiName;

            if (viewType === 'outgoing' && !isOutgoing) return;
            if (viewType === 'incoming' && !isIncoming) return;
            if (viewType === 'all' && !isOutgoing && !isIncoming) return;

            const partner = isOutgoing ? edge.target : edge.source;
            if (partner && partner !== state.objectApiName) {
                uniqueTotal.add(partner);

                const isUserExcluded = state.userExcludedObjects.has(partner);
                const isSystemExcluded = isObjectExcluded(partner);

                if (!isUserExcluded && !isSystemExcluded) {
                    uniqueVisible.add(partner);
                }
            }
        });
        return { visible: uniqueVisible.size, total: uniqueTotal.size };
    };

    const outgoingCounts = count('outgoing');
    const incomingCounts = count('incoming');
    const allCounts = count('all');

    if (elements.tabOutgoingCount) elements.tabOutgoingCount.textContent = `${outgoingCounts.visible} / ${outgoingCounts.total}`;
    if (elements.tabIncomingCount) elements.tabIncomingCount.textContent = `${incomingCounts.visible} / ${incomingCounts.total}`;
    if (elements.tabAllCount) elements.tabAllCount.textContent = `${allCounts.visible} / ${allCounts.total}`;

    updateActiveTab();
}

/**
 * Updates the visual active state of the relationship tabs.
 */
export function updateActiveTab() {
    if (elements.tabOutgoing) elements.tabOutgoing.classList.remove('relationship-tab--active');
    if (elements.tabIncoming) elements.tabIncoming.classList.remove('relationship-tab--active');
    if (elements.tabAll) elements.tabAll.classList.remove('relationship-tab--active');

    const activeTab = {
        outgoing: elements.tabOutgoing,
        incoming: elements.tabIncoming,
        all: elements.tabAll
    }[state.activeRelationshipView];

    if (activeTab) activeTab.classList.add('relationship-tab--active');
}

/**
 * Gets the relationships for the currently active view (incoming/outgoing/all).
 * @returns {Object} Helper object with lookup and masterDetail arrays.
 */
export function getActiveRelationships() {
    const edges = state.edges ? Object.values(state.edges) : [];
    const lookup = [];
    const masterDetail = [];

    edges.forEach(edge => {
        const isOutgoing = edge.source === state.objectApiName;
        const isIncoming = edge.target === state.objectApiName;

        let include = false;
        if (state.activeRelationshipView === 'outgoing' && isOutgoing) include = true;
        else if (state.activeRelationshipView === 'incoming' && isIncoming) include = true;
        else if (state.activeRelationshipView === 'all' && (isOutgoing || isIncoming)) include = true;

        if (include) {
            const rel = {
                ...edge,
                sourceObject: edge.source,
                targetObject: edge.target
            };

            if (edge.isMasterDetail) masterDetail.push(rel);
            else lookup.push(rel);
        }
    });

    return { lookup, masterDetail };
}

/**
 * Updates the relationship type counts (Lookup/Master-Detail) in the legend.
 */
export function updateLegendCounts() {
    const activeRels = getActiveRelationships();

    // Helper to check if a relationship is visible (target/source object is not excluded)
    const isRelVisible = (rel) => {
        const partner = rel.targetObject === state.objectApiName ? rel.sourceObject : rel.targetObject;
        if (!partner || partner === state.objectApiName) return false;

        return !state.userExcludedObjects.has(partner) && !isObjectExcluded(partner);
    };

    const visibleLookup = activeRels.lookup.filter(isRelVisible);
    const visibleMD = activeRels.masterDetail.filter(isRelVisible);

    elements.lookupCount.textContent = visibleLookup.length;
    elements.mdCount.textContent = visibleMD.length;

    elements.lookupCount.disabled = visibleLookup.length === 0;
    elements.mdCount.disabled = visibleMD.length === 0;
}

/**
 * Update the objects count badge in the legend
 */
export function updateObjectsCount() {
    const objectsCountEl = document.getElementById('objects-count');
    if (!objectsCountEl) return;

    // Get ALL known related objects (including user-excluded AND system-excluded)
    const allObjects = getRelatedObjectsList(false); // system exclusion is handled in edge logic now
    const totalCount = allObjects.length;

    // Visible = Total - (UserExcluded + SystemExcluded)
    const visibleCount = allObjects.filter(obj =>
        !state.userExcludedObjects.has(obj) && !isObjectExcluded(obj)
    ).length;

    objectsCountEl.textContent = `${visibleCount} / ${totalCount}`;
}

/**
 * Get list of related objects for the CURRENT TAB only.
 * - Respects the active relationship view (outgoing/incoming/all)
 * - Includes both included and user-excluded objects for that tab.
 * @param {boolean} includeSystemExcluded - If true, include system-excluded objects in the list
 */
export function getRelatedObjectsList(includeSystemExcluded = true) {
    const edges = state.edges ? Object.values(state.edges) : [];
    const objectsSet = new Set();

    edges.forEach(edge => {
        const isOutgoing = edge.source === state.objectApiName;
        const isIncoming = edge.target === state.objectApiName;

        if (state.activeRelationshipView === 'outgoing' && !isOutgoing) return;
        if (state.activeRelationshipView === 'incoming' && !isIncoming) return;
        if (state.activeRelationshipView === 'all' && !isOutgoing && !isIncoming) return;

        const partner = isOutgoing ? edge.target : edge.source;
        if (!partner || partner === state.objectApiName) return;

        if (!includeSystemExcluded && isObjectExcluded(partner)) return;

        objectsSet.add(partner);
    });

    const result = [...objectsSet].sort();

    return result;
}

