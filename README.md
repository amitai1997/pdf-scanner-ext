# PDF Scanner Chrome Extension

A Chrome extension that intercepts PDF uploads to AI services like ChatGPT and Claude to scan them for secrets before they reach the AI service.

## Features

- Immediate PDF scanning upon file selection
- Detects sensitive information in PDFs before upload
- Works with ChatGPT, Claude, and other AI services
- Provides clear warnings when secrets are detected
- Allows users to cancel uploads containing sensitive data

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension is now installed and active

## Usage

1. When you select a PDF file to upload to an AI service, the extension will automatically scan it
2. A scanning indicator will appear while the file is being analyzed
3. If no secrets are found, a green indicator will confirm the file is safe to upload
4. If secrets are detected, a warning modal will appear with details and options to proceed or cancel

## Development

### Prerequisites

- Node.js and npm

### Setup

```bash
# Install dependencies
npm install

# Run tests
npm test
```

## Security Notes

- The extension scans PDFs locally before they're uploaded
- No data is sent to external servers (except for the AI service you're using)
- Sensitive information is never logged or stored

## License

MIT

## Privacy Policy

This extension does not collect any user data. All PDF scanning is done locally or through the specified API endpoint.

## Support

For issues or feature requests, please open an issue on the GitHub repository.
