#!/bin/bash

# MCP TODO Management Server Startup Script

set -e

echo "🚀 Starting MCP TODO Management Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Build if dist folder doesn't exist
if [ ! -d "dist" ]; then
    echo "🏗️  Building project..."
    pnpm build
fi

# Set default environment variables
export NODE_ENV=${NODE_ENV:-production}
export WORKSPACE_PATH=${WORKSPACE_PATH:-$(pwd)/workspace}
export CONFIG_PATH=${CONFIG_PATH:-$(pwd)/config/config.json}
export LOG_LEVEL=${LOG_LEVEL:-info}

# Create necessary directories
mkdir -p logs
mkdir -p workspace
mkdir -p config

# Create default config if it doesn't exist
if [ ! -f "$CONFIG_PATH" ]; then
    echo "⚙️  Creating default configuration..."
    cat > "$CONFIG_PATH" << 'EOF'
{
  "maxActionsPerSession": 5,
  "sessionTimeoutMinutes": 60,
  "safetyThreshold": 0.7,
  "enableGitIntegration": true,
  "enableBackups": true,
  "patterns": {
    "enabled": ["add-comment", "fix-formatting", "update-documentation", "add-import"],
    "disabled": ["rename-variable", "implement-function"]
  },
  "rateLimiting": {
    "maxActionsPerMinute": 3,
    "cooldownPeriodSeconds": 10
  }
}
EOF
fi

echo "✅ Configuration complete!"
echo "🏠 Workspace: $WORKSPACE_PATH"
echo "⚙️  Config: $CONFIG_PATH"
echo "📊 Log Level: $LOG_LEVEL"
echo ""
echo "🎯 Starting MCP TODO Management Server..."

# Start the server
exec node dist/server.js
