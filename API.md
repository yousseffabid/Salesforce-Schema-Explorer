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
  forceRefresh: false                                   // Optional, default false
}
```

**Response Success**:

```javascript
{
  success: true,
  metadataMap: {
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
        'Name': { name: 'Name', label: 'Account Name', type: 'string', length: 255, ... },
        'ParentId': { name: 'ParentId', label: 'Parent Account ID', type: 'reference', referenceTo: ['Account'], ... }
      },
      relationships: {
        outgoing: [
          {
            fieldName: 'ParentId',
            fieldLabel: 'Parent Account ID',
            targetObject: 'Account',
            relationshipName: 'Parent',
            sourceObject: 'Account',
            isMasterDetail: false
          }
        ],
        incoming: [
          {
            fieldName: 'ParentId',
            fieldLabel: 'Parent Account ID',
            sourceObject: 'Account',
            sourceLabel: 'Account',
            relationshipName: 'Parent',
            targetObject: 'Account',
            isMasterDetail: false
          }
        ]
      }
    },
    // ... more objects
  },
  fromCache: true,                                      // true if served from IndexedDB
  timestamp: 1674567890123                              // Cache timestamp
}
```

**Response Error**:

```javascript
{
  success: false,
  error: 'Error message describing what failed'
}
```

**Behavior**:

1. First call: Builds fresh metadata map by calling describeGlobal and batching /describe calls
2. Subsequent calls (within 7 days): Returns cached map from IndexedDB
3. With `forceRefresh: true`: Ignores cache and rebuilds fresh metadata
4. Errors: Returns single error message, doesn't throw exceptions
5. Timeout: May take 30-60 seconds for large orgs on first call

**Cache Invalidation**:

- 7-day TTL (configurable in background.js)
- Manual refresh via `clearMetadataCache` message
- Auto-reloads on user request or settings change

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

### fetchAllRelationships

**Purpose**: Fetch and cache all relationships from Tooling API

**Request**:

```javascript
{
  action: 'fetchAllRelationships',
  instanceUrl: 'https://myorg.my.salesforce.com',
  apiVersion: '66.0',
  sessionId: 'session_id_string',
  isSetupDomain: false,
  forceRefresh: false
}
```

**Response**:

```javascript
{
  success: true,
  data: {
    relationships: {
      outgoing: {
        'Account': [ /* relationships where Account is source */ ],
        'Contact': [ /* relationships where Contact is source */ ]
      },
      incoming: {
        'Account': [ /* relationships where Account is target */ ],
        'Contact': [ /* relationships where Contact is target */ ]
      }
    },
    totalRelationships: 1234,
    timestamp: 1674567890123
  },
  fromCache: true
}
```

---

### invalidateRelationshipCache

**Purpose**: Clear cached relationships

**Request**:

```javascript
{
  action: 'invalidateRelationshipCache',
  instanceUrl: 'https://myorg.my.salesforce.com'
}
```

**Response**:

```javascript
{
  success: true;
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
          else if (response?.success) resolve(response.metadataMap);
          else reject(new Error(response?.error || "Failed to load metadata"));
        },
      );
    });

    state.objectMetadataMap = response;
  } catch (error) {
    console.error("Metadata load failed:", error);
  }
}
```

### Get metadata for specific object

```javascript
// From state.objectMetadataMap (instant):
const objectEntry = state.objectMetadataMap["Account"];
const fields = objectEntry.fields;
const relationships = objectEntry.relationships;

// Serve fields:
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
          if (response?.success) resolve(response.metadataMap);
          else reject(new Error(response?.error));
        },
      );
    });

    state.objectMetadataMap = response;
  } catch (error) {
    console.error("Refresh failed:", error);
  }
}
```

---

## Performance Notes

- **First load**: 30-60 seconds for org with 1000+ objects (once per 7 days)
- **Cache hits**: <1ms lookup from IndexedDB
- **In-memory access**: <0.1ms once loaded
- **Batch size**: 15 objects per parallel batch (optimized for browser concurrency)
- **Rate limiting**: 100ms delay between batches
- **Memory**: ~50-100KB per 100 objects (after stripping unused fields)