# Multi-stage build for optimized production image
FROM node:20-slim AS base

# Install security updates and required packages
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends dumb-init && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory and non-root user
WORKDIR /app
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Development stage
FROM base AS development
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN chown -R appuser:appuser /app
USER appuser
CMD ["npm", "run", "dev"]

# Production build stage
FROM base AS build
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:20-slim AS production

# Install security updates and dumb-init for proper signal handling
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends dumb-init && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory and non-root user
WORKDIR /app
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy production dependencies and application code
COPY --from=build /app/node_modules ./node_modules
COPY --chown=appuser:appuser package*.json ./
COPY --chown=appuser:appuser server.js ./
COPY --chown=appuser:appuser middleware/ ./middleware/
COPY --chown=appuser:appuser services/ ./services/
COPY --chown=appuser:appuser utils/ ./utils/

# Set proper permissions
RUN chown -R appuser:appuser /app && \
    chmod -R 755 /app

# Switch to non-root user
USER appuser

# Environment configuration
ENV NODE_ENV=production
ENV INSPECTION_PORT=3001
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check using the existing /health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Use dumb-init to handle signals properly and start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"] 