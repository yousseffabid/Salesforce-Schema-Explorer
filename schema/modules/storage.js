/**
 * Salesforce Schema Explorer - Storage Utilities
 * Handles persistence of user preferences (object-based exclusions)
 */

import { logger } from './utils.js';

const STORAGE_PREFIX = 'sfschema_prefs_';

/**
 * Helper to clean instance URL for storage key (removes protocol)
 * @param {string} instanceUrl - The raw instance URL
 * @returns {string} The cleaned host identifier
 */
function getStorageIdentifier(instanceUrl) {
    if (!instanceUrl) return 'global';
    try {
        return new URL(instanceUrl).hostname;
    } catch {
        return instanceUrl.replace(/^https?:\/\//, '');
    }
}

/**
 * Save user-excluded objects for a specific root object
 * PERMANENT STORAGE (No Expiration)
 * @param {string} instanceUrl - The Salesforce instance URL (for scoping)
 * @param {string} rootObjectName - The API name of the current root object
 * @param {Set<string>} excludedObjects - Set of object API names to exclude
 */
export function saveObjectExclusions(instanceUrl, rootObjectName, excludedObjects) {
    if (!rootObjectName) return;

    const instanceId = getStorageIdentifier(instanceUrl);
    const key = `${STORAGE_PREFIX}${instanceId}_${rootObjectName}_excluded_objects`;
    const newObjectList = Array.from(excludedObjects);

    try {
        // Save as simple array (Permanent Preference)
        localStorage.setItem(key, JSON.stringify(newObjectList));
        logger.debug('[Storage:saveExclusions] Saved scoped exclusions', {
            instance: instanceId,
            object: rootObjectName,
            count: newObjectList.length
        });
    } catch (e) {
        logger.error('[Storage:saveExclusions] Save failed', { error: e.message });
    }
}

/**
 * Load user-excluded objects for a specific root object
 * PERMANENT STORAGE (No Expiration)
 * @param {string} instanceUrl - The Salesforce instance URL (for scoping)
 * @param {string} rootObjectName - The API name of the current root object
 * @returns {Set<string>} Set of excluded object API names
 */
export function loadObjectExclusions(instanceUrl, rootObjectName) {
    if (!rootObjectName) return new Set();

    const instanceId = getStorageIdentifier(instanceUrl);
    const key = `${STORAGE_PREFIX}${instanceId}_${rootObjectName}_excluded_objects`;

    try {
        const data = localStorage.getItem(key);
        if (data) {
            const parsed = JSON.parse(data);

            // 1. Handle "Session Format" (Migration: We extracted the objects and ignore the timestamp)
            if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.objects)) {
                return new Set(parsed.objects);
            }

            // 2. Handle specific Legacy object format (unlikely, but safe)
            if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
                return new Set(Object.keys(parsed));
            }

            // 3. Handle Standard Array (Permanent Format)
            if (Array.isArray(parsed)) {
                logger.debug('[Storage:loadExclusions] Loaded scoped exclusions', {
                    instance: instanceId,
                    object: rootObjectName,
                    count: parsed.length
                });
                return new Set(parsed);
            }
        }
    } catch (e) {
        logger.error('[Storage:loadExclusions] Load failed', { error: e.message });
    }

    return new Set();
}

