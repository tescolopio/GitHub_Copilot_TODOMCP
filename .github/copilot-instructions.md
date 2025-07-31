# GitHub Copilot Instructions

## About this Project

This project is a Model Context Protocol (MCP) server that gives GitHub Copilot the ability to autonomously manage TODOs in a codebase. It allows Copilot to discover, review, edit, complete, and create TODOs while maintaining continuous autonomous development. The server includes an innovative Auto-Continue feature that enables Copilot to automatically proceed with safe operations without manual intervention.

**Key Features:**
- Autonomous TODO discovery and completion
- Auto-Continue for streamlined workflows
- Session persistence and crash recovery
- Safety pattern matching to prevent destructive changes
- Integration with TODO Tree VS Code extension
- Docker support for containerized deployment

## Architecture Overview

The system is composed of a Node.js MCP server, a VS Code extension, and a state management layer.

### Core Components

-   **MCP Server (`src/`)**: The core of the application.
    -   `src/server.ts`: The main entry point for the MCP server. Initializes services and handles MCP protocol communication.
    -   `src/index.ts`: Application bootstrap and Docker signal handling.
    -   `src/services/`:
        -   `AutoContinueService.ts`: **CRITICAL** - The heart of autonomous functionality. Contains the main loop for TODO processing and Auto-Continue logic. Key methods:
            -   `enableAutoContinue()`: Activates automatic approval of safe operations
            -   `shouldAutoApprove()`: Determines if an action can proceed without user input
            -   `createSession()`: Initializes a new TODO work session
            -   `recoverSession()`: Restores state after crashes
        -   `TodoService.ts`: Manages TODO discovery, parsing, and state tracking
    -   `src/tools/`: MCP tools exposed to Copilot
        -   `FileSystemTools.ts`: Safe file operations (read, write, modify with validation)
        -   `GitTools.ts`: Git operations (diff, commit, branch management)
        -   `ValidationTools.ts`: Code validation and test execution
        -   `TodoTools.ts`: TODO-specific operations (list, complete, create)
        -   `AutoContinueTools.ts`: Auto-Continue control tools
    -   `src/models/`:
        -   `Todo.ts`: TODO data model with priority and status tracking
        -   `Session.ts`: Session state model for persistence
        -   `Action.ts`: Action tracking for audit trails
    -   `src/patterns/`:
        -   `SafePatterns.ts`: **SECURITY CRITICAL** - Defines allowed/blocked patterns
        -   `TodoPatterns.ts`: TODO format detection (supports multiple languages)
    -   `src/storage/`:
        -   `SessionStorage.ts`: Persistent session state management
        -   `StateManager.ts`: Shared state between server and extension
    -   `src/config/`:
        -   `ConfigManager.ts`: Configuration loading and validation
        -   `defaults.ts`: Default configuration values
    -   `src/utils/`:
        -   `logger.ts`: Winston logger configuration
        -   `validator.ts`: Input validation utilities
        -   `astParser.ts`: AST-based code analysis

-   **VS Code Extension (`vscode-extension/`)**: Integrates with VS Code and GitHub Copilot
    -   `src/extension.ts`: Extension entry point and activation
    -   `src/statusBar.ts`: Status bar indicator for Auto-Continue state
    -   `src/commands.ts`: VS Code command implementations
    -   `src/mcpClient.ts`: MCP protocol client implementation

-   **State Management (`/state/`)**: Shared state directory (Docker volume)
    -   `auto-continue.json`: Current Auto-Continue state
    -   `sessions/`: Active session data
    -   `history/`: Completed session archives

## Key Concepts & Patterns

### Tool-Based Architecture
All AI capabilities are exposed as MCP tools. When adding new functionality:

```typescript
// Example tool structure in src/tools/NewTool.ts
export const newToolDefinition = {
  name: 'toolName',
  description: 'What this tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter description' }
    },
    required: ['param1']
  },
  handler: async (args: ToolArgs) => {
    // Validate inputs
    if (!validateInput(args)) {
      throw new Error('Invalid input');
    }
    
    // Perform action with safety checks
    const result = await performSafeAction(args);
    
    // Return formatted response
    return {
      content: [{
        type: 'text',
        text: `Operation completed: ${result}`
      }]
    };
  }
};
```

### Safety Patterns
**CRITICAL**: All file operations must respect safety patterns:

```typescript
// Always check against SafePatterns before file operations
import { SafePatterns } from '../patterns/SafePatterns';

if (SafePatterns.isDangerous(operation)) {
  throw new Error('Operation blocked by safety patterns');
}

if (!SafePatterns.isAutoApprovable(operation)) {
  return { requiresApproval: true };
}
```

### Session Management
Sessions provide crash recovery and state persistence:

```typescript
// Creating a session
const session = await autoContinueService.createSession(todoId, {
  strategy: 'balanced',
  maxActions: 10
});

// Sessions are automatically persisted
// On crash, sessions can be recovered:
const recovered = await autoContinueService.recoverSession(sessionId);
```

### Auto-Continue Strategies
Three strategies control automation aggressiveness:
- `conservative`: Max 5 actions, only very safe operations
- `balanced`: Max 10 actions, standard safety checks (default)
- `aggressive`: Max 20 actions, broader auto-approval patterns

### Configuration
Server configuration via `config.json`:
```json
{
  "autoContinue": {
    "enabled": false,
    "defaultStrategy": "balanced",
    "maxConsecutiveActions": 10
  },
  "safety": {
    "allowedPatterns": ["format", "comment", "import"],
    "blockedPatterns": ["delete", "remove", "drop"],
    "requireTestsPass": true
  },
  "workspace": {
    "excludePaths": ["node_modules", ".git", "dist"]
  }
}
```

## Developer Workflow

### Initial Setup
```bash
# Clone repository
git clone https://github.com/tescolopio/GitHub_Copilot_TODOMCP.git
cd GitHub_Copilot_TODOMCP

# Install dependencies
pnpm install

# Copy configuration
cp config.example.json config.json

# Build project
pnpm build
```

### Development Mode
```bash
# Run with hot-reloading
pnpm dev

# Run tests in watch mode
pnpm test:watch

# Check TypeScript types
pnpm type-check
```

### Docker Development
```bash
# Build container
docker-compose build

# Run in development mode
docker-compose --profile dev up

# View logs
docker-compose logs -f todo-mcp
```

### Testing Guidelines

#### Unit Tests
```typescript
// tests/services/AutoContinueService.test.ts
describe('AutoContinueService', () => {
  it('should auto-approve safe operations', async () => {
    const service = new AutoContinueService(mockState, mockTodo);
    const result = await service.shouldAutoApprove({
      description: 'Format code',
      confidence: 0.9
    });
    expect(result.approve).toBe(true);
  });
});
```

#### Integration Tests
```typescript
// tests/integration/todo-workflow.test.ts
it('should complete full TODO workflow', async () => {
  // Test complete flow from discovery to completion
});
```

### Adding New Features

1. **New Tool**: Create in `src/tools/`, add to tool registry
2. **New Service**: Create in `src/services/`, inject dependencies
3. **New Pattern**: Add to `src/patterns/`, update tests
4. **Configuration**: Add to `ConfigManager`, update schema

## Common Tasks

### Adding a New TODO Pattern
```typescript
// In src/patterns/TodoPatterns.ts
export const patterns = [
  // Existing patterns...
  {
    regex: /\/\/\s*OPTIMIZE:\s*(.+)/,
    type: 'optimization',
    priority: 'medium'
  }
];
```

### Creating a Custom Safety Rule
```typescript
// In src/patterns/SafePatterns.ts
export const customRules = [
  {
    pattern: /rm\s+-rf/,
    action: 'block',
    reason: 'Dangerous recursive deletion'
  }
];
```

### Implementing a New MCP Tool
```typescript
// 1. Define in src/tools/MyTool.ts
// 2. Register in src/tools/index.ts
// 3. Add tests in tests/tools/MyTool.test.ts
// 4. Update this documentation
```

## Debugging & Troubleshooting

### Enable Debug Logging
```bash
# Set log level
export LOG_LEVEL=debug
pnpm dev
```

### Common Issues

1. **Tool not appearing in Copilot**
   - Restart VS Code
   - Check tool registration in server.ts
   - Verify JSON syntax in tool definition

2. **Auto-Continue not working**
   - Check state file permissions: `/state/auto-continue.json`
   - Verify safety patterns aren't blocking
   - Check session state in logs

3. **Session recovery failing**
   - Ensure STATE_PATH is writable
   - Check for corrupted session files
   - Verify workspace hasn't changed

### Debug Commands
```bash
# Check server health
curl http://localhost:3000/health

# View current state
cat /tmp/mcp-state/auto-continue.json

# Reset state
rm -rf /tmp/mcp-state && pnpm dev
```

## Security Considerations

1. **Never commit real `config.json`** - Use config.example.json
2. **Validate all file paths** - Prevent directory traversal
3. **Sanitize TODO content** - Prevent injection attacks
4. **Rate limit operations** - Prevent runaway automation
5. **Log all actions** - Maintain audit trail

## Git Workflow & Branching

### Branch Strategy
- `main`: Production-ready, requires 2 reviews
- `develop`: Integration branch, requires 1 review
- `feature/*`: Feature development
- `fix/*`: Bug fixes
- `chore/*`: Maintenance tasks

### Pull Request Checklist
- [ ] Tests pass (`pnpm test`)
- [ ] TypeScript compiles (`pnpm build`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Documentation updated
- [ ] Security patterns respected
- [ ] Changelog updated (if applicable)

## Performance Considerations

1. **File System Operations**: Batch operations when possible
2. **TODO Scanning**: Use incremental scanning for large codebases
3. **Session State**: Implement cleanup for old sessions
4. **Memory Management**: Monitor heap usage in long-running sessions

## VS Code Integration Tips

### Extension Commands
- `TODO MCP: Show Status` - Display Auto-Continue state
- `TODO MCP: Start Session` - Begin TODO work
- `TODO MCP: Recovery Session` - Restore crashed session

### Status Bar
- 🤖 = Auto-Continue enabled
- 🔒 = Manual mode
- 🔄 = Session active

## Future Enhancements (TODO)

- [ ] Machine learning for better TODO prioritization
- [ ] Integration with project management tools
- [ ] Multi-language TODO format support expansion
- [ ] Distributed session management for team collaboration
- [ ] Web UI for monitoring and control

## Contributing

When contributing, please:
1. Follow TypeScript best practices
2. Add comprehensive tests
3. Update relevant documentation
4. Respect safety patterns
5. Consider backward compatibility

For questions or issues, please check the [Contributing Guide](CONTRIBUTING.md) or open an issue on GitHub.