/**
 * Salesforce Schema Explorer - Metadata Configuration
 */

// Optimization: Batch size of 15 balances browser concurrency limits (avg 6) with speed.
// Delay of 100ms prevents "burstable" rate limiting from Salesforce.
export const METADATA_BATCH_SIZE = 15;
export const METADATA_BATCH_DELAY_MS = 100;
