/**
 * Salesforce Schema Explorer - Main Application
 * Modularized entry point for the Schema Explorer UI.
 */

'use strict';

import { state, elements } from './modules/state.js';
import { logger } from './modules/utils.js';
import {
  fetchSObjects,
  fetchLatestApiVersion,
  loadObjectMetadataMap,
  loadRelationshipCache,
  fetchObjectMetadata,
  refreshRelationshipCache,
  clearObjectMetadataCache
} from './modules/api.js';
import {
  extractRelationshipsFromMetadataMap,
  extractRelationshipsFromCache,
  extractRelationshipsFromMetadata
} from './modules/data.js';
import {
  showLoading,
  showEmptyState,
  showError,
  showGraph,
  resetLoadingOperations,
  startLoadingOperation,
  completeLoadingOperation,
  updateRelationshipTabs,
  updateLegendCounts,
  updateObjectsCount,
  updateActiveTab,
  hideDetailsPanel,
  hideRelationshipPopover,
  updateCacheStatusUI
} from './modules/ui.js';
import { buildGraph } from './modules/graph.js';
import { clearSchema } from './modules/search.js';
import { setupEventListeners } from './modules/event-listeners.js';

// =============================================================================
// CONTROLLER LOGIC
// =============================================================================

/**
 * Loads the schema for the specified object, including metadata and relationships.
 * 
 * @param {string} objectApiName - The API name of the object to load.
 * @returns {Promise<void>}
 */
async function loadObjectSchema(objectApiName) {
  showLoading();

  try {
    state.objectApiName = objectApiName;
    document.title = `Schema: ${objectApiName}`;

    // Fetch main object metadata
    const mainMetadata = await fetchObjectMetadata(objectApiName);

    // Determine relationships source
    if (state.objectMetadataMap && state.objectMetadataMap[objectApiName]) {
      const result = extractRelationshipsFromMetadataMap(objectApiName);
      state.relationships = { outgoing: result.outgoing, incoming: result.incoming };
      state.excludedRelationships = { outgoing: result.excludedOutgoing, incoming: result.excludedIncoming };
    } else if (state.relationshipCache) {
      const result = extractRelationshipsFromCache(objectApiName);
      state.relationships = { outgoing: result.outgoing, incoming: result.incoming };
      state.excludedRelationships = { outgoing: result.excludedOutgoing, incoming: result.excludedIncoming };
    } else {
      const result = extractRelationshipsFromMetadata(mainMetadata);
      state.relationships = { outgoing: result.outgoing, incoming: { lookup: [], masterDetail: [] } };
      state.excludedRelationships = { outgoing: result.excludedOutgoing, incoming: { lookup: [], masterDetail: [] } };
    }

    // Load user exclusions FIRST
    const { loadObjectExclusions } = await import('./modules/storage.js');
    state.userExcludedObjects = loadObjectExclusions(objectApiName);

    showGraph();
    updateLegendCounts(); // Updates MD/Lookup counts
    updateObjectsCount(); // Updates "See Objects" button count
    updateRelationshipTabs(); // Updates Tab counts (now using correct exclusions)

    await buildGraph(mainMetadata);

  } catch (error) {
    logger.error('[Schema:loadObjectSchema] Failed to load schema', { error: error.message });
    showError(error.message || 'Failed to load schema');
  }
}

/**
 * Switches the relationship view (incoming/outgoing/all).
 * 
 * @param {string} view - The view mode ('outgoing', 'incoming', 'all').
 * @returns {Promise<void>}
 */
async function switchRelationshipView(view) {
  if (view === state.activeRelationshipView) return;

  state.activeRelationshipView = view;
  updateActiveTab();
  updateLegendCounts();

  if (state.objectApiName) {
    // Rebuild graph with new view filter
    const metadata = state.metadata.get(state.objectApiName);
    if (metadata) await buildGraph(metadata);
  }
}

/**
 * Handles the manual cache refresh triggered by the user.
 * Invalidates and reloads both metadata and relationship caches.
 * 
 * @returns {Promise<void>}
 */
async function handleCacheRefresh() {
  try {
    logger.info('[Schema:refresh] Cache refresh initiated by user');

    resetLoadingOperations();
    logger.debug('[Schema:refresh] Starting cache refresh operation');

    startLoadingOperation();

    // Step 1: Invalidate cache
    await refreshRelationshipCache();

    // Step 2: Clear metatadata and reload
    await clearObjectMetadataCache();
    await loadObjectMetadataMap(true);

    // Step 3: Load fresh relationship cache
    await loadRelationshipCache(true, false);

    // Step 4: Reload current object schema
    if (state.objectApiName) {
      await loadObjectSchema(state.objectApiName);
    }

    completeLoadingOperation(new Date().getTime(), false);
    logger.info('[Schema:refresh] Cache refresh complete');

  } catch (error) {
    logger.error('[Schema:refresh] Cache refresh error', { error: error.message });
    resetLoadingOperations();
    updateCacheStatusUI('error');
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initializes the application, loads session context, and fetches initial metadata.
 * 
 * @returns {Promise<void>}
 */
async function init() {
  try {
    logger.info('[Schema:init] Initialization started');

    if (typeof cytoscape === 'undefined') throw new Error('Cytoscape.js library not loaded');

    showLoading();

    // Check session context
    const storage = await chrome.storage.session.get('schemaContext');
    const context = storage.schemaContext;

    if (!context?.instanceUrl) {
      throw new Error('Missing context.\n\nPlease open SF Schema Explorer from a Salesforce page by clicking the 🔗 button.');
    }

    if (Date.now() - context.timestamp > 5 * 60 * 1000) {
      throw new Error('Session expired.\n\nPlease click the Schema button again.');
    }

    state.instanceUrl = context.instanceUrl;
    state.sessionId = context.sessionId || null;
    state.isSetupDomain = context.isSetupDomain || false;

    state.apiVersion = await fetchLatestApiVersion();
    if (elements.apiVersion) elements.apiVersion.textContent = `API v${state.apiVersion}`;

    try {
      state.allObjects = await fetchSObjects();
    } catch (e) {
      logger.warn('[Schema:init] Failed to fetch SObjects', { error: e.message });
      state.allObjects = [];
    }

    // Load Object Metadata Map
    try {
      logger.debug('[Schema:init] Fetching Object Metadata Map');
      startLoadingOperation();

      await loadObjectMetadataMap();

      completeLoadingOperation(Date.now(), false);
    } catch (error) {
      resetLoadingOperations();
      logger.warn('[Schema:init] Failed to load Object Metadata Map', { error: error.message });
    }

    // Load Relationship Cache (Background)
    loadRelationshipCache(false, false).catch(e => logger.warn('[Schema:init] Failed to pre-load relationship cache', { error: e.message }));

    // Handle Prepopulated Context
    if (context.objectApiName) {
      logger.debug('[Schema:init] Context object loaded', { object: context.objectApiName });

      const obj = state.allObjects.find(o => o.name === context.objectApiName);
      if (obj) {
        elements.objectSearchInput.value = obj.label;
      } else {
        elements.objectSearchInput.value = context.objectApiName;
      }
      elements.objectSearchClear.classList.remove('hidden');

      await loadObjectSchema(context.objectApiName);
    } else {
      showEmptyState();
    }

    logger.info('[Schema:init] Initialization complete');

  } catch (error) {
    logger.error('[Schema:init] Initialization error', { error: error.message });
    resetLoadingOperations();
    showError(error.message);
  }
}

// Wire up events
setupEventListeners({
  onLoadObjectSchema: loadObjectSchema,
  onSwitchRelationshipView: switchRelationshipView,
  onRefreshCache: handleCacheRefresh
});

// Run init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
