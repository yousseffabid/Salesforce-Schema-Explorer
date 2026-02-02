/**
 * Salesforce Schema Explorer - Background Service Worker
 * Modularized version of the background service worker.
 */

'use strict';

import { logger, isSalesforceUrl } from './modules/utils.js';
import { fetchWithRetry, MAX_RETRY_ATTEMPTS } from './modules/api.js';
import { extractSessionIdFromCookies } from './modules/auth.js';
import { handleFetchAllRelationships, handleInvalidateRelationshipCache } from './modules/relationships.js';
import { handleBuildObjectMetadataMap, handleClearMetadataCache } from './modules/metadata.js';

// =============================================================================
// MESSAGE LISTENER
// =============================================================================

/**
 * Central message listener for the extension.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.debug('[Background:onMessage] Received message', { action: message.action });

  switch (message.action) {

    case 'openSchemaTab':
      handleOpenSchemaTab(message, sendResponse);
      return true;

    case 'fetchApi':
      handleFetchApi(message, sendResponse);
      return true;

    case 'resolveObjectId':
      handleResolveObjectId(message, sendResponse);
      return true;

    case 'fetchSObjects':
      handleFetchSObjects(message, sendResponse);
      return true;

    case 'fetchAllRelationships':
      handleFetchAllRelationships(message, sendResponse);
      return true;

    case 'invalidateRelationshipCache':
      handleInvalidateRelationshipCache(message, sendResponse);
      return true;

    case 'buildObjectMetadataMap':
      handleBuildObjectMetadataMap(message, sendResponse);
      return true;

    case 'clearMetadataCache':
      handleClearMetadataCache(message, sendResponse);
      return true;

    default:
      logger.warn('[Background:onMessage] Unknown action', { action: message.action });
      return false;
  }
});

// =============================================================================
// BROWSER ACTION HANDLER
// =============================================================================

chrome.action.onClicked.addListener(async (tab) => {
  if (!isSalesforceUrl(tab.url)) {
    logger.debug('[Background:onClicked] Ignoring click - not a Salesforce page');
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
  } catch (error) {
    logger.info('[Background:onClicked] Content script not found, injecting...');

    await injectContentScript(tab.id);

    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
      } catch (retryError) {
        logger.error('[Background:onClicked] Communication failed', { error: retryError.message });
      }
    }, 200);
  }
});

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Opens the Schema Explorer in a new tab with the provided context.
 * 
 * @param {Object} message - The message object containing context data.
 * @param {Function} sendResponse - The callback to send the response.
 */
function handleOpenSchemaTab(message, sendResponse) {
  const { instanceUrl, objectApiName, sessionId, isSetupDomain } = message;

  if (!instanceUrl) {
    logger.error('[Background:handleOpenSchemaTab] Missing instanceUrl');
    sendResponse({ success: false, error: 'Missing instanceUrl' });
    return;
  }

  const contextData = {
    schemaContext: {
      instanceUrl,
      objectApiName: objectApiName || null,
      sessionId: sessionId || null,
      isSetupDomain: isSetupDomain || false,
      timestamp: Date.now()
    }
  };

  chrome.storage.session.set(contextData)
    .then(() => {
      logger.debug('[Background:handleOpenSchemaTab] Context stored successfully');
      const schemaUrl = chrome.runtime.getURL('schema/schema.html');
      chrome.tabs.create({ url: schemaUrl });
      sendResponse({ success: true });
    })
    .catch(error => {
      logger.error('[Background:handleOpenSchemaTab] Failed to store context', { error: error.message });
      sendResponse({ success: false, error: error.message });
    });
}

/**
 * Proxies an API request to Salesforce.
 * 
 * @param {Object} message - The message object containing the URL and instance URL.
 * @param {Function} sendResponse - The callback to send the response.
 * @returns {Promise<void>}
 */
async function handleFetchApi(message, sendResponse) {
  const { url, instanceUrl } = message;

  if (!url) {
    sendResponse({ success: false, error: 'No URL provided' });
    return;
  }

  try {
    const sessionId = await extractSessionIdFromCookies(instanceUrl || url);

    if (!sessionId) {
      sendResponse({
        success: false,
        error: 'No valid session ID found. Please log in to Salesforce first.'
      });
      return;
    }

    const data = await fetchWithRetry(url, MAX_RETRY_ATTEMPTS, sessionId, false);
    sendResponse({ success: true, data });
  } catch (error) {
    logger.error('[Background:handleFetchApi] API call failed', { error: error.message });
    sendResponse({
      success: false,
      error: error.message || 'API request failed'
    });
  }
}

/**
 * Resolves a custom object's DurableId to its API Name.
 * 
 * @param {Object} message - The message object containing objectId and instanceUrl.
 * @param {Function} sendResponse - The callback to send the response.
 * @returns {Promise<void>}
 */
async function handleResolveObjectId(message, sendResponse) {
  const { instanceUrl, objectId, apiVersion } = message;

  if (!instanceUrl || !objectId) {
    sendResponse({ success: false, error: 'Missing instanceUrl or objectId' });
    return;
  }

  try {
    const sessionId = await extractSessionIdFromCookies(instanceUrl);

    if (!sessionId) {
      sendResponse({
        success: false,
        error: 'No valid session ID found. Please log in to Salesforce first.'
      });
      return;
    }

    const version = apiVersion || '66.0';
    const query = encodeURIComponent(
      `SELECT QualifiedApiName FROM EntityDefinition WHERE DurableId = '${objectId}'`
    );
    const url = `${instanceUrl}/services/data/v${version}/query?q=${query}`;

    const data = await fetchWithRetry(url, MAX_RETRY_ATTEMPTS, sessionId, false);

    if (data.records && data.records.length > 0) {
      sendResponse({
        success: true,
        apiName: data.records[0].QualifiedApiName
      });
    } else {
      sendResponse({
        success: false,
        error: 'Object not found for ID: ' + objectId
      });
    }
  } catch (error) {
    logger.error('[Background:handleResolveObjectId] Object ID resolution failed', { error: error.message });
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Fetches the list of all SObjects in the org.
 * 
 * @param {Object} message - The message containing instanceUrl.
 * @param {Function} sendResponse - The callback to send the response.
 * @returns {Promise<void>}
 */
async function handleFetchSObjects(message, sendResponse) {
  const { instanceUrl, apiVersion } = message;

  if (!instanceUrl) {
    sendResponse({ success: false, error: 'Missing instanceUrl' });
    return;
  }

  try {
    const sessionId = await extractSessionIdFromCookies(instanceUrl);

    if (!sessionId) {
      sendResponse({
        success: false,
        error: 'No valid session ID found. Please log in to Salesforce first.'
      });
      return;
    }

    const version = apiVersion || '66.0';
    const url = `${instanceUrl}/services/data/v${version}/sobjects`;

    const data = await fetchWithRetry(url, MAX_RETRY_ATTEMPTS, sessionId, false);

    if (data.sobjects) {
      const objects = data.sobjects
        .filter(object => {
          if (!object.queryable || object.deprecatedAndHidden) return false;
          if (!object.createable) return false;

          const apiName = object.name;
          if (apiName.endsWith('__History')) return false;
          if (apiName.endsWith('__Share')) return false;

          return true;
        })
        .map(object => ({
          name: object.name,
          label: object.label,
          labelPlural: object.labelPlural,
          custom: object.custom,
          keyPrefix: object.keyPrefix
        }))
        .sort((objectA, objectB) => objectA.label.localeCompare(objectB.label));

      sendResponse({ success: true, objects });
    } else {
      sendResponse({ success: false, error: 'No sobjects in response' });
    }
  } catch (error) {
    logger.error('[Background:handleFetchSObjects] SObjects fetch failed', { error: error.message });
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Injects the content script and CSS into a tab if not already present.
 * 
 * @param {number} tabId - The ID of the tab to inject into.
 * @returns {Promise<void>}
 */
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'content/modules/utils.js',
        'content/modules/session.js',
        'content/modules/url.js',
        'content/modules/ui.js',
        'content/content.js'
      ]
    });

    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/content.css']
    });

    logger.info('[Background:injectContentScript] Content script injected successfully');
  } catch (error) {
    logger.error('[Background:injectContentScript] Injection failed', { error: error.message });
    throw error;
  }
}
