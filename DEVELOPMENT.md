# PDF Scanner Extension - Development Setup

## Quick Start

### 1. Start the Inspection Service

**Option A: Using Docker (Recommended)**
```bash
npm run dev:docker
```

**Option B: Direct Node.js**
```bash
npm run dev:service
```

### 2. Load Extension in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select this project folder

### 3. Test the Setup
- Visit ChatGPT, Claude, or Gemini
- Try uploading a PDF file
- The extension should intercept and scan it

## Development Commands

```bash
# Start inspection service with hot-reload
npm run dev

# Start with Docker (includes hot-reload)
npm run dev:docker

# View service logs
npm run docker:logs

# Stop Docker services
npm run docker:down

# Clean up build artifacts
npm run clean

# Lint code
npm run lint
```

## Configuration

### Environment Variables (Optional)
Copy `inspection-service/env.template` to `inspection-service/.env`:

```bash
cp inspection-service/env.template inspection-service/.env
```

Add your Prompt Security API credentials (optional - falls back to local scanning):
```
PROMPT_SECURITY_APP_ID=your_app_id
PROMPT_SECURITY_API_KEY=your_api_key
```

## Service Endpoints

- **Health Check**: http://localhost:3001/health
- **PDF Scan**: http://localhost:3001/scan (POST)

## Development Notes

- **Hot Reload**: Code changes automatically restart the service
- **Extension Reload**: Use Chrome's reload button in extensions page after code changes
- **Logs**: Service logs show scan results and API calls
- **Fallback**: Works without API credentials using local pattern matching

## Troubleshooting

**Service won't start:**
- Check Docker is running: `docker ps`
- Check port 3001 is free: `lsof -i :3001`

**Extension not working:**
- Reload extension in Chrome after code changes
- Check browser console for errors
- Verify service is running at localhost:3001

**No PDF detection:**
- Check supported sites (ChatGPT, Claude, Gemini)
- Check browser network tab for requests to localhost:3001 