# PDF Scanner Chrome Extension

A Chrome extension that intercepts PDF uploads to AI services (ChatGPT, Claude, Gemini, etc.) and scans them **before** they leave the browser, helping you catch sensitive data leaks early.

---

## File Overview

### Extension (client‑side `src/`)

* `content.js`  — Content script injected into pages to intercept `<input type="file">` and drag‑and‑drop PDF uploads before they leave the browser.
* `background.js`  — Service‑worker context; coordinates scanning workflow, calls the local inspection service, and raises UI alerts.
* `popup.html` / `src/popup.js`  — Minimal UI that shows scan results, warnings, and links to documentation.
* `utils/logger.js`  — Lightweight logger shared by content and background scripts.
* `utils/secretPatterns.js`  — Heuristic regexes for offline secret detection.
* `utils/pdfParser.js`  — Extracts text from PDF blobs in the browser for quick, client‑side scanning.

### Local inspection service (`inspection-service/`)

* `server.js`  — Express server that receives PDFs, extracts text with `pdfjs`, and forwards it to the Prompt Security API.
* `promptSecurityClient.js`  — Thin wrapper around the third‑party Prompt Security REST API.
* `errorHandler.js`  — Centralised Express error‑handling middleware.
* `extractText.js`  — Node helper that converts PDF buffers to plain text for the scanning pipeline.
* `Dockerfile`  — Builds the inspection‑service image.
* `docker-compose.yml`  — Spins up the inspection service (and any side‑cars) in one command.

## *(Files not listed here are build/config artefacts or ancillary test data.)*

---

## General Architecture

![General Architecture](public/architecture.svg)

---

## Instructions for Local Use & Testing

1. **Clone the repository**

   ```bash
   git clone git@github.com:amitai1997/pdf-scanner-ext.git
   cd pdf-scanner-ext
   ```

2. **Load as an unpacked extension**

   * Open Chrome and navigate to `chrome://extensions`.
   * Enable **Developer mode**.
   * Click **Load unpacked** and select this repo's folder.

3. **Run the Inspection Service with Docker Compose**

   The repository includes a preconfigured `docker-compose.yml` in the root. To start the service, simply run:

   ```bash
   docker-compose up --build
   ```

   * The inspection service will build and listen on port 3001 by default.
   * You can stop it with `docker-compose down`.

---

## Limitations

* **Heuristic-based detection** may yield false positives/negatives when offline.
* **API-backed scanning** depends on service availability and network latency.
* **Browser compatibility** tested on Chrome only; other Chromium browsers untested.
* **Size Constraints**: Very large PDFs (>50 MB) may not fully scan before upload.

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
