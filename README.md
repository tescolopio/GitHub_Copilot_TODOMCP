# GitHub Copilot MCP Auto-Continue System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Security: Responsible Disclosure](https://img.shields.io/badge/Security-Responsible%20Disclosure-green.svg)](./docs/SECURITY.md)
[![Node.js Version](https://img.shields.io/node/v/mcp-todo-management.svg)](https://nodejs.org)

An MCP (Model Context Protocol) server that provides GitHub Copilot in VS Code with autonomous "auto-continue" capabilities. This system enables Copilot to automatically discover and process `TODO` comments in your codebase. As long as there are actionable `TODO` items, the service will work on them, effectively allowing GitHub Copilot to continue generating solutions without direct user interaction.

This project is inspired by the work of [PawiX25/copilot-auto-continue](https://github.com/PawiX25/copilot-auto-continue) and aims to create a more robust, integrated, and safe version of that concept using the MCP standard.

## 🌟 Features

### Core Autonomous Development

- **Autonomous TODO Processing**: Automatically finds and processes `TODO` comments in your codebase.
- **Continuous Operation**: The system runs in a loop, addressing `TODO`s as long as they are available, simulating a user repeatedly clicking "Continue" in a controlled manner.
- **GitHub Copilot & VS Code Integration**: Designed to work with GitHub Copilot in VS Code for a seamless AI-powered development experience.

### Advanced AST-Based Code Analysis

- **Enhanced Function Implementation**: Context-aware function implementation with type inference and template-based generation
- **Unused Code Detection**: Intelligent removal of unused imports and variables using TypeScript compiler API
- **Smart Code Transformations**: AST-based code analysis for safe and accurate code modifications
- **Multi-Language Support**: TypeScript, JavaScript, React (TSX/JSX) with proper scope analysis

### Safety & Intelligence

- **Safe Pattern Matching**: Uses a configurable set of safe patterns to decide which `TODO`s can be handled automatically.
- **Context Analysis**: Understands class context, imports, exports, and surrounding code patterns
- **Confidence Scoring**: AI-powered confidence assessment for automatic vs. manual approval
- **Backup & Recovery**: Automatic backup creation before any code modifications

### Development Tools

- **Session Management & Replay**: Maintains session state and records actions for debugging and replay, allowing for recovery and analysis.
- **Core Toolset**: Provides MCP tools for file system operations, Git version control, and code validation to ensure changes are safe and correct.
- **Comprehensive Testing**: Full integration test suite with 23+ tests covering all AST-based tools
- **Demo System**: Interactive demonstrations showcasing all capabilities

### Configuration & Extensibility

- **Configurable & Extensible**: Behavior can be customized via configuration files, and new patterns can be added.
- **Template System**: Six different implementation patterns (Getter, Setter, Validator, Calculator, Processor, Generic)
- **Comprehensive Logging**: Detailed logging using Winston for tracking progress and debugging.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18.0.0 or higher)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [Docker](https://docker.com/) (optional, for containerized deployment)

### Installation

#### Option 1: Local Installation

1. **Clone the repository:**

    ```bash
    git clone https://github.com/tescolopio/GitHub_Copilot_TODOMCP.git
    cd GitHub_Copilot_TODOMCP
    ```

2. **Install dependencies:**

    ```bash
    npm install
    ```

3. **Build the project:**

    ```bash
        npm run build
    ```

## 📁 Project Structure

```text
├── src/                           # Source code
│   ├── config/                    # Configuration management
│   ├── models/                    # Data models and types
│   ├── patterns/                  # Safe pattern definitions
│   ├── services/                  # Core business logic
│   ├── storage/                   # Session and data storage
│   ├── tools/                     # MCP tools (FileSystem, Git, AST, etc.)
│   └── utils/                     # Utility functions and AST parsers
├── tests/                         # Test suite
│   ├── integration/               # Integration tests for AST tools
│   └── [unit tests]              # Unit tests for individual components
├── demos/                         # Demo files and examples
│   ├── demo-showcase.js          # Main comprehensive demo
│   ├── demo-comprehensive.js     # Advanced capabilities demo
│   └── [other demos]             # Various test and demo files
├── config/                        # Configuration files
│   ├── config.example.json       # Example configuration
│   ├── mcp-config.json           # MCP server configuration
│   └── vscode-mcp-client.json    # VS Code client configuration
├── docs/                          # Documentation
├── vscode-extension/              # VS Code extension code
└── sample-workspace/              # Test workspace for development
```

### Running the MCP Server

#### Local Development

```bash
# Start in development mode with hot reload
npm run dev

# Or start in production mode
npm start
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
    ```

#### Option 2: Docker Installation

1. **Clone the repository:**

    ```bash
    git clone https://github.com/tescolopio/GitHub_Copilot_TODOMCP.git
    cd GitHub_Copilot_TODOMCP
    ```

2. **Build and run with Docker:**

    ```bash
    docker-compose up -d
    ```

### Running the MCP Server

#### Local Development

```bash
# Start in development mode with hot reload
npm run dev

# Or start in production mode
npm start
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
npm test
```

### Demo System

To see the enhanced AST-based tools in action:

```bash
# Build the project first
npm run build

# Run the main demonstration
node demos/demo-showcase.js

# Run the comprehensive demo
node demos/demo-comprehensive.js
```

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
3. Review the safety patterns in `config/config.example.json`
4. Keep the server updated
5. Report security issues privately (see SECURITY.md)

### Workspace Isolation

```bash
# Recommended: Use specific project directories
WORKSPACE_PATH=/home/user/projects/current-project

# NOT recommended: Full home directory access
WORKSPACE_PATH=/home/user
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## 📜 License

This project is licensed under the MIT License.
