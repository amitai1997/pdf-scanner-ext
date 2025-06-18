#!/bin/bash

# PDF Scanner Extension Release Packaging Script
set -e

echo "🚀 Starting PDF Scanner Extension release packaging..."

# Configuration
VERSION=$(node -p "require('./package.json').version")
EXTENSION_NAME="pdf-scanner-extension-v${VERSION}"
TEMP_DIR="temp-release"
DIST_DIR="release"

# Clean up previous builds
echo "🧹 Cleaning up previous builds..."
rm -rf "${TEMP_DIR}" "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# Create temporary directory for packaging
mkdir -p "${TEMP_DIR}"

echo "📦 Packaging extension files..."

# Copy extension files to temp directory
cp -r src/ "${TEMP_DIR}/"
cp -r public/ "${TEMP_DIR}/"
cp manifest.json "${TEMP_DIR}/"

# Copy documentation
cp README.md "${TEMP_DIR}/"

# Create extension zip file
echo "🗜️  Creating extension zip file..."
cd "${TEMP_DIR}"
zip -r "../${DIST_DIR}/${EXTENSION_NAME}.zip" . -x "*.DS_Store" "*.git*" "node_modules/*" "debug/*"
cd ..

# Build Docker image for inspection service
echo "🐳 Building Docker image for inspection service..."
cd inspection-service
docker build -t "pdf-scanner-inspection:${VERSION}" -t "pdf-scanner-inspection:latest" --target production .
cd ..

# Save Docker image as tar file
echo "💾 Saving Docker image..."
docker save "pdf-scanner-inspection:${VERSION}" | gzip > "${DIST_DIR}/pdf-scanner-inspection-${VERSION}.tar.gz"

# Create release notes
echo "📄 Creating release notes..."
cat > "${DIST_DIR}/RELEASE-NOTES-${VERSION}.md" << EOF
# PDF Scanner Extension v${VERSION}

## Release Package Contents

### Chrome Extension
- **File**: \`${EXTENSION_NAME}.zip\`
- **Installation**: Load unpacked extension in Chrome Developer Mode
- **Features**: Multi-platform PDF scanning with real-time secret detection

### Inspection Service
- **Docker Image**: \`pdf-scanner-inspection-${VERSION}.tar.gz\`
- **Load Command**: \`docker load < pdf-scanner-inspection-${VERSION}.tar.gz\`
- **Run Command**: \`docker run -p 3001:3001 pdf-scanner-inspection:${VERSION}\`

## Quick Start

### 1. Deploy Inspection Service
\`\`\`bash
# Load the Docker image
docker load < pdf-scanner-inspection-${VERSION}.tar.gz

# Run the service
docker run -d \\
  --name pdf-scanner-service \\
  -p 3001:3001 \\
  -e PROMPT_SECURITY_APP_ID=your_app_id \\
  -e PROMPT_SECURITY_API_KEY=your_api_key \\
  pdf-scanner-inspection:${VERSION}
\`\`\`

### 2. Install Chrome Extension
1. Open Chrome and navigate to \`chrome://extensions/\`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extracted \`${EXTENSION_NAME}\` folder

### 3. Configuration
The extension will automatically connect to the inspection service running on \`localhost:3001\`.

## System Requirements
- Chrome Browser (Manifest V3 support)
- Docker or Node.js 20+ for inspection service
- Optional: Prompt Security API credentials for enhanced detection

## Security Notes
- All PDF processing is done locally or via your inspection service
- No PDF content is sent to third parties without explicit API configuration
- Extension operates with minimal permissions

---
Generated on: $(date)
Build: ${VERSION}
EOF

# Create deployment guide
echo "📚 Creating deployment guide..."
cat > "${DIST_DIR}/DEPLOYMENT-GUIDE.md" << EOF
# PDF Scanner Extension Deployment Guide

## Production Deployment Options

### Option 1: Docker Compose (Recommended)
\`\`\`bash
# 1. Extract the inspection service
docker load < pdf-scanner-inspection-${VERSION}.tar.gz

# 2. Create docker-compose.yml
cat > docker-compose.yml << 'DOCKER_EOF'
version: '3.8'
services:
  pdf-scanner:
    image: pdf-scanner-inspection:${VERSION}
    container_name: pdf-scanner-service
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PROMPT_SECURITY_APP_ID=\${PROMPT_SECURITY_APP_ID}
      - PROMPT_SECURITY_API_KEY=\${PROMPT_SECURITY_API_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
DOCKER_EOF

# 3. Create .env file
cat > .env << 'ENV_EOF'
PROMPT_SECURITY_APP_ID=your_app_id_here
PROMPT_SECURITY_API_KEY=your_api_key_here
ENV_EOF

# 4. Start the service
docker-compose up -d
\`\`\`

### Option 2: Cloud Deployment

#### AWS ECS/Fargate
\`\`\`bash
# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin your-account.dkr.ecr.us-east-1.amazonaws.com
docker tag pdf-scanner-inspection:${VERSION} your-account.dkr.ecr.us-east-1.amazonaws.com/pdf-scanner:${VERSION}
docker push your-account.dkr.ecr.us-east-1.amazonaws.com/pdf-scanner:${VERSION}
\`\`\`

#### Google Cloud Run
\`\`\`bash
# Push to GCR
docker tag pdf-scanner-inspection:${VERSION} gcr.io/your-project/pdf-scanner:${VERSION}
docker push gcr.io/your-project/pdf-scanner:${VERSION}

# Deploy to Cloud Run
gcloud run deploy pdf-scanner \\
  --image gcr.io/your-project/pdf-scanner:${VERSION} \\
  --platform managed \\
  --region us-central1 \\
  --allow-unauthenticated \\
  --port 3001
\`\`\`

### Option 3: Kubernetes
\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pdf-scanner
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pdf-scanner
  template:
    metadata:
      labels:
        app: pdf-scanner
    spec:
      containers:
      - name: pdf-scanner
        image: pdf-scanner-inspection:${VERSION}
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: production
        - name: PROMPT_SECURITY_APP_ID
          valueFrom:
            secretKeyRef:
              name: pdf-scanner-secrets
              key: app-id
        - name: PROMPT_SECURITY_API_KEY
          valueFrom:
            secretKeyRef:
              name: pdf-scanner-secrets
              key: api-key
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: pdf-scanner-service
spec:
  selector:
    app: pdf-scanner
  ports:
  - port: 80
    targetPort: 3001
  type: LoadBalancer
\`\`\`

## Extension Distribution

### Chrome Web Store
1. Zip the extension files
2. Upload to Chrome Web Store Developer Dashboard
3. Fill in store listing details
4. Submit for review

### Enterprise Distribution
1. Package as CRX file for managed deployment
2. Use Group Policy for enterprise Chrome browsers
3. Configure extension allowlist

## Monitoring & Maintenance

### Health Checks
- Endpoint: \`GET /health\`
- Expected Response: \`{"status": "ok"}\`

### Logs
- Production logs are structured JSON
- Monitor for error patterns
- Set up alerts for service availability

### Updates
- Update Docker image by changing version tag
- Extension updates via Chrome Web Store
- Backward compatibility maintained for API

---
For support, see README.md or contact the development team.
EOF

# Cleanup
echo "🧹 Cleaning up temporary files..."
rm -rf "${TEMP_DIR}"

echo "✅ Release packaging complete!"
echo ""
echo "📦 Release files created in '${DIST_DIR}':"
echo "   - ${EXTENSION_NAME}.zip (Chrome Extension)"
echo "   - pdf-scanner-inspection-${VERSION}.tar.gz (Docker Image)"
echo "   - RELEASE-NOTES-${VERSION}.md (Release Documentation)"
echo "   - DEPLOYMENT-GUIDE.md (Production Deployment Guide)"
echo ""
echo "🚀 Ready for distribution!" 