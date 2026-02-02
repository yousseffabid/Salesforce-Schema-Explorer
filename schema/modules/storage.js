/**
 * Salesforce Schema Explorer - Storage Utilities
 * Handles persistence of user preferences (object-based exclusions)
 */

import { logger } from './utils.js';

const STORAGE_PREFIX = 'sfschema_prefs_';

/**
 * Save user-excluded objects for a specific root object
 * PERMANENT STORAGE (No Expiration)
 * @param {string} rootObjectName - The API name of the current root object
 * @param {Set<string>} excludedObjects - Set of object API names to exclude
 */
export function saveObjectExclusions(rootObjectName, excludedObjects) {
    if (!rootObjectName) return;

    const key = `${STORAGE_PREFIX}${rootObjectName}_excluded_objects`;
    const newObjectList = Array.from(excludedObjects);

    try {
        // Save as simple array (Permanent Preference)
        localStorage.setItem(key, JSON.stringify(newObjectList));
        logger.debug('[Storage:saveExclusions] Saved exclusions', { object: rootObjectName, count: newObjectList.length });
    } catch (e) {
        logger.error('[Storage:saveExclusions] Save failed', { error: e.message });
    }
}

/**
 * Load user-excluded objects for a specific root object
 * PERMANENT STORAGE (No Expiration)
 * @param {string} rootObjectName - The API name of the current root object
 * @returns {Set<string>} Set of excluded object API names
 */
export function loadObjectExclusions(rootObjectName) {
    if (!rootObjectName) return new Set();

    const key = `${STORAGE_PREFIX}${rootObjectName}_excluded_objects`;

    try {
        const data = localStorage.getItem(key);
        if (data) {
            const parsed = JSON.parse(data);

            // 1. Handle "Session Format" (Migration: We extracted the objects and ignore the timestamp)
            if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.objects)) {
                logger.info('[Storage:loadExclusions] Migrating session exclusions to permanent storage', { count: parsed.objects.length });
                return new Set(parsed.objects);
            }

            // 2. Handle specific Legacy object format (unlikely, but safe)
            if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
                return new Set(Object.keys(parsed));
            }

            // 3. Handle Standard Array (Permanent Format)
            if (Array.isArray(parsed)) {
                logger.debug('[Storage:loadExclusions] Loaded exclusions', { object: rootObjectName, count: parsed.length });
                return new Set(parsed);
            }
        }
    } catch (e) {
        logger.error('[Storage:loadExclusions] Load failed', { error: e.message });
    }

    return new Set();
}

/**
 * Clear all stored preferences
 */
export function clearAllPreferences() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(STORAGE_PREFIX)) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => localStorage.removeItem(key));
        logger.info('[Storage:clearPreferences] Preferences cleared', { count: keysToRemove.length });
    } catch (e) {
        logger.error('[Storage:clearPreferences] Clear failed', { error: e.message });
    }
}
