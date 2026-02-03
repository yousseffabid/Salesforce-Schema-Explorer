/**
 * Salesforce Schema Explorer - Metadata Utilities
 * 
 * FACADE MODULE
 * This file re-exports functionality from the background/modules/metadata/ directory.
 * It maintains backward compatibility with background.js imports.
 */

// Re-export handlers used by background.js
export {
    handleBuildObjectMetadataMap,
    handleClearMetadataCache
} from './metadata/handlers.js';

// Re-export constants if needed by other modules (optional)
export {
    METADATA_BATCH_SIZE,
    METADATA_BATCH_DELAY_MS
} from './metadata/config.js';

// Re-export utilities if needed
export {
    batchFetchObjectMetadata,
    filterObjectsForMetadataFetch
} from './metadata/fetch.js';

export {
    stripMetadataFields,
    buildObjectMetadataMap
} from './metadata/transform.js';
