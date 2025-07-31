# Configuration

This directory contains configuration files for the MCP Autonomous Development System.

## Files

### `config.example.json`

Template configuration file for the MCP server. Copy this to `config.json` in your workspace and customize as needed.

**Usage:**

```bash
cp config/config.example.json config.json
# Edit config.json with your preferences
```

### `vscode-mcp-client.json`

Template configuration for VS Code MCP client integration. This shows how to configure VS Code to connect to the MCP server.

**Usage:**

Add this configuration to your VS Code settings or MCP client configuration:

```json
{
  "mcpServers": {
    "autonomous-dev": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "/path/to/your/mcp-autonomous-dev",
      "env": {
        "WORKSPACE_PATH": "/path/to/your/workspace",
        "CONFIG_PATH": "./config.json",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Configuration Options

See the example config file for detailed documentation of all available options including:

- Server settings (max actions, timeouts)
- Safe patterns and confidence thresholds
- File extensions and exclude patterns
- Git integration settings
- Validation and testing options
- Storage and backup configurations
