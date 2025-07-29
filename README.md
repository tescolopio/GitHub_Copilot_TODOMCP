# MCP TODO Management System

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

### Installation

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

### Running the MCP Server

To start the server, run the following command:

```bash
pnpm start
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
- `plan.txt`: The high-level plan and ideas for the project.
- `jest.config.js`: Configuration for Jest.
- `tsconfig.json`: TypeScript configuration.
- `package.json`: Project metadata and dependencies.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## 📜 License

This project is licensed under the MIT License.
