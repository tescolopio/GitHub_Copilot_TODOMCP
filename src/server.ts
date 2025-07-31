#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from './utils/logger.js';
import { ConfigManager } from './config/ConfigManager.js';
import { FileSystemTools } from './tools/FileSystemTools.js';
import { GitTools } from './tools/GitTools.js';
import { ValidationTools } from './tools/ValidationTools.js';
import { DebugTools } from './tools/DebugTools.js';
import { AutoContinueService } from './services/AutoContinueService.js';
import { getAutoContinueTools, handleAutoContinueTools } from './tools/AutoContinueTools.js';

const logger = createLogger('MCPServer');

interface ServerState {
  configManager: ConfigManager;
  fileSystemTools: FileSystemTools;
  gitTools: GitTools;
  validationTools: ValidationTools;
  debugTools: DebugTools;
  autoContinueService: AutoContinueService;
}

class MCPAutonomousDevServer {
  private server: Server;
  private state: ServerState;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-autonomous-dev',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize state
    const fileSystemTools = new FileSystemTools();
    const gitTools = new GitTools(process.cwd());
    const validationTools = new ValidationTools();
    const autoContinueService = new AutoContinueService(
      fileSystemTools,
      gitTools,
      validationTools,
      process.cwd()
    );

    this.state = {
      configManager: new ConfigManager(),
      fileSystemTools,
      gitTools,
      validationTools,
      autoContinueService,
      debugTools: new DebugTools({
        replayService: autoContinueService.getReplayService(),
      }),
    };

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        // File System Tools
        {
          name: 'listTodos',
          description: 'Scan workspace for TODO comments and extract context',
          inputSchema: {
            type: 'object',
            properties: {
              workspacePath: {
                type: 'string',
                description: 'Path to workspace to scan',
              },
              filePatterns: {
                type: 'array',
                items: { type: 'string' },
                description: 'File patterns to include (e.g., ["*.ts", "*.js"])',
                default: ['**/*.{ts,js,py,java,cpp,c,h}'],
              },
            },
            required: ['workspacePath'],
          },
        },
        {
          name: 'readFileContext',
          description: 'Get enhanced context around a specific TODO item',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file containing the TODO',
              },
              line: {
                type: 'number',
                description: 'Line number of the TODO',
              },
              contextLines: {
                type: 'number',
                description: 'Number of lines to include before and after',
                default: 10,
              },
            },
            required: ['filePath', 'line'],
          },
        },
        {
          name: 'writeFile',
          description: 'Safely write content to a file with validation and backup',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file to write',
              },
              content: {
                type: 'string',
                description: 'Content to write to the file',
              },
              createBackup: {
                type: 'boolean',
                description: 'Whether to create a backup before writing',
                default: true,
              },
            },
            required: ['filePath', 'content'],
          },
        },
        {
          name: 'renameVariable',
          description: 'Safely rename a variable using AST analysis',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file containing the variable to rename',
              },
              oldName: {
                type: 'string',
                description: 'Current name of the variable',
              },
              newName: {
                type: 'string',
                description: 'New name for the variable',
              },
              line: {
                type: 'number',
                description: 'Line number where the variable is located (optional)',
              },
            },
            required: ['filePath', 'oldName', 'newName'],
          },
        },
        {
          name: 'implementFunction',
          description: 'Generate implementations for function stubs or TODO functions',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file containing function stubs',
              },
              functionName: {
                type: 'string',
                description: 'Name of specific function to implement (optional)',
              },
              line: {
                type: 'number',
                description: 'Line number of function to implement (optional)',
              },
              strategy: {
                type: 'string',
                enum: ['conservative', 'balanced', 'creative'],
                description: 'Implementation strategy: conservative (high-confidence only), balanced (default), creative (allow experimental)',
              },
              useEnhanced: {
                type: 'boolean',
                description: 'Use enhanced function implementor with context analysis and type inference (default: true)',
              },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'removeUnusedImports',
          description: 'Remove unused import statements from TypeScript/JavaScript files',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file to analyze and clean up',
              },
              dryRun: {
                type: 'boolean',
                description: 'Preview changes without applying them (default: false)',
              },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'removeUnusedVariables',
          description: 'Remove unused variable declarations from TypeScript/JavaScript files',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file to analyze and clean up',
              },
              createBackup: {
                type: 'boolean',
                description: 'Create a backup file before making changes (default: true)',
              },
              safeOnly: {
                type: 'boolean',
                description: 'Only remove variables that are safe (local variables, not functions/classes/globals) (default: true)',
              },
            },
            required: ['filePath'],
          },
        },
        // Git Tools
        {
          name: 'getGitStatus',
          description: 'Get current Git repository status',
          inputSchema: {
            type: 'object',
            properties: {
              workspacePath: {
                type: 'string',
                description: 'Path to the Git repository',
              },
            },
            required: ['workspacePath'],
          },
        },
        {
          name: 'createBranch',
          description: 'Create a new Git branch for changes',
          inputSchema: {
            type: 'object',
            properties: {
              workspacePath: {
                type: 'string',
                description: 'Path to the Git repository',
              },
              branchName: {
                type: 'string',
                description: 'Name of the new branch',
              },
            },
            required: ['workspacePath', 'branchName'],
          },
        },
        // Validation Tools
        {
          name: 'validateSyntax',
          description: 'Check code syntax before applying changes',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file to validate',
              },
              content: {
                type: 'string',
                description: 'Content to validate (optional, will read file if not provided)',
              },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'runTests',
          description: 'Execute test suites to verify changes',
          inputSchema: {
            type: 'object',
            properties: {
              workspacePath: {
                type: 'string',
                description: 'Path to the workspace',
              },
              testPattern: {
                type: 'string',
                description: 'Test pattern to run (optional)',
              },
            },
            required: ['workspacePath'],
          },
        },
        {
          name: 'checkBuild',
          description: 'Verify project compiles and builds successfully',
          inputSchema: {
            type: 'object',
            properties: {
              workspacePath: {
                type: 'string',
                description: 'Path to the workspace',
              },
              buildCommand: {
                type: 'string',
                description: 'Custom build command (optional, will auto-detect if not provided)',
              },
            },
            required: ['workspacePath'],
          },
        },
        ...getAutoContinueTools(this.state.autoContinueService),
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error(`Missing arguments for tool: ${name}`);
      }

      try {
        const autoContinueResult = await handleAutoContinueTools(
          name,
          args,
          this.state.autoContinueService
        );
        if (autoContinueResult) {
          return {
            content: [{ type: 'text', text: JSON.stringify(autoContinueResult) }],
          };
        }

        switch (name) {
          case 'listTodos': {
            const todos = await this.state.fileSystemTools.listTodos(args as {
              workspacePath: string;
              filePatterns?: string[];
            });
            return {
              content: todos.map((todo) => ({
                type: 'text',
                text: JSON.stringify(todo, null, 2),
              })),
            };
          }

          case 'readFileContext':
            return await this.state.fileSystemTools.readFileContext(args as {
              filePath: string;
              line: number;
              contextLines?: number;
            });

          case 'writeFile':
            return await this.state.fileSystemTools.writeFile(args as {
              filePath: string;
              content: string;
              createBackup?: boolean;
            });

          case 'renameVariable':
            return await this.state.fileSystemTools.renameVariable(args as {
              filePath: string;
              oldName: string;
              newName: string;
              line?: number;
            });

          case 'implementFunction':
            return await this.state.fileSystemTools.implementFunction(args as {
              filePath: string;
              functionName?: string;
              line?: number;
              strategy?: 'conservative' | 'balanced' | 'creative';
              useEnhanced?: boolean;
            });

          case 'removeUnusedImports':
            return await this.state.fileSystemTools.removeUnusedImports(args as {
              filePath: string;
              dryRun?: boolean;
            });

          case 'removeUnusedVariables':
            return await this.state.fileSystemTools.removeUnusedVariables(args as {
              filePath: string;
              createBackup?: boolean;
              safeOnly?: boolean;
            });

          case 'getGitStatus':
            return await this.state.gitTools.getGitStatus();

          case 'createBranch':
            return await this.state.gitTools.createBranch(args as {
              workspacePath: string;
              branchName: string;
            });

          case 'validateSyntax': {
            const result = await this.state.validationTools.validateSyntax(args as {
              filePath: string;
              content?: string;
            });
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          case 'runTests': {
            const result = await this.state.validationTools.runTests(args as {
              workspacePath: string;
              testPattern?: string;
            });
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          case 'checkBuild': {
            const result = await this.state.validationTools.checkBuild(args as {
              workspacePath: string;
              buildCommand?: string;
            });
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Error executing tool ${name}:`, error);
        throw error;
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error('MCP Server error:', error);
    };

    process.on('SIGINT', async () => {
      logger.info('Shutting down MCP server...');
      await this.server.close();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    // Initialize configuration
    await this.state.configManager.load();
    logger.info('Configuration loaded');

    // Create transport and connect
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP Autonomous Development Server started');
  }
}

// Start the server
async function main(): Promise<void> {
  try {
    const server = new MCPAutonomousDevServer();
    await server.start();
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { MCPAutonomousDevServer };
