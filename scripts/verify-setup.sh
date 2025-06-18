#!/bin/bash

# PDF Scanner Extension Setup Verification Script
set -e

echo "🔍 Verifying PDF Scanner Extension production setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
    else
        echo -e "${RED}✗${NC} Missing: $1"
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} Directory: $1"
    else
        echo -e "${RED}✗${NC} Missing directory: $1"
        return 1
    fi
}

check_executable() {
    if [ -x "$1" ]; then
        echo -e "${GREEN}✓${NC} Executable: $1"
    else
        echo -e "${RED}✗${NC} Not executable: $1"
        return 1
    fi
}

echo ""
echo "📁 Checking file structure..."

# Core extension files
check_file "manifest.json"
check_file "package.json"
check_file "README.md"

# Source files
check_dir "src"
check_file "src/background.js"
check_file "src/content.js"
check_file "src/popup.js"

# Public files
check_dir "public"
check_file "public/popup.html"

# Inspection service
check_dir "inspection-service"
check_file "inspection-service/package.json"
check_file "inspection-service/server.js"
check_file "inspection-service/Dockerfile"
check_file "inspection-service/.dockerignore"
check_file "inspection-service/env.template"

# Service structure
check_dir "inspection-service/middleware"
check_file "inspection-service/middleware/errorHandler.js"
check_dir "inspection-service/services"
check_file "inspection-service/services/promptSecurityClient.js"
check_dir "inspection-service/utils"
check_file "inspection-service/utils/logger.js"

# Docker setup
check_file "docker-compose.yml"
check_file "docker-compose.prod.yml"

# Scripts
check_dir "scripts"
check_file "scripts/package-release.sh"
check_executable "scripts/package-release.sh"

echo ""
echo "🔧 Checking package.json scripts..."

# Check if required scripts exist
if npm run | grep -q "package"; then
    echo -e "${GREEN}✓${NC} Package script available"
else
    echo -e "${RED}✗${NC} Package script missing"
fi

if npm run | grep -q "dev:docker"; then
    echo -e "${GREEN}✓${NC} Docker dev script available"
else
    echo -e "${RED}✗${NC} Docker dev script missing"
fi

echo ""
echo "📋 Checking manifest.json..."

# Check manifest version
if grep -q "manifest_version.*3" manifest.json; then
    echo -e "${GREEN}✓${NC} Manifest V3 format"
else
    echo -e "${RED}✗${NC} Not using Manifest V3"
fi

# Check permissions
if grep -q "activeTab" manifest.json; then
    echo -e "${GREEN}✓${NC} Required permissions present"
else
    echo -e "${YELLOW}⚠${NC} Check permissions in manifest.json"
fi

echo ""
echo "🐳 Checking Docker configuration..."

# Check Dockerfile structure
if grep -q "FROM node:20-slim" inspection-service/Dockerfile; then
    echo -e "${GREEN}✓${NC} Using Node 20 slim base image"
else
    echo -e "${RED}✗${NC} Not using recommended base image"
fi

if grep -q "USER appuser" inspection-service/Dockerfile; then
    echo -e "${GREEN}✓${NC} Running as non-root user"
else
    echo -e "${RED}✗${NC} Not configured for non-root user"
fi

if grep -q "HEALTHCHECK" inspection-service/Dockerfile; then
    echo -e "${GREEN}✓${NC} Health check configured"
else
    echo -e "${RED}✗${NC} Health check missing"
fi

# Check docker-compose
if grep -q "version.*3" docker-compose.yml; then
    echo -e "${GREEN}✓${NC} Docker Compose format valid"
else
    echo -e "${YELLOW}⚠${NC} Check Docker Compose version"
fi

echo ""
echo "📝 Checking code quality..."

# Check for console.log in inspection service (should be replaced with logger)
if grep -r "console\.log" inspection-service/ --exclude-dir=node_modules --exclude="*.md" | grep -v "logger.js"; then
    echo -e "${YELLOW}⚠${NC} Found console.log statements that should use logger"
else
    echo -e "${GREEN}✓${NC} No unwrapped console.log statements in inspection service"
fi

# Check for proper logger import in main files
if grep -q "require.*logger" inspection-service/server.js; then
    echo -e "${GREEN}✓${NC} Logger properly imported in server.js"
else
    echo -e "${RED}✗${NC} Logger not imported in server.js"
fi

echo ""
echo "🛡️ Checking security configuration..."

# Check for hardcoded secrets
if grep -r "AKIA[A-Z0-9]" . --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" | grep -v "test\|example\|template"; then
    echo -e "${RED}✗${NC} Found potential hardcoded AWS keys"
else
    echo -e "${GREEN}✓${NC} No hardcoded secrets detected"
fi

# Check environment template
if grep -q "your_app_id_here" inspection-service/env.template; then
    echo -e "${GREEN}✓${NC} Environment template properly configured"
else
    echo -e "${YELLOW}⚠${NC} Check environment template"
fi

echo ""
echo "📦 Checking build readiness..."

# Check if dependencies can be resolved
if [ -f "inspection-service/package-lock.json" ]; then
    echo -e "${GREEN}✓${NC} NPM dependencies locked"
else
    echo -e "${YELLOW}⚠${NC} Consider running 'npm ci' in inspection-service"
fi

# Check version consistency
MAIN_VERSION=$(node -p "require('./package.json').version")
SERVICE_VERSION=$(node -p "require('./inspection-service/package.json').version")

if [ "$MAIN_VERSION" = "$SERVICE_VERSION" ]; then
    echo -e "${GREEN}✓${NC} Version consistency across packages"
else
    echo -e "${YELLOW}⚠${NC} Version mismatch: main=$MAIN_VERSION, service=$SERVICE_VERSION"
fi

echo ""
echo "🎯 Summary:"
echo "Extension version: $MAIN_VERSION"
echo "Ready for packaging with: npm run package"
echo "Ready for development with: npm run dev:docker"
echo ""

echo -e "${GREEN}✨ Verification complete!${NC}"

# Instructions
echo ""
echo "📚 Next steps:"
echo "1. Start development: npm run dev:docker"
echo "2. Test the service: curl http://localhost:3001/health"
echo "3. Load extension in Chrome Developer Mode"
echo "4. Create release package: npm run package"
echo ""
echo "For production deployment, see the generated DEPLOYMENT-GUIDE.md" 