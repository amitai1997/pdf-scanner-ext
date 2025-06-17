#!/bin/bash

# Test script to verify the PDF parsing fix for inconsistent secret detection

echo "Testing PDF Scanner fix for inconsistent secret detection..."
echo "============================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

API_URL="http://localhost:3001/scan"

# Check if server is running
echo -e "\n${YELLOW}Checking if inspection service is running...${NC}"
if curl -s "${API_URL%/scan}/health" > /dev/null; then
    echo -e "${GREEN}✓ Service is running${NC}"
else
    echo -e "${RED}✗ Service is not running. Please start it first.${NC}"
    exit 1
fi

# Test 1: Upload the secret PDF file multiple times
echo -e "\n${GREEN}Test 1: Uploading file_with_secrets.pdf multiple times${NC}"
echo "This file contains AWS credentials and should ALWAYS detect secrets"

SECRETS_DETECTED=0
SECRETS_NOT_DETECTED=0

for i in {1..5}; do
    echo -e "\nAttempt $i:"
    
    RESPONSE=$(curl -s -X POST \
        -F "pdf=@/Users/amitaisalmon/Documents/pdf-scanner-ext/test-files/file_with_secrets.pdf" \
        "${API_URL}")
    
    # Check if secrets were detected
    if echo "$RESPONSE" | grep -q '"secrets":true'; then
        echo -e "${GREEN}✓ Secrets detected${NC}"
        ((SECRETS_DETECTED++))
    else
        echo -e "${RED}✗ Secrets NOT detected (This was the bug!)${NC}"
        echo "Response: $RESPONSE"
        ((SECRETS_NOT_DETECTED++))
    fi
    
    # Wait a bit between requests
    sleep 1
done

echo -e "\n${YELLOW}Results for file with secrets:${NC}"
echo -e "Secrets detected: ${GREEN}$SECRETS_DETECTED${NC} times"
echo -e "Secrets NOT detected: ${RED}$SECRETS_NOT_DETECTED${NC} times"

# Test 2: Upload a clean PDF file to make sure we don't have false positives
echo -e "\n${GREEN}Test 2: Uploading clean_resume.pdf (should NOT detect secrets)${NC}"

CLEAN_CORRECT=0
CLEAN_FALSE_POSITIVE=0

for i in {1..3}; do
    echo -e "\nAttempt $i:"
    
    RESPONSE=$(curl -s -X POST \
        -F "pdf=@/Users/amitaisalmon/Documents/pdf-scanner-ext/test-files/clean_resume.pdf" \
        "${API_URL}")
    
    # Check if secrets were detected
    if echo "$RESPONSE" | grep -q '"secrets":false'; then
        echo -e "${GREEN}✓ No secrets detected (correct)${NC}"
        ((CLEAN_CORRECT++))
    else
        echo -e "${RED}✗ Secrets detected (false positive!)${NC}"
        echo "Response: $RESPONSE"
        ((CLEAN_FALSE_POSITIVE++))
    fi
    
    # Wait a bit between requests
    sleep 1
done

echo -e "\n${YELLOW}Results for clean file:${NC}"
echo -e "Correctly identified as clean: ${GREEN}$CLEAN_CORRECT${NC} times"
echo -e "False positives: ${RED}$CLEAN_FALSE_POSITIVE${NC} times"

echo -e "\n============================================="
echo -e "${YELLOW}Test Summary:${NC}"
if [ $SECRETS_NOT_DETECTED -eq 0 ] && [ $CLEAN_FALSE_POSITIVE -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! The fix is working correctly.${NC}"
else
    echo -e "${RED}✗ Some tests failed. The issue may not be fully resolved.${NC}"
fi
