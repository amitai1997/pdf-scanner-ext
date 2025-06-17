#!/bin/bash

# Script to test the PDF inspection service API
# Usage: ./test-api.sh path/to/test.pdf

# Check if a file was provided
if [ -z "$1" ]; then
  echo "Usage: $0 path/to/test.pdf"
  exit 1
fi

# Check if the file exists
if [ ! -f "$1" ]; then
  echo "Error: File '$1' not found."
  exit 1
fi

# Check if the file is a PDF
if [[ ! "$1" == *.pdf ]]; then
  echo "Warning: File does not have .pdf extension. Proceeding anyway..."
fi

# Set API endpoint
API_URL="http://localhost:3001"

# Health check
echo "🔍 Checking API health..."
HEALTH=$(curl -s "${API_URL}/health")
echo "Health check response: ${HEALTH}"
echo

# Scan the PDF file
echo "📄 Scanning PDF: $1"
RESPONSE=$(curl -s -X POST \
  -F "pdf=@$1" \
  "${API_URL}/scan")

# Check if curl succeeded
if [ $? -ne 0 ]; then
  echo "❌ Error: API request failed"
  exit 1
fi

# Format and display the response
echo "✅ Scan complete!"
echo "Response:"
echo "${RESPONSE}" | jq . 2>/dev/null || echo "${RESPONSE}"
echo

# Extract secrets status
SECRETS=$(echo "${RESPONSE}" | grep -o '"secrets":\s*\(true\|false\)' | cut -d: -f2)
if [[ "${SECRETS}" == *true* ]]; then
  echo "⚠️  WARNING: Secrets detected in the PDF!"
else
  echo "✅ No secrets detected in the PDF."
fi 