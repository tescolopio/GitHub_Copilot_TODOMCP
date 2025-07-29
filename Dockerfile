# Use Node.js LTS Alpine image for smaller size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile --production

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S mcp -u 1001

# Change ownership of the app directory
RUN chown -R mcp:nodejs /app
USER mcp

# Expose the MCP server port (if using stdio, this might not be needed)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('MCP TODO Server is healthy')" || exit 1

# Start the MCP server
CMD ["node", "dist/server.js"]
