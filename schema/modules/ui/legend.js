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
    const { outgoing, incoming } = state.relationships;

    // Helper to calculate visible/total counts for a set of relationships
    const getCounts = (activeRels, excludedRels) => {
        const uniqueTotal = new Set();
        const uniqueVisible = new Set();

        const process = (relList) => {
            relList.forEach(rel => {
                const partner = rel.targetObject === state.objectApiName ? rel.sourceObject : rel.targetObject;
                if (partner && partner !== state.objectApiName) {
                    uniqueTotal.add(partner);

                    // Check visibility: Not User Excluded AND Not System Excluded
                    const isUserExcluded = state.userExcludedObjects.has(partner);
                    const isSystemExcluded = isObjectExcluded(partner); // Use the internal check

                    if (!isUserExcluded && !isSystemExcluded) {
                        uniqueVisible.add(partner);
                    }
                }
            });
        };

        // Process active relationships (Salesforce metadata)
        process([...activeRels.lookup, ...activeRels.masterDetail]);

        // Process excluded relationships (System filtered)
        if (excludedRels) {
            process([...(excludedRels.lookup || []), ...(excludedRels.masterDetail || [])]);
        }

        return { visible: uniqueVisible.size, total: uniqueTotal.size };
    };

    const outgoingCounts = getCounts(outgoing, state.excludedRelationships?.outgoing);
    const incomingCounts = getCounts(incoming, state.excludedRelationships?.incoming);

    // For ALL, we combine everything
    const allActive = {
        lookup: [...outgoing.lookup, ...incoming.lookup],
        masterDetail: [...outgoing.masterDetail, ...incoming.masterDetail]
    };
    const allExcluded = {
        lookup: [...(state.excludedRelationships?.outgoing?.lookup || []), ...(state.excludedRelationships?.incoming?.lookup || [])],
        masterDetail: [...(state.excludedRelationships?.outgoing?.masterDetail || []), ...(state.excludedRelationships?.incoming?.masterDetail || [])]
    };
    const allCounts = getCounts(allActive, allExcluded);

    if (elements.tabOutgoingCount) elements.tabOutgoingCount.textContent = `${outgoingCounts.visible} / ${outgoingCounts.total}`;
    if (elements.tabIncomingCount) elements.tabIncomingCount.textContent = `${incomingCounts.visible} / ${incomingCounts.total}`;
    if (elements.tabAllCount) elements.tabAllCount.textContent = `${allCounts.visible} / ${allCounts.total}`;

    const hasExcluded = (allCounts.total - allCounts.visible) > 0;

    const excludedSection = document.getElementById('legend-excluded-section');
    if (excludedSection) {
        excludedSection.style.display = 'block';
    }

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
    switch (state.activeRelationshipView) {
        case 'outgoing':
            return state.relationships.outgoing;
        case 'incoming':
            return state.relationships.incoming;
        case 'all':
            return {
                lookup: [...state.relationships.outgoing.lookup, ...state.relationships.incoming.lookup],
                masterDetail: [...state.relationships.outgoing.masterDetail, ...state.relationships.incoming.masterDetail]
            };
        default:
            return { lookup: [], masterDetail: [] };
    }
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
    const allObjects = getRelatedObjectsList(true); // true = include system excluded
    const totalCount = allObjects.length;

    // Visible = Total - (UserExcluded + SystemExcluded)
    const visibleCount = allObjects.filter(obj =>
        !state.userExcludedObjects.has(obj) && !isObjectExcluded(obj)
    ).length;

    objectsCountEl.textContent = `${visibleCount} / ${totalCount}`;
}

/**
 * Get list of related objects based on current view (includes ALL objects even system-excluded)
 * @param {boolean} includeSystemExcluded - If true, include system-excluded objects in the list
 */
export function getRelatedObjectsList(includeSystemExcluded = true) {
    const activeRels = getActiveRelationships();
    const allRelationships = [...activeRels.lookup, ...activeRels.masterDetail];

    // Also include system-excluded relationships for complete list
    const systemExcluded = state.excludedRelationships;
    if (includeSystemExcluded && systemExcluded) {
        const excludedRels = [];

        // Add outgoing excluded relationships if view is outgoing or all
        if (state.activeRelationshipView === 'outgoing' || state.activeRelationshipView === 'all') {
            excludedRels.push(
                ...(systemExcluded.outgoing?.lookup || []),
                ...(systemExcluded.outgoing?.masterDetail || [])
            );
        }

        // Add incoming excluded relationships if view is incoming or all
        if (state.activeRelationshipView === 'incoming' || state.activeRelationshipView === 'all') {
            excludedRels.push(
                ...(systemExcluded.incoming?.lookup || []),
                ...(systemExcluded.incoming?.masterDetail || [])
            );
        }

        allRelationships.push(...excludedRels);
    }

    const objectsSet = new Set();
    for (const rel of allRelationships) {
        const obj = rel.targetObject !== state.objectApiName
            ? rel.targetObject
            : rel.sourceObject;
        if (obj && obj !== state.objectApiName) {
            objectsSet.add(obj);
        }
    }

    return [...objectsSet].sort();
}
