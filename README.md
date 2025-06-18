# PDF Scanner Chrome Extension

A Chrome extension that intercepts PDF uploads to AI services (ChatGPT, Claude, Gemini, etc.) and scans them **before** they leave the browser, helping you catch sensitive data leaks early.

## General Architecture

![General Architecture](public/architecture.svg)
---


## Instructions for Local Use & Testing

1. **Clone the repository**

   ```bash
   git clone https://github.com/amitai1997/pdf-scanner-ext.git
   cd pdf-scanner-ext
   ```

2. **Load as an unpacked extension**

   * Open Chrome and navigate to `chrome://extensions`.
   * Enable **Developer mode**.
   * Click **Load unpacked** and select this repo's folder.

3. **Configure the Inspection Service**

   Copy the environment template and configure your API credentials:

   ```bash
   cd inspection-service
   cp env.template .env
   ```

   * Edit `.env` and set your `PROMPT_SECURITY_APP_ID` (required for secret detection)
   * The template includes a test app ID for development purposes

4. **Run the Inspection Service with Docker Compose**

   Return to the root directory and start the service:

   ```bash
   cd ..
   docker-compose up --build
   ```

   * The inspection service will build and listen on port 3001 by default.
   * You can stop it with `docker-compose down`.

5. *Now you can open Chatgpt/Claude and upload PDF files to test this manually!*

---

## File Overview

### 1. inspection-service (Node + Express micro-service `inspection-service/`)

| File                               | What it does                                                                                                                                                     |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **server.js**                      | Spins up the Express API (`/health`, `/scan`). Accepts a PDF, extracts text deterministically with `extractPDFTextDeterministic()`, sends it to Prompt Security, and returns an **allow/block** verdict. |
| **middleware/errorHandler.js**     | Central error middleware + tiny `AppError` class so all routes respond with a consistent JSON envelope and status code.                                            |
| **services/promptSecurityClient.js** | Thin client for the Prompt Security REST API – adds retries/back-off, request timeouts, and maps the raw response into `{secrets, findings, action}`.            |
| **utils/logger.js**                | Colour-free console logger with `error / warn / info / debug` levels, request tracing helpers, and env-driven log level.                                          |

### 2. Chrome Extension (`src/`)

| File                            | Runtime context    | What it does                                                                                                                                               |
|---------------------------------|--------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **background.js**               | Service-worker     | Orchestrates scans: receives PDFs, POSTs them to the backend, stores daily counters in `chrome.storage`, throttles duplicate scans, and shows desktop + in-page notifications. |
| **content.js**                  | Content script     | Watches  P the page for file uploads, drag-drops, clipboard pastes, XHR/`fetch` bodies; flags PDFs, requests scans, and overlays a warning banner if secrets are found. |
| **popup.js**                    | Popup UI           | Controller for `popup.html`; shows Active/Inactive state, daily scan count, last-scan time, and a DEV badge for non-production builds.                    |
| **utils/formDataParser.js**     | Shared (SW + content + interceptor) | Extracts a PDF from any request body (multipart, base64 JSON blob, nested `file` object) and enforces the 20 MB limit.                       |
| **utils/interceptor.js**        | Shared, initialised by the service-worker |  PAdds Chrome `webRequest` listeners for AI-site endpoints. When it sees an outgoing POST containing a PDF, it extracts the file (via `FormDataParser`) and passes it to the service-worker. |

---
![General Architecture](public/sequence_diagram.png)
---

## Limitations

* **API dependency**: Requires Prompt Security API for secret detection; gracefully allows uploads when API is unavailable.
* **Network latency**: API-backed scanning depends on service availability and network connectivity.
* **Browser compatibility** tested on Chrome only; other Chromium browsers untested.
* **Size Constraints**: Very large PDFs (>50 MB) may not fully scan before upload.

---

## Production Readiness Checklist

1. **Robust Secret Detection**

   * Integrate with a dedicated secrets-scanning API (e.g., TruffleHog, GitLeaks).
   * Maintain and update regex patterns and ML models.

2. **Authentication & Security**

   * Secure API endpoints with OAuth2 or API keys.
   * Serve the API over HTTPS with valid TLS certificates.

3. **Error Handling & Logging**

   * Centralized logging (e.g., ELK stack, Datadog).
   * Graceful fallback: allow upload if the scanner service is unavailable.

4. **User Experience**

   * Customizable alert UI.
   * Option to whitelist certain file paths or patterns.

5. **CI/CD & Deployment**

   * Automated builds and tests via GitHub Actions.
   * Versioning and release pipeline for Chrome Web Store.

6. **Documentation & Support**

   * Detailed user guide.
   * Changelog and troubleshooting section.

---

## Performance Improvement Ideas

* **WebAssembly (WASM) scanning**: Run detection logic in-thread in the browser for speed.
* **Incremental PDF parsing**: Stream and scan in chunks for large files.
* **Caching previously scanned documents**: Use localStorage or IndexedDB to skip re-scanning.
* **Parallelized scanning**: Leverage Web Workers to scan different PDF sections concurrently.
* **Batch uploads queue**: Throttle and batch multiple uploads to reduce UI blocking.
