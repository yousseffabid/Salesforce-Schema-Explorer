# Privacy Policy

**Salesforce Schema Explorer** This Privacy Policy explains how we handle data and information when you use our browser extension.

## 1. Data Collection
- **Personal Data**: We do not collect, store, or transmit any personal data, names, email addresses, or contact information.
- **Salesforce Data**: We do not access, collect, or store any of your Salesforce records (e.g., Accounts, Contacts, Leads).
- **Usage Data**: We do not use any analytics, tracking scripts, or telemetry. We do not track how you use the extension.

## 2. Data Processing
- **Local Processing**: All metadata retrieval and processing (such as fetching object schemas and relationship mapping) happens locally within your browser.
- **Salesforce API Communication**: The extension communicates directly and exclusively with your authenticated Salesforce instance (`*.salesforce.com`, `*.force.com`, `*.salesforce-setup.com`).
- **Authentication**: The extension leverages your existing active Salesforce session for API authentication. We do not store your credentials.

## 3. Data Storage
- **Caching**: Object metadata is temporarily cached in your browser's local storage for up to 7 days to improve performance. You can clear this cache at any time using the "Refresh" button within the extension.
- **Persistent Preferences**: Your manual object exclusion/inclusion settings are stored locally in your browser.

### What We Store Locally
The extension uses the following browser storage mechanisms:
- **localStorage**: Stores your object inclusion/exclusion preferences (permanent). [View the code](https://github.com/yousseffabid/Salesforce-Schema-Explorer/blob/main/schema/modules/storage.js)
- **IndexedDB**: Caches Salesforce object metadata and relationship mapping for 7 days. [View the code](https://github.com/yousseffabid/Salesforce-Schema-Explorer/blob/main/background/modules/cache.js)
- **chrome.storage.session**: Temporarily stores session context (cleared when the browser session ends). [View the code](https://github.com/yousseffabid/Salesforce-Schema-Explorer/blob/main/background/background.js)

You can inspect what is stored in your browser by following [this Chrome DevTools tutorial](https://developer.chrome.com/docs/devtools/storage/localstorage).


## 4. Third Parties
We do not share any information with third parties. No data is sent to external servers.

## 5. Contact
If you have any questions about this Privacy Policy, please open an issue on our [GitHub repository](https://github.com/yousseffabid/Salesforce-Schema-Explorer/issues).
