# PDF Scanner Chrome Extension

A Chrome extension that scans PDFs for secrets and policy violations before they are uploaded to AI services like ChatGPT and Claude.

## Features

- Automatically intercepts PDF uploads to AI services
- Scans PDFs for secrets, API keys, and sensitive information
- Shows notifications when secrets are detected
- Provides visual warnings in the UI
- Allows manual scanning of PDF files

## Supported AI Services

- OpenAI ChatGPT (chat.openai.com)
- Anthropic Claude (claude.ai)
- API endpoints for both services

## Installation

### Development Mode

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the project directory
5. The extension should now be installed and active

### From Chrome Web Store

*Coming soon*

## Usage

### Automatic Scanning

The extension automatically monitors for PDF uploads to supported AI services. When a PDF containing secrets is detected, the extension will:

1. Show a notification
2. Display a warning in the UI
3. Log the detection in the extension's history

### Manual Scanning

1. Click on the extension icon in the toolbar
2. Click "Scan PDF" in the popup
3. Select a PDF file to scan
4. View the scan results in the popup

### Keyboard Shortcut

- `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (Mac): Open the PDF scanner

## Development

### Project Structure

```
pdf-scanner-ext/
  ├── public/
  │   ├── popup.html       # Extension popup UI
  │   └── styles/          # CSS files
  ├── src/
  │   ├── background.js    # Service worker
  │   ├── content.js       # Content script
  │   ├── popup.js         # Popup script
  │   └── utils/           # Utility functions
  │       └── interceptor.js  # PDF interception logic
  └── manifest.json        # Extension manifest
```

### Building

No build step is required for development. For production, you may want to minify the JavaScript files.

## Security Considerations

- The extension runs with minimal permissions
- PDF scanning happens locally before upload
- No data is sent to external servers (except for the scanning API)
- Content Security Policy is enforced

## License

MIT

## Privacy Policy

This extension does not collect any user data. All PDF scanning is done locally or through the specified API endpoint.

## Support

For issues or feature requests, please open an issue on the GitHub repository.
