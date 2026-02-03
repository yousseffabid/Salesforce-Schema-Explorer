/**
 * Salesforce Schema Explorer - State Management
 */

export const state = {
    // Salesforce Connection
    instanceUrl: null,
    objectApiName: null,
    apiVersion: null,
    sessionId: null,
    isSetupDomain: false,

    // Data Caches
    metadata: new Map(),
    allObjects: [],

    // Normalized Graph Data
    nodes: {},
    edges: {},

    // Relationship Cache (from Tooling API)
    relationshipCache: null,

    // User-excluded objects (Set of object API names)
    userExcludedObjects: new Set(),

    // Object popover selection state (Set of object API names being toggled)
    objectPopoverSelection: new Set(),

    // Active view tab: 'outgoing', 'incoming', or 'all'
    activeRelationshipView: 'outgoing',

    // Field Panel State
    currentPanelFields: [],
    currentPanelObject: null,
    selectedTypes: new Set(),

    // UI Interaction State
    filterDropdownOpen: false,
    searchDropdownOpen: false,
    activeSearchIndex: -1
};

export const elements = {
    // Main Content Areas
    get emptyState() { return document.getElementById('empty-state'); },
    get loading() { return document.getElementById('loading'); },
    get error() { return document.getElementById('error'); },
    get errorMessage() { return document.getElementById('error-message'); },
    get cyContainer() { return document.getElementById('cy'); },
    get apiVersion() { return document.getElementById('api-version'); },

    // Object Search
    get objectSearchInput() { return document.getElementById('object-search-input'); },
    get objectSearchClear() { return document.getElementById('object-search-clear'); },
    get objectSearchResults() { return document.getElementById('object-search-results'); },

    // Graph Controls
    get btnFit() { return document.getElementById('btn-fit'); },
    get btnCenter() { return document.getElementById('btn-center'); },
    get btnLayout() { return document.getElementById('btn-layout'); },
    get retryBtn() { return document.getElementById('retry-btn'); },

    // Legend
    get legend() { return document.getElementById('legend'); },
    get lookupCount() { return document.getElementById('legend-lookup-count'); },
    get mdCount() { return document.getElementById('legend-md-count'); },

    // Relationship Tabs (footer)
    get relationshipTabs() { return document.getElementById('relationship-tabs'); },
    get tabOutgoing() { return document.getElementById('tab-outgoing'); },
    get tabIncoming() { return document.getElementById('tab-incoming'); },
    get tabAll() { return document.getElementById('tab-all'); },
    get tabOutgoingCount() { return document.getElementById('tab-outgoing-count'); },
    get tabIncomingCount() { return document.getElementById('tab-incoming-count'); },
    get tabAllCount() { return document.getElementById('tab-all-count'); },

    // Cache Status
    get cacheStatus() { return document.getElementById('cache-status'); },
    get cacheRefreshBtn() { return document.getElementById('cache-refresh-btn'); },

    // Relationship Popover
    get relationshipPopover() { return document.getElementById('relationship-popover'); },
    get popoverTitle() { return document.getElementById('popover-title'); },
    get popoverBody() { return document.getElementById('popover-body'); },
    get popoverClose() { return document.getElementById('popover-close'); },

    // Field Details Panel
    get detailsPanel() { return document.getElementById('details-panel'); },
    get detailsTitle() { return document.getElementById('details-title'); },
    get detailsApiName() { return document.getElementById('details-api-name'); },
    get detailsDescription() { return document.getElementById('details-description'); },
    get detailsFieldCount() { return document.getElementById('details-field-count'); },
    get detailsFields() { return document.getElementById('details-fields'); },
    get detailsClose() { return document.getElementById('details-close'); },
    get objectManagerLink() { return document.getElementById('object-manager-link'); },
    get fieldSearch() { return document.getElementById('field-search'); },

    // Type Filter
    get typeFilterTrigger() { return document.getElementById('type-filter-trigger'); },
    get typeFilterMenu() { return document.getElementById('type-filter-menu'); },
    get activeFilters() { return document.getElementById('active-filters'); }
};
