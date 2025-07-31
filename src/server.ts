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

const logger = createLogger('MCPServer');

interface ServerState {
  configManager: ConfigManager;
  fileSystemTools: FileSystemTools;
  gitTools: GitTools;
  validationTools: ValidationTools;
  debugTools: DebugTools;
  autoContinueService?: AutoContinueService;
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
    this.state = {
      configManager: new ConfigManager(),
      fileSystemTools: new FileSystemTools(),
      gitTools: new GitTools(process.cwd()),
      validationTools: new ValidationTools(),
      debugTools: new DebugTools({ 
        replayService: null as any // Will be initialized later when AutoContinueService is created
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
        switch (name) {
          case 'listTodos':
            return await this.state.fileSystemTools.listTodos(args as {
              workspacePath: string;
              filePatterns?: string[];
            });

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

          case 'getGitStatus':
            return await this.state.gitTools.getGitStatus(args as {
              workspacePath: string;
            });

          case 'createBranch':
            return await this.state.gitTools.createBranch(args as {
              workspacePath: string;
              branchName: string;
            });

          case 'validateSyntax':
            return await this.state.validationTools.validateSyntax(args as {
              filePath: string;
              content?: string;
            });

          case 'runTests':
            return await this.state.validationTools.runTests(args as {
              workspacePath: string;
              testPattern?: string;
            });

          case 'checkBuild':
            return await this.state.validationTools.checkBuild(args as {
              workspacePath: string;
              buildCommand?: string;
            });

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
