import fs from 'fs-extra';
import path from 'path';
import { createLogger } from '../utils/logger';

const logger = createLogger('ConfigManager');

export interface MCPConfig {
  server: {
    name: string;
    version: string;
    maxActionsPerSession: number;
    sessionTimeoutMinutes: number;
  };
  patterns: {
    safePatterns: string[];
    confidenceThreshold: number;
    fileExtensions: string[];
    excludePatterns: string[];
  };
  git: {
    autoCreateBranches: boolean;
    branchPrefix: string;
    autoCommit: boolean;
  };
  validation: {
    enableSyntaxCheck: boolean;
    enableTestRunner: boolean;
    testTimeout: number;
  };
  storage: {
    sessionDirectory: string;
    maxSessionAge: number;
    backupDirectory: string;
  };
}

const DEFAULT_CONFIG: MCPConfig = {
  server: {
    name: 'mcp-autonomous-dev',
    version: '1.0.0',
    maxActionsPerSession: 5,
    sessionTimeoutMinutes: 60,
  },
  patterns: {
    safePatterns: [
      'TODO:?\\s*add\\s+comment',
      'TODO:?\\s*fix\\s+formatting',
      'TODO:?\\s*update\\s+documentation',
      'TODO:?\\s*rename\\s+\\w+\\s+to\\s+\\w+',
    ],
    confidenceThreshold: 0.8,
    fileExtensions: ['ts', 'js', 'py', 'java', 'cpp', 'c', 'h', 'md'],
    excludePatterns: ['node_modules/**', 'dist/**', '*.min.js', '*.bundle.js'],
  },
  git: {
    autoCreateBranches: true,
    branchPrefix: 'mcp-auto-',
    autoCommit: false,
  },
  validation: {
    enableSyntaxCheck: true,
    enableTestRunner: true,
    testTimeout: 30000,
  },
  storage: {
    sessionDirectory: '.mcp-sessions',
    maxSessionAge: 7, // days
    backupDirectory: '.mcp-backups',
  },
};

export class ConfigManager {
  private config: MCPConfig;
  private configPath: string;

  constructor(configPath: string = 'config/mcp-config.json') {
    this.configPath = configPath;
    this.config = { ...DEFAULT_CONFIG };
  }

  async load(): Promise<void> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const fileContent = await fs.readJson(this.configPath);
        this.config = this.mergeConfig(DEFAULT_CONFIG, fileContent);
        logger.info(`Configuration loaded from ${this.configPath}`);
      } else {
        await this.save();
        logger.info(`Default configuration created at ${this.configPath}`);
      }
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      throw error;
    }
  }

  async save(): Promise<void> {
    try {
      await fs.writeJson(this.configPath, this.config, { spaces: 2 });
      logger.info(`Configuration saved to ${this.configPath}`);
    } catch (error) {
      logger.error('Failed to save configuration:', error);
      throw error;
    }
  }

  get(): MCPConfig {
    return { ...this.config };
  }

  update(updates: Partial<MCPConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
  }

  private mergeConfig(base: MCPConfig, updates: any): MCPConfig {
    const result = { ...base };
    
    for (const key in updates) {
      if (updates[key] && typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
        result[key as keyof MCPConfig] = {
          ...result[key as keyof MCPConfig],
          ...updates[key],
        } as any;
      } else {
        result[key as keyof MCPConfig] = updates[key];
      }
    }
    
    return result;
  }

  getWorkspaceConfig(workspacePath: string): MCPConfig {
    const workspaceConfigPath = path.join(workspacePath, '.mcp', 'config.json');
    
    // TODO: Implement workspace-specific configuration loading
    // For now, return the global config
    return this.get();
  }
}
