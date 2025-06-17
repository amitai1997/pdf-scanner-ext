# PDF Inspection Service

Backend service for the PDF Scanner Chrome Extension that extracts text from PDFs and checks for sensitive information using the Prompt Security API.

## Features

- Extract text from PDF files
- Scan for secrets and sensitive data using Prompt Security API
- JSON response with scan findings
- CORS enabled for local development
- Error handling and request validation
- Logging of scan results

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file with the following variables:
   ```
   INSPECTION_PORT=3001
   PROMPT_SECURITY_APP_ID=cc6a6cfc-9570-4e5a-b6ea-92d2adac90e4
   NODE_ENV=development
   LOG_LEVEL=debug
   ```

3. Start the server:
   ```
   npm start
   ```
   
   Or for development with auto-reload:
   ```
   npm run dev
   ```

## API Endpoints

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "environment": "development",
  "timestamp": "2023-09-10T12:34:56.789Z"
}
```

### Scan PDF

```
POST /scan
```

Request:
- Content-Type: `multipart/form-data`
- Body: Form data with `pdf` file field

Response:
```json
{
  "secrets": true,
  "findings": [
    {
      "type": "AWS_ACCESS_KEY",
      "confidence": 0.95,
      "location": "page 1, line 15"
    }
  ],
  "action": "block",
  "scannedAt": "2023-09-10T12:34:56.789Z"
}
```

## Testing

Use the provided test script to test the API:

```bash
./test-api.sh path/to/test.pdf
```

## Error Handling

The service returns appropriate HTTP status codes and error messages:

- `400` - Bad Request (invalid PDF, too large, etc.)
- `404` - Route not found
- `500` - Internal Server Error
- `503` - Service Unavailable (API down after retries)

## Integrating with the Extension

Update the extension's `background.js` to use this service:

1. Set the correct `BACKEND_URL`
2. Use the `sendToLocalBackend` method to send PDFs for scanning

## Logging

Scan results are logged to `logs/scans.log` in JSON format for observability. 