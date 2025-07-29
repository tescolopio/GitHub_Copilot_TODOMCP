# GitHub Copilot MCP TODO Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Security: Responsible Disclosure](https://img.shields.io/badge/Security-Responsible%20Disclosure-green.svg)](./SECURITY.md)
[![Node.js Version](https://img.shields.io/node/v/mcp-todo-management.svg)](https://nodejs.org)

An MCP (Model Context Protocol) server that provides GitHub Copilot in VS Code with autonomous TODO management capabilities. This system enables Copilot to automatically discover, review, edit, complete, and create TODOs in your codebase, maintaining continuous autonomous development while incomplete TODOs exist.

This project is inspired by the work of [PawiX25/copilot-auto-continue](https://github.com/PawiX25/copilot-auto-continue).

## 🌟 Features

- **TODO Discovery & Management**: Automatically finds and manages TODO comments in your codebase and integrates with TODO extensions
- **Autonomous Continuation**: Continuously works on incomplete TODOs until all are resolved or marked as complete
- **GitHub Copilot Integration**: Specifically designed to work with GitHub Copilot in VS Code for seamless AI-powered development
- **Session Management**: Maintains session state, allowing for recovery from crashes and long-running TODO completion sessions
- **Safety and Validation**: Includes safety pattern matching and validation tools to ensure code changes are safe and correct
- **Tool-Based Architecture**: Provides MCP tools for file system operations, git operations, and code validation
- **VS Code Extension**: Deep integration with Visual Studio Code for a seamless user experience
- **Extensible Pattern Matching**: Smart pattern recognition for different types of TODOs and appropriate completion strategies
- **Configuration Management**: Easily configurable through a `config.json` file to customize TODO handling behavior
- **Comprehensive Logging**: Detailed logging using Winston for tracking TODO completion progress and debugging

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18.0.0 or higher)
- [pnpm](https://pnpm.io/) (or your favorite package manager)
- [Docker](https://docker.com/) (optional, for containerized deployment)

### Installation

#### Option 1: Local Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/tescolopio/GitHub_Copilot_TODOMCP.git
    cd GitHub_Copilot_TODOMCP
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Build the project:**
    ```bash
    pnpm build
    ```

#### Option 2: Docker Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/tescolopio/GitHub_Copilot_TODOMCP.git
    cd GitHub_Copilot_TODOMCP
    ```

2.  **Build and run with Docker:**
    ```bash
    docker-compose up -d
    ```

### Running the MCP Server

#### Local Development

```bash
# Start in development mode with hot reload
pnpm dev

# Or start in production mode
pnpm start
```

#### Using the Startup Script

```bash
# Make the script executable (Unix/Linux/macOS)
chmod +x start.sh

# Run the startup script
./start.sh
```

#### Docker Deployment

```bash
# Production deployment
docker-compose up -d

# Development mode
docker-compose --profile dev up
```

### Configuring MCP Clients

To use this server with MCP clients (like VS Code with GitHub Copilot), add the following to your MCP client configuration:

```json
{
  "mcpServers": {
    "todo-management": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "/path/to/GitHub_Copilot_TODOMCP",
      "env": {
        "WORKSPACE_PATH": "/path/to/your/workspace",
        "CONFIG_PATH": "/path/to/config/config.json"
      }
    }
  }
}
```

### Running Tests

To ensure everything is working correctly, you can run the test suite:

```bash
pnpm test
```

## 🛠️ Project Structure

- `src/`: The main source code for the MCP server.
  - `services/`: Core services like `AutoContinueService` for TODO management automation.
  - `tools/`: Tools for file system operations, git operations, and validation of TODO completions.
  - `models/`: Data models for TODO actions, sessions, and completion tracking.
  - `patterns/`: The pattern matching engine for identifying TODO types and completion strategies.
  - `storage/`: Session and configuration storage for persistent TODO management.
  - `utils/`: Utility functions like the logger for tracking TODO completion progress.
- `vscode-extension/`: Source code for the VS Code extension that integrates with GitHub Copilot.
- `tests/`: Jest tests for the project.
- `Dockerfile`: Container configuration for Docker deployment.
- `docker-compose.yml`: Multi-container orchestration for development and production.
- `start.sh`: Startup script for easy server deployment.
- `mcp-server-config.json`: Example MCP client configuration.
- `plan.txt`: The high-level plan and ideas for the project.
- `jest.config.js`: Configuration for Jest.
- `tsconfig.json`: TypeScript configuration.
- `package.json`: Project metadata and dependencies.

## 🐳 Deployment Options

### Docker Container

The MCP server is designed to run as a containerized service:

```bash
# Build the container
docker build -t mcp-todo-management .

# Run the container
docker run -d \
  -p 3000:3000 \
  -v /path/to/workspace:/app/workspace \
  -v /path/to/config:/app/config \
  --name mcp-todo-server \
  mcp-todo-management
```

### Kubernetes Deployment

For production Kubernetes deployments, see the `k8s/` directory for example manifests.

### Standalone Binary

The server can also be packaged as a standalone executable using tools like `pkg` or similar.

## 🔐 Security

### Important Security Considerations

- **Local Use Only**: This server is designed for local development and should NOT be exposed to the internet
- **File System Access**: The server has read/write access to your configured workspace
- **No Authentication**: This server relies on the MCP client for security
- **Configuration**: Never commit real configuration files or credentials

### Best Practices

1. Use Docker for isolation
2. Configure minimal workspace paths
3. Review the safety patterns in `config.example.json`
4. Keep the server updated
5. Report security issues privately (see SECURITY.md)

### Workspace Isolation

```bash
# Recommended: Use specific project directories
WORKSPACE_PATH=/home/user/projects/current-project

# NOT recommended: Full home directory access
WORKSPACE_PATH=/home/user

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## 📜 License

This project is licensed under the MIT License.
```
