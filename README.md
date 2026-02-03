# Salesforce Schema Explorer

<p align="center">
  <img src="icons/icon128.png" alt="SF Schema Explorer Logo" width="128">
</p>

<p align="center">
  <strong>Visualize Salesforce object incoming & outgoing relationships with an interactive graph explorer</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#privacy">Privacy</a> •
  <a href="#support">Support</a>
</p>

---

## Overview

**Salesforce Schema Explorer** is a Chrome extension that provides an interactive, visual way to explore Salesforce object schemas and relationships. Perfect for developers, admins, and architects who need to understand data model structures quickly.

No more digging through Object Manager or switching between tabs. See object schemas and relationships at a glance, and explore field details with a single click on any node/object.

## Features

### 🔗 Interactive Relationship Graph

- **Visual Node Graph**: See objects and their relationships displayed as an interactive diagram
- **Relationship Types**: Clearly distinguished Lookup (purple) and Master-Detail (red) relationships
- **Clickable Nodes**: Click any node to instantly view its fields and details
- **Relationship Insights**: Click on relationship counts to view detailed field and object names in a popover
- **Custom Object View**: Click "View Objects" to manually exclude or re-include objects with persistent preferences (don't forget to click **Save Changes**)
- **Hover Tooltips**: Nodes show "Click to view fields" tooltip on hover

### 🔍 Smart Object Search

- **Global Search**: Find any object in your org by name or API name
- **Real-time Autocomplete**: Suggestions appear as you type (minimum 2 characters)
- **Keyboard Navigation**: Use ↑↓ arrows to navigate, Enter to select, Escape to close
- **Custom Object Badges**: Easily identify custom objects in search results

### 📋 Comprehensive Field Details

- **Complete Field List**: View all fields for any object with search and filter
- **Field Attributes**: See Required, Calculated, and Restricted field indicators
- **Type Information**: Detailed type info including number precision and text length
- **Smart Tooltips**: Hover over field name, API name, or type to see the entire word if it cropped.
- **Object Manager Links**: Quick link to open the object in Salesforce Object Manager

### ⚡ Graph Controls

- **Fit to Screen**: Show all nodes in the viewport
- **Center on Main**: Focus on the primary object
- **Reset Layout**: Recalculate node positions

- **On-Demand Loading**: Metadata is fetched lazily as you explore. Only the current object and its immediate neighbors are loaded initially, ensuring maximum speed.
- **Persistent Cache**: Objects are cached in IndexedDB for 7 days, making second loads of the same object instantaneous.
- **Force Refresh**: Clear the cache via the reload icon in the "Relationships" legend to retrieve fresh metadata.
- **Persistent Preferences**: Manual object exclusions/inclusions are preserved even after cache refreshes.

### 📱 Works Everywhere

The extension works on:
- Salesforce Home Page
- Record Pages
- List Views
- Object Manager

## Installation

### From Chrome Web Store (Not Available Yet)

1. Visit the [Salesforce Schema Explorer](https://chrome.google.com/webstore) page
2. Click **"Add to Chrome"**
3. Confirm the installation
4. Navigate to any Salesforce page to start using

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **"Developer mode"** (toggle in top-right corner)
4. Click **"Load unpacked"**
5. Select the `salesforce-schema-explorer` folder
6. The extension icon will appear in your toolbar

## Usage

### Getting Started

1. **Navigate** to any Salesforce Lightning page
2. **Look for** the 🔗 link icon in the top-right corner
3. **Click** the icon to open SF Schema Explorer

### Exploring Schemas

1. **Search**: Type an object name (e.g., "Account", "Contact") in the search bar
2. **Select**: Click a result or press Enter to load the schema
3. **Explore**: The graph shows the selected object (blue) and its related objects (gray)
4. **Click Nodes**: Click any node to view its field details in the slide-in panel

### Understanding the Graph

| Element | Description |
|---------|-------------|
| **Blue Node** | The main/selected object |
| **Gray Nodes** | Related objects |
| **Purple Lines** | Lookup relationships |
| **Red Lines** | Master-Detail relationships |
| **Solid Lines** | Outgoing relationships (Main object points to related object) |
| **Dashed Lines** | Incoming relationships (Related object points to main object) |

### Field Panel Features

- **Search Fields**: Filter by field name or API name
- **Filter by Type**: Show only specific field types (Text, Number, Lookup, etc.)
- **Filter by Attribute**: Show only Required, Calculated, or Restricted fields
- **Tooltips**: Hover over any field element for more information

## Permissions

This extension requires minimal permissions:

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access the current Salesforce tab |
| `storage` | Store session context temporarily |
| `scripting` | Inject the extension UI |
| **Host Permissions** | Only Salesforce domains |

### What is accessed

- Salesforce object metadata (field names, types, relationships)
- Current Salesforce session (for authentication)

### What is NOT accessed

- Your Salesforce data/records
- Personal information
- Any non-Salesforce websites

## Privacy

**Salesforce Schema Explorer respects your privacy:**

- **No Data Collection**: We do not collect, store, or transmit any personal data
- **No Analytics**: No tracking scripts, no telemetry
- **Local Processing**: All processing happens locally in your browser
- **Session-Based**: Temporary context is cleared when Chrome closes
- **Salesforce Only**: Only communicates with your authenticated Salesforce org

### Data Flow

```
Your Browser ←→ Salesforce API
     ↑
     └── All data stays here (no external servers)
```

## Technical Details

### Supported Domains

- `*.salesforce.com`
- `*.force.com`
- `*.salesforce-setup.com`

### Browser Compatibility

- Chrome 109+
- Microsoft Edge 109+ (Chromium-based)

### Salesforce API Usage

The extension uses standard Salesforce REST APIs:

```
/services/data/                    - API version discovery
/services/data/vXX/sobjects        - Object list
/services/data/vXX/sobjects/{obj}/describe - Object metadata
```

## Troubleshooting

### Extension Button Not Visible

- Ensure you're on a Salesforce Lightning page
- Check that the URL contains `/lightning/`
- Try refreshing the page
- Pin the extension in Chrome's toolbar menu

### "Authentication Failed" Error

1. Your Salesforce session may have expired
2. Try logging out and back in to Salesforce
3. Navigate to a standard record page (not Setup)
4. Click the extension button again

### Schema Not Loading

- Check your internet connection
- Ensure you have API access in your Salesforce profile
- Try searching for a standard object like "Account"
- Check the browser console for error details
- Note: Some objects are not queryable by Salesforce or not creatable and will not show

## Project Structure

```
salesforce-schema-explorer/
├── manifest.json          # Extension configuration
├── background/
│   ├── background.js      # Service worker entry point
│   └── modules/           # API, Auth, Cache, Metadata, Utils
├── content/
│   ├── content.js         # Content script entry point
│   ├── content.css        # Styles for injected UI
│   ├── modules/           # Session, UI, URL, Utils
│   └── resources/         # Isolate script injection (Session Extractor)
├── schema/
│   ├── schema.html        # Main extension page
│   ├── schema.js          # Main application entry point
│   ├── schema.css         # Comprehensive styles
│   ├── cytoscape.min.js   # Graph visualization library
│   └── modules/           # Modularized application logic
│       ├── api.js         # API interactions
│       ├── data.js        # Data processing and utilities
│       ├── graph.js       # Graph visualization logic
│       ├── state.js       # Centralized state management
│       └── ui/            # UI Components (Details, Filters, Legend, etc.)
├── icons/                 # Extension icons (16, 32, 48, 128)
└── README.md              # Project documentation
```

## Development

### Prerequisites

- Chrome 109 or higher
- A Salesforce org for testing

### Setup

1. Clone the repository
2. Load as unpacked extension (see Installation)
3. Make changes to source files
4. Reload extension in `chrome://extensions/`

### Code Quality

- **Documentation**: All JavaScript files include comprehensive inline comments
- **Security**: XSS prevention, no eval(), CSP compliant
- **Performance**: Lazy-loading strategy, debounced inputs, and cached metadata.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/x-feature`)
3. Commit your changes (`git commit -m 'Add x feature'`)
4. Push to the branch (`git push origin feature/x-feature`)
5. Open a Pull Request

## Third-Party Libraries
 
This project uses the following open-source libraries:
 
- [Cytoscape.js](https://js.cytoscape.org/) - Graph theory (network) library for visualization and analysis (MIT License)
 
## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: Report bugs via GitHub Issues
- **Feature Requests**: Submit ideas via GitHub Issues
- **Questions**: Check existing issues or  create a new one

---

<p align="center">
  <strong>Made with ❤️ by Youssef Abid for the Salesforce community</strong>
</p>

<p align="center">
  <sub>Salesforce Schema Explorer is not affiliated with or endorsed by Salesforce, Inc.</sub>
</p>
