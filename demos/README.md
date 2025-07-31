# Demo Files

This directory contains demonstration files that showcase the capabilities of the MCP Autonomous Development System.

## Available Demos

### Core Demonstrations

#### `demo-showcase.js`

Main demonstration script that shows the enhanced AST-based tools in action. This script:

- Creates test files with various code patterns
- Demonstrates unused import removal
- Shows variable analysis capabilities
- Displays comprehensive statistics and progress tracking

**Usage:**

```bash
npm run build
node demos/demo-showcase.js
```

#### `demo-comprehensive.js`

Comprehensive demonstration covering multiple AST analysis capabilities including function implementation suggestions and code transformations.

### Test Files

#### `demo-unused-variables.tsx`

A React/TypeScript component file that intentionally contains unused variables, imports, and functions. This file is designed to test our AST-based cleanup tools.

#### `demo-unused-imports.ts`

TypeScript file with various unused imports to demonstrate import cleanup capabilities.

#### `demo-function-implementation.ts`

Demonstrates advanced function implementation with context analysis and type inference.

### Development Demos

#### `demo-action-replay.ts`

Demonstrates the Action Replay functionality with timeout protection for development and debugging.

#### `demo-error-context.ts`

Showcases A2 Error Context Collection feature with detailed error reporting and actionable feedback.

## Running Demos

1. **Build the project first:**

   ```bash
   npm run build
   ```

2. **Run individual demos:**

   ```bash
   node demos/demo-showcase.js
   node demos/demo-comprehensive.js
   ```

3. **Or run them through the test suite:**

   ```bash
   npm test
   ```

## What These Demos Show

- **AST-based Code Analysis**: How TypeScript's compiler API is used to analyze code structure
- **Unused Code Detection**: Identification of unused imports, variables, and functions
- **Function Implementation**: Intelligent code generation based on context analysis
- **Type Inference**: Advanced type analysis for better code suggestions
- **Integration Testing**: How different tools work together in workflows

These demos are essential for understanding the system's capabilities and for testing new features during development.
