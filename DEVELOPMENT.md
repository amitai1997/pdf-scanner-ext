# Development Guide

## Setup

1. Install dependencies:
   ```bash
   npm ci
   ```

2. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```

3. Start development environment:
   ```bash
   npm run dev
   ```
   This starts both the mock backend (port 8080) and loads the extension in Chrome.

## Architecture

### Detection Methods
1. **File Input Monitoring** - Primary method, catches file selection
2. **WebRequest API** - Backup for programmatic uploads
3. **XHR/Fetch Overrides** - Fallback for AJAX uploads

### Mock Backend
The mock backend simulates the Prompt Security API during development:
- Files with "secret", "aws", "key", etc. in the name trigger positive detection
- Runs on http://localhost:8080
- Returns realistic API responses

## Testing Different Scenarios

1. **Test with secrets**: Name your PDF with keywords like "aws-keys.pdf"
2. **Test clean files**: Use normal names like "document.pdf"
3. **Test large files**: Try files over 20MB to test size limits

## Chrome Extension Debugging

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked" and select the project directory
4. Right-click the extension icon → "Inspect popup" for popup debugging
5. Go to any AI service page → F12 → Console for content script logs
6. Click "service worker" link in chrome://extensions for background logs

## Common Issues

- **Port 8080 in use**: Change `DEV_BACKEND_PORT` in `.env`
- **Extension not updating**: Click reload button in chrome://extensions
- **CORS errors**: Make sure mock backend is running 