# Development Dockerfile for PDF Scanner Inspection Service
FROM node:20-slim

# Install basic packages for development
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends curl dumb-init && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory and non-root user
WORKDIR /app
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for development)
RUN npm ci

# Copy application code
COPY . .

# Set proper ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Environment configuration
ENV NODE_ENV=development
ENV INSPECTION_PORT=3001
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check using the existing /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Use dumb-init for proper signal handling and start in development mode
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"] 