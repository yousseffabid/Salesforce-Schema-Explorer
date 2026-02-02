/**
 * Salesforce Schema Explorer - Excluded Objects Configuration
 * 
 * Central management of object exclusion rules for the SF Schema Explorer.
 * Objects matching these rules are filtered out from:
 * - Object search/index tables
 * - Object Metadata Maps
 * - Relationship graphs
 * 
 * RULES:
 * 1. Any object ending with __History (history tracking)
 * 2. Any object ending with __Share (sharing rules)
 * 3. Any object ending with __e (platform events)
 * 4. Any object ending with __Tag (tag objects)
 * 5. Any object ending with __Feed (feed/chatter objects)
 * 6. Any object ending with ChangeEvent (change data capture)
 */

'use strict';

/**
 * Checks if an object should be excluded from processing.
 * 
 * Excludes system-generated Salesforce objects based on suffixes:
 * - `__History` (history tracking)
 * - `__Share` (sharing rules) 
 * - `ChangeEvent` (change data capture)
 * - `__e` (platform events)
 * - `FieldHistory` (field history tracking)
 * - `__Tag` (tag objects)
 * - `__Feed` (feed/chatter objects)
 * 
 * @param {string} apiName - Object API name (e.g., 'Account', 'MyObject__c')
 * @returns {boolean} true if object should be excluded from processing
 */
export function isObjectExcluded(apiName) {
  if (!apiName) return false;

  // System suffixes to exclude
  const systemSuffixes = [
    '__History', 'ChangeEvent', '__Share', '__e',
    'FieldHistory', '__Tag', '__Feed'
  ];

  return systemSuffixes.some(suffix => apiName.endsWith(suffix));
}


/**
 * Filters an array of objects, removing excluded ones.
 * 
 * Used to filter:
 * - Search results
 * - Object lists
 * - Relationship targets
 *
 * @param {Array<Object|string>} objects - Objects to filter
 * @param {string} apiNameProperty - Property name containing API name (default: 'name')
 * @returns {Array} Filtered array without excluded objects
 */
function filterExcludedObjects(objects, apiNameProperty = 'name') {
  return objects.filter(obj => {
    const apiName = typeof obj === 'string' ? obj : obj[apiNameProperty];
    return !isObjectExcluded(apiName);
  });
}

/**
 * Filters a Set of object API names, removing excluded ones.
 * 
 * Used to filter relationship target objects and other sets.
 * 
 * @param {Set<string>} objectSet - Set of API names to filter
 * @returns {Set<string>} New set without excluded objects
 */
function filterExcludedObjectsSet(objectSet) {
  const filtered = new Set();
  for (const apiName of objectSet) {
    if (!isObjectExcluded(apiName)) {
      filtered.add(apiName);
    }
  }
  return filtered;
}
