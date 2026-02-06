# API Documentation

## Overview

This document describes the message-passing API between content scripts, UI pages, and the background service worker in Salesforce Schema Explorer.

## Metadata Management APIs

### buildObjectMetadataMap

**Purpose**: Fetch, filter, build, and cache complete Object Metadata Map

**Request**:

```javascript
{
  action: 'buildObjectMetadataMap',
  instanceUrl: 'https://myorg.my.salesforce.com',      // Required
  apiVersion: '66.0',                                   // Required
  sessionId: 'session_id_string',                       // Required for setup domains
  isSetupDomain: false,                                 // Required
  forceRefresh: false,                                  // Optional, default false
  rootObjectName: 'Account'                             // Optional. Triggers lazy-load for root + neighbors
}
```

**Response Success**:

```javascript
{
  success: true,
  nodes: {
    'Account': {
      info: {
        name: 'Account',
        label: 'Account',
        custom: false,
        queryable: true,
        createable: true,
        updateable: true,
        deletable: true,
        keyPrefix: '001'
      },
      fields: {
        'Id': { name: 'Id', label: 'Account ID', type: 'id', ... },
        'Name': { name: 'Name', label: 'Account Name', type: 'string', ... },
        'ParentId': { name: 'ParentId', label: 'Parent Account ID', type: 'reference', ... }
      }
    },
    // ... more objects
  },
  edges: {
    'Account.ParentId.Account': {
      id: 'Account.ParentId.Account',
      source: 'Account',
      target: 'Account',
      fieldName: 'ParentId',
      isMasterDetail: false
    },
    'Contact.AccountId.Account': {
      id: 'Contact.AccountId.Account',
      source: 'Contact',
      target: 'Account',
      fieldName: 'AccountId',
      isMasterDetail: false
    }
  },
  fromCache: true,                                      // true if served from IndexedDB
  timestamp: 1674567890123                              // Cache timestamp (last fetch from Salesforce/update to cache)
}
```

**Response Error**:

```javascript
{
  success: false,
  error: 'Error message describing what failed'
}
```

1. **Lazy Loading**: If `rootObjectName` is present, it fetches only that object and its neighbors (incoming/outgoing).
2. **Delta Updates**: Only missing objects are added to the fetch queue; existing cache entries are preserved and merged.
3. **Persistence**: Results are merged into the IndexedDB store with a 7-day duration (calculated from the last time the extension fetched or updated data from Salesforce for this instance).
4. **Normalized Storage**: Data is split into `nodes` (metadata) and `edges` (relationships) for efficient graph traversal.
5. **Efficiency**: Startup is instant (<1s) for cached data.

**Cache Invalidation**:

- 7-day TTL (7 days from the last time the extension fetched or updated data from Salesforce; configurable in `background/modules/cache.js`)
- Manual refresh via `clearMetadataCache` message.
- The refresh function invalidates the entire metadata cache for the current instance; the UI then re-fetches metadata focusing on the currently selected object.

---

### clearMetadataCache

**Purpose**: Clear cached Object Metadata Map

**Request**:

```javascript
{
  action: 'clearMetadataCache',
  instanceUrl: 'https://myorg.my.salesforce.com'        // Required
}
```

**Response Success**:

```javascript
{
  success: true;
}
```

**Response Error**:

```javascript
{
  success: false,
  error: 'Error message'
}
```

**Behavior**:

- Deletes metadata cache for specified instance from IndexedDB
- Does not affect in-memory state in schema.js
- Use before calling `buildObjectMetadataMap` with `forceRefresh: true` for guaranteed fresh load

---

## Existing APIs (Unchanged)

### fetchApi

**Purpose**: Make authenticated API call to Salesforce

**Request**:

```javascript
{
  action: 'fetchApi',
  url: 'https://myorg.my.salesforce.com/services/data/v66.0/sobjects',
  sessionId: 'session_id_string',
  isSetupDomain: false
}
```

**Response**:

```javascript
{
  success: true,
  data: { /* parsed JSON response */ }
}
```

---

### fetchSObjects

**Purpose**: Get list of all objects in org

**Request**:

```javascript
{
  action: 'fetchSObjects',
  instanceUrl: 'https://myorg.my.salesforce.com',
  apiVersion: '66.0',
  sessionId: 'session_id_string',
  isSetupDomain: false
}
```

**Response**:

```javascript
{
  success: true,
  objects: [
    { name: 'Account', label: 'Account', custom: false, queryable: true, ... },
    { name: 'Contact', label: 'Contact', custom: false, queryable: true, ... },
    // ... more objects
  ]
}
```

---

### resolveObjectId

**Purpose**: Convert custom object DurableId to API name

**Request**:

```javascript
{
  action: 'resolveObjectId',
  instanceUrl: 'https://myorg.my.salesforce.com',
  objectId: '01I5t000002LlVW',
  apiVersion: '66.0'
}
```

**Response**:

```javascript
{
  success: true,
  apiName: 'My_Custom_Object__c'
}
```

---

### openSchemaTab

**Purpose**: Open Schema Explorer in new tab

**Request**:

```javascript
{
  action: 'openSchemaTab',
  instanceUrl: 'https://myorg.my.salesforce.com',
  objectApiName: 'Account',                            // Optional
  sessionId: 'session_id_string',
  isSetupDomain: false
}
```

**Response**: None (synchronous operation)

**Behavior**:

- Stores context in chrome.storage.session
- Opens schema.html in new tab
- Context expires after 5 minutes

---

## Error Handling

### Common Error Messages

- `'Missing context.\n\nPlease open SF Schema Explorer from a Salesforce page...'` - Context expired or missing
- `'Session expired.\n\nPlease click the Schema button again.'` - Session token expired
- `'Authentication failed.\n\nPlease ensure you are logged in...'` - Invalid or expired credentials
- `'Could not retrieve API versions'` - Unable to determine supported API version
- `'Failed to fetch objects'` - describeGlobal call failed
- `'Failed to build Object Metadata Map'` - Metadata building failed

### Retry Strategy

- Network errors: Retried up to 3 times with exponential backoff
- HTTP 408, 429, 500-504: Retried
- HTTP 401, 403, 404: Not retried (permanent failure)
- Individual object failures in batch: Skipped, others continue

---

## Usage Examples

### Load metadata on startup

```javascript
// In schema.js init():
async function loadMetadata() {
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "buildObjectMetadataMap",
          instanceUrl: state.instanceUrl,
          apiVersion: state.apiVersion,
          sessionId: state.sessionId,
          isSetupDomain: state.isSetupDomain,
        },
        (response) => {
          if (chrome.runtime.lastError)
            reject(new Error(chrome.runtime.lastError.message));
          else if (response?.success) resolve(response);
          else reject(new Error(response?.error || "Failed to load metadata"));
        },
      );
    });

    state.nodes = response.nodes;
    state.edges = response.edges;
  } catch (error) {
    console.error("Metadata load failed:", error);
  }
}
```

### Get metadata for specific object

```javascript
// From state.nodes (instant):
const objectNode = state.nodes["Account"];
const fields = objectNode.fields;

// List fields:
for (const [fieldName, field] of Object.entries(fields)) {
  console.log(`${field.label} (${field.type})`);
}
```

### Force refresh cache

```javascript
async function refreshMetadata() {
  try {
    // Clear old cache
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "clearMetadataCache",
          instanceUrl: state.instanceUrl,
        },
        (response) => {
          if (response?.success) resolve();
          else reject(new Error(response?.error));
        },
      );
    });

    // Load fresh metadata
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "buildObjectMetadataMap",
          instanceUrl: state.instanceUrl,
          apiVersion: state.apiVersion,
          sessionId: state.sessionId,
          isSetupDomain: state.isSetupDomain,
          forceRefresh: true,
        },
        (response) => {
          if (response?.success) resolve(response);
          else reject(new Error(response?.error));
        },
      );
    });

    state.nodes = response.nodes;
    state.edges = response.edges;
  } catch (error) {
    console.error("Refresh failed:", error);
  }
}
```

---

- **First load (Search)**: Instant (DescribeGlobal only).
- **First load (Schema)**: 1-2 seconds per new object (Root + neighbors).
- **Cache hits**: <5ms lookup from IndexedDB.
- **In-memory access**: <0.1ms once loaded.
- **Scalability**: Handles 5000+ objects by only loading the visible "Graph Context".
- **Memory**: Strips unused fields to keep IndexedDB growth linear (~50KB per unique explored object).
- **Cache Lifecycle**: Data is preserved for 7 days from the last time the extension fetched or updated data from Salesforce for this instance.
