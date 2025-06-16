# PDF Scanner Chrome Extension

A Chrome extension that intercepts PDF uploads to AI services like ChatGPT and Claude to scan them for secrets before they reach the AI service.

## Features

- Immediate PDF scanning upon file selection
- Detects sensitive information in PDFs before upload
- Works with ChatGPT, Claude, and other AI services
- Provides clear warnings when secrets are detected
- Allows users to cancel uploads containing sensitive data

## Architecture

The extension uses three complementary detection methods to ensure PDFs are caught before upload:

1. **File Input Monitoring (Primary Method)**
   - Detects PDFs immediately when selected through file inputs
   - Provides the best user experience with immediate feedback
   - Works with standard file selection dialogs

2. **WebRequest API (Backup Method)**
   - Catches uploads that bypass file inputs
   - Monitors network requests to AI service endpoints
   - Provides a safety net for non-standard uploads

3. **XHR/Fetch Overrides (Fallback Method)**
   - Monitors programmatic uploads via JavaScript
   - Intercepts XHR and fetch requests containing PDFs
   - Ensures coverage for advanced web applications

This multi-layered approach ensures comprehensive coverage across different AI services and upload methods.

## Installation

### For Users
1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension is now installed and active

### For Developers
1. Clone this repository
2. Install dependencies:
   ```bash
   npm ci
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Start the development environment:
   ```bash
   npm run dev
   ```

## Development Setup

The extension includes a mock backend for development:

1. The mock backend runs at `http://localhost:8080`
2. It simulates the PDF scanning API
3. PDFs with names containing "secret", "aws", "key", "pass", "token", or "auth" will be flagged as containing secrets

For more detailed development instructions, see [DEVELOPMENT.md](DEVELOPMENT.md).

## Usage

1. When you select a PDF file to upload to an AI service, the extension will automatically scan it
2. A scanning indicator will appear while the file is being analyzed
3. If no secrets are found, a green indicator will confirm the file is safe to upload
4. If secrets are detected, a warning modal will appear with details and options to proceed or cancel

## Troubleshooting

### Common Issues
- **Extension not detecting PDFs**: Make sure you're on a supported site (ChatGPT, Claude)
- **Scanning indicator doesn't appear**: Reload the page and try again
- **Warning appears but upload proceeds anyway**: Some sites use custom upload mechanisms that bypass standard prevention

### Development Issues
- **Mock backend not connecting**: Check that port 8080 is not in use by another application
- **Changes not appearing**: Reload the extension in Chrome's extension manager
- **Console errors about imports**: Make sure you're using the correct import syntax for ES modules

## Security Notes

- The extension scans PDFs locally before they're uploaded
- No data is sent to external servers (except for the AI service you're using)
- Sensitive information is never logged or stored

## Production Deployment

Coming in Day 3 of development.

## License

MIT

## Privacy Policy

This extension does not collect any user data. All PDF scanning is done locally or through the specified API endpoint.

## Support

For issues or feature requests, please open an issue on the GitHub repository.
