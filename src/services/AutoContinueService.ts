import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { FileSystemTools, TodoItem } from '../tools/FileSystemTools';
import { ValidationTools } from '../tools/ValidationTools';
import { GitTools } from '../tools/GitTools';
import { SafePatternMatcher, PatternMatch, SAFE_PATTERNS } from '../patterns/SafePatterns';
import { SessionStorage, Session, SessionStatus, SessionConfig } from '../storage/SessionStorage';
import { Action, ActionType, ActionStatus, ActionResult } from '../models/Action';
import crypto from 'crypto';

const logger = createLogger('AutoContinueService');

export interface AutoContinueConfig {
  maxActionsPerSession: number;
  sessionTimeoutMinutes: number;
  safetyThreshold: number;
  enableGitIntegration: boolean;
  enableBackups: boolean;
  patterns: {
    enabled: string[];
    disabled: string[];
  };
  rateLimiting: {
    maxActionsPerMinute: number;
    cooldownSeconds: number;
  };
}

export interface AutoContinueResult {
  success: boolean;
  sessionId: string;
  actionsExecuted: number;
  message: string;
  errors?: string[];
  session?: Session;
}

export class AutoContinueService {
  private fileTools: FileSystemTools;
  private validationTools: ValidationTools;
  private gitTools: GitTools;
  private patternMatcher: SafePatternMatcher;
  private sessionStorage: SessionStorage;
  private activeSessions: Map<string, NodeJS.Timeout>;
  private config: AutoContinueConfig;

  private workspacePath: string;

  constructor(
    fileTools: FileSystemTools,
    gitTools: GitTools,
    validationTools: ValidationTools,
    workspacePath: string,
    config: Partial<AutoContinueConfig> = {}
  ) {
    this.fileTools = fileTools;
    this.validationTools = validationTools;
    this.gitTools = gitTools;
    this.workspacePath = workspacePath;
    this.patternMatcher = new SafePatternMatcher();
    this.sessionStorage = new SessionStorage(path.join(this.workspacePath, '.mcp-sessions'));
    this.activeSessions = new Map();

    this.config = {
      maxActionsPerSession: 5,
      sessionTimeoutMinutes: 60,
      safetyThreshold: 0.7,
      enableGitIntegration: true,
      enableBackups: true,
      patterns: {
        enabled: ['add-comment', 'fix-formatting', 'update-documentation', 'add-import'],
        disabled: ['rename-variable', 'implement-function'],
      },
      rateLimiting: {
        maxActionsPerMinute: 3,
        cooldownSeconds: 10,
      },
      ...config,
    };

    logger.info('AutoContinueService initialized', { config: this.config });
  }

  /**
   * Start an autonomous development session
   */
  async startSession(workspacePath?: string): Promise<AutoContinueResult> {
    try {
      logger.info('Starting autonomous development session...');

      const sessionWorkspacePath = workspacePath || this.workspacePath;

      // Create new session
      const sessionConfig: Partial<SessionConfig> = {
        maxActions: this.config.maxActionsPerSession,
        timeoutMinutes: this.config.sessionTimeoutMinutes,
        autoApproveThreshold: this.config.safetyThreshold,
        enableBackups: this.config.enableBackups,
        patterns: this.config.patterns,
      };

      const session = await this.sessionStorage.createSession(
        sessionWorkspacePath,
        sessionConfig
      );

      // Set up session timeout
      const timeoutId = setTimeout(
        () => this.timeoutSession(session.id),
        this.config.sessionTimeoutMinutes * 60 * 1000
      );
      this.activeSessions.set(session.id, timeoutId);

      // Start the autonomous loop
      const result = await this.runAutonomousLoop(session);

      return {
        success: true,
        sessionId: session.id,
        actionsExecuted: result.actionsExecuted,
        message: result.message,
        session: result.session,
      };
    } catch (error: any) {
      logger.error('Failed to start autonomous session:', error);
      return {
        success: false,
        sessionId: '',
        actionsExecuted: 0,
        message: `Failed to start session: ${error.message}`,
        errors: [error.message],
      };
    }
  }

  /**
   * Stop an active session
   */
  async stopSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.sessionStorage.getSession(sessionId);
      if (!session) {
        logger.warn(`Session ${sessionId} not found`);
        return false;
      }

      if (session.status === SessionStatus.ACTIVE) {
        session.status = SessionStatus.CANCELLED;
        await this.sessionStorage.updateSession(session);
      }

      // Clear timeout
      const timeoutId = this.activeSessions.get(sessionId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.activeSessions.delete(sessionId);
      }

      logger.info(`Stopped session ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to stop session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Get session status and metrics
   */
  async getSessionStatus(sessionId: string): Promise<Session | null> {
    return await this.sessionStorage.getSession(sessionId);
  }

  /**
   * Main autonomous development loop
   */
  private async runAutonomousLoop(session: Session): Promise<{
    actionsExecuted: number;
    message: string;
    session: Session;
  }> {
    let actionsExecuted = 0;
    const errors: string[] = [];

    logger.info(`Starting autonomous loop for session ${session.id}`);

    try {
      while (
        session.status === SessionStatus.ACTIVE &&
        actionsExecuted < this.config.maxActionsPerSession
      ) {
        // Check if session should continue
        if (!this.shouldContinueSession(session)) {
          break;
        }

        // Find TODOs in the workspace
        const todos = await this.fileTools.listTodos({ workspacePath: session.workspacePath });
        
        if (todos.length === 0) {
          logger.info('No TODOs found, ending session');
          break;
        }
        
        logger.info(`Found ${todos.length} TODOs to analyze`);

        // Process each TODO
        let actionTaken = false;
        for (const todo of todos) {
          if (actionsExecuted >= this.config.maxActionsPerSession) {
            break;
          }

          try {
            const action = await this.processTodo(todo, session);
            if (action) {
              await this.sessionStorage.addAction(session.id, action);
              actionsExecuted++;
              actionTaken = true;

              // Rate limiting
              if (this.config.rateLimiting.cooldownSeconds > 0) {
                await this.sleep(this.config.rateLimiting.cooldownSeconds * 1000);
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to process TODO: ${todo.content}`, error);
            errors.push(`TODO processing error: ${message}`);
          }
        }

        // If no actions were taken in this iteration, break to avoid infinite loop
        if (!actionTaken) {
          logger.info('No actionable TODOs found, ending session');
          break;
        }

        // Refresh session data
        const updatedSession = await this.sessionStorage.getSession(session.id);
        if (updatedSession) {
          session = updatedSession;
        } else {
          // Session was deleted or is otherwise unavailable
          logger.warn(`Session ${session.id} could not be refreshed. Ending loop.`);
          break;
        }
      }

      // Complete the session
      if (session.status === SessionStatus.ACTIVE) {
        await this.sessionStorage.completeSession(session.id);
      }
      
      const finalSession = await this.sessionStorage.getSession(session.id);
      if (finalSession) {
        session = finalSession;
      }

      const message = actionsExecuted > 0
        ? `Completed ${actionsExecuted} autonomous actions successfully`
        : 'No actionable TODOs found';

      logger.info(`Session ${session.id} completed: ${message}`);

      return {
       actionsExecuted,
        message,
        session,
      };
    } catch (error: any) {
      logger.error(`Autonomous loop failed for session ${session.id}:`, error);
      session.status = SessionStatus.FAILED;
      await this.sessionStorage.updateSession(session);
      
      throw error;
    }
  }

  /**
   * Process a single TODO item
   */
  private async processTodo(todo: TodoItem, session: Session): Promise<Action | null> {
    try {
      logger.debug(`Processing TODO: ${todo.content}`);

      // Get file context around the TODO
      const fileContext = await this.fileTools.readFileContext({
        filePath: todo.filePath,
        line: todo.line,
        contextLines: 5,
      });

      // Analyze the TODO with pattern matching
      const matches = await this.patternMatcher.analyzePattern({
        todoContent: todo.content,
        fileContent: fileContext.content.map(c => c.text).join('\\n'),
      });

      // Find the best match
      const bestMatch = this.selectBestMatch(matches);
      if (!bestMatch || bestMatch.confidence < this.config.safetyThreshold) {
        logger.debug(`TODO doesn't meet safety threshold: ${todo.content}`);
        return null;
      }

      // Check if pattern is enabled
      if (!this.config.patterns.enabled.includes(bestMatch.pattern.id)) {
        logger.debug(`Pattern ${bestMatch.pattern.id} is disabled`);
        return null;
      }

      // Create action
      const action: Action = {
        id: uuidv4(),
        sessionId: session.id,
        type: bestMatch.actionType,
        status: ActionStatus.PENDING,
        description: `Apply ${bestMatch.pattern.name} to: ${todo.content}`,
        filePath: todo.filePath,
        lineNumber: todo.line,
        timestamp: new Date(),
        metadata: {
          todoText: todo.content,
          patternId: bestMatch.pattern.id,
          confidence: bestMatch.confidence,
          riskLevel: bestMatch.riskLevel,
          estimatedDuration: 1000, // Placeholder
          requiresApproval: bestMatch.confidence < session.config.autoApproveThreshold,
        },
        execution: {
          startTime: new Date(0),
          endTime: new Date(0),
          duration: 0,
          output: '',
          error: '',
        },
        changes: {
          filePath: todo.filePath,
          beforeChecksum: '',
        },
        todo, // Store the original TODO item for context
      };

      // Execute the action if confidence is high enough
      if (bestMatch.confidence >= session.config.autoApproveThreshold) {
        await this.executeAction(action, bestMatch, todo);
      } else {
        action.status = ActionStatus.REQUIRES_APPROVAL;
        logger.info(`Action requires approval (confidence: ${bestMatch.confidence}): ${action.description}`);
      }

      return action;
    } catch (error: any) {
      logger.error(`Failed to process TODO: ${todo.content}`, error);
      return null;
    }
  }

  /**
   * Execute an autonomous action
   */
  private async executeAction(action: Action, match: PatternMatch, todo: TodoItem): Promise<void> {
    action.status = ActionStatus.EXECUTING;
    action.execution.startTime = new Date();

    try {
      logger.info(`Executing action: ${action.description}`);

      // Create backup if enabled
      if (this.config.enableBackups) {
        await this.createBackup(action.filePath);
      }

      // Execute based on action type
      let result: ActionResult;
      switch (action.type) {
        case ActionType.ADD_COMMENT:
          result = await this.executeAddComment(action, match, todo);
          break;
        case ActionType.FIX_FORMATTING:
          result = await this.executeFixFormatting(action, match);
          break;
        case ActionType.UPDATE_DOCUMENTATION:
          result = await this.executeUpdateDocumentation(action, match);
          break;
        case ActionType.ADD_IMPORT:
          result = await this.executeAddImport(action, match);
          break;
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      // Update action with results
      action.execution.output = result.output;
      action.execution.endTime = new Date();
      action.execution.duration = action.execution.endTime.getTime() - (action.execution.startTime?.getTime() || 0);

      // Validate the changes
      const validationResult = await this.validationTools.validateSyntax({ filePath: action.filePath });
      if (!validationResult.isValid) {
        throw new Error(`Validation failed: ${validationResult.errors?.map(e => e.message).join(', ')}`);
      }

      // Commit changes if Git integration is enabled
      if (this.config.enableGitIntegration) {
        await this.commitAction(action);
      }

      logger.info(`Action completed successfully: ${action.description}`);
    } catch (error: any) {
      action.status = ActionStatus.FAILED;
      action.execution.error = error.message;
      action.execution.endTime = new Date();
      
      logger.error(`Action failed: ${action.description}`, error);
      
      // Restore backup if available
      if (this.config.enableBackups) {
        await this.restoreBackup(action.filePath);
      }
      
      throw error;
    }
  }

  /**
   * Execute add comment action
   */
  private async executeAddComment(action: Action, match: PatternMatch, todo: TodoItem): Promise<ActionResult> {
    const comment = match.extractedData.description || `// ${todo.content}`;
    const content = await fs.readFile(action.filePath, 'utf8');
    const lines = content.split('\n');
    
    // Insert comment above the TODO line
    lines.splice(action.lineNumber - 1, 0, comment);
    
    const newContent = lines.join('\n');
    await fs.writeFile(action.filePath, newContent);
    
    return {
      success: true,
      output: `Added comment: ${comment}`,
      changes: {
        linesAdded: 1,
        linesRemoved: 0,
        filesModified: [action.filePath],
      },
    };
  }

  /**
   * Execute fix formatting action
   */
  private async executeFixFormatting(action: Action, match: PatternMatch): Promise<ActionResult> {
    // Simple formatting fixes - could be expanded
    const content = await fs.readFile(action.filePath, 'utf8');
    let newContent = content;
    
    // Fix common formatting issues
    newContent = newContent.replace(/\s+$/gm, ''); // Remove trailing whitespace
    newContent = newContent.replace(/\n{3,}/g, '\n\n'); // Limit consecutive newlines
    
    if (content !== newContent) {
      await fs.writeFile(action.filePath, newContent);
      return {
        success: true,
        output: 'Fixed formatting issues',
        changes: {
          linesAdded: 0,
          linesRemoved: 0,
          filesModified: [action.filePath],
        },
      };
    }
    
    return {
      success: true,
      output: 'No formatting issues found',
      changes: {
        linesAdded: 0,
        linesRemoved: 0,
        filesModified: [],
      },
    };
  }

  /**
   * Execute update documentation action
   */
  private async executeUpdateDocumentation(action: Action, match: PatternMatch): Promise<ActionResult> {
    const suggestion = match.extractedData.target || 
      `Documentation updated for: ${action.metadata.todoText}`;
    
    // This is a placeholder. In a real scenario, you would apply the change.
    // For now, we just log the suggestion.
    logger.info(`Suggested documentation update: ${suggestion}`);
    
    return {
      success: true,
      output: suggestion,
      changes: {
        linesAdded: 0,
        linesRemoved: 0,
        filesModified: [],
      },
    };
  }

  /**
   * Execute add import action
   */
  private async executeAddImport(action: Action, match: PatternMatch): Promise<ActionResult> {
    const importStatement = `import ${match.extractedData.module} from '${match.extractedData.source}';`;
    if (!match.extractedData.module) {
      throw new Error('No import module provided');
    }
    
    const content = await fs.readFile(action.filePath, 'utf8');
    const lines = content.split('\n');
    
    // Find the right place to insert the import (after other imports)
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && (line.trim().startsWith('import ') || line.trim().startsWith('const '))) {
        insertIndex = i + 1;
      } else if (line && line.trim() !== '' && insertIndex > 0) {
        break;
      }
    }
    
    lines.splice(insertIndex, 0, importStatement);
    
    const newContent = lines.join('\n');
    await fs.writeFile(action.filePath, newContent);
    
    return {
      success: true,
      output: `Added import: ${importStatement}`,
      changes: {
        linesAdded: 1,
        linesRemoved: 0,
        filesModified: [action.filePath],
      },
    };
  }

  private selectBestMatch(matches: PatternMatch[]): PatternMatch | null {
    if (matches.length === 0) return null;
    
    return matches.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }

  private mapPatternToActionType(patternId: string): ActionType {
    const pattern = SAFE_PATTERNS.find(p => p.id === patternId);
    return pattern ? pattern.actionType : ActionType.ADD_COMMENT;
  }

  private shouldContinueSession(session: Session): boolean {
    return session.status === SessionStatus.ACTIVE &&
           session.metrics.totalActions < this.config.maxActionsPerSession;
  }

  private async createBackup(filePath: string): Promise<void> {
    const backupDir = path.join(this.workspacePath, '.mcp-backups');
    await fs.ensureDir(backupDir);
    const backupPath = path.join(backupDir, `${path.basename(filePath)}.${Date.now()}.bak`);
    await fs.copy(filePath, backupPath);
    logger.debug(`Created backup: ${backupPath}`);
  }

  private async restoreBackup(filePath: string): Promise<void> {
    const backupDir = path.join(this.workspacePath, '.mcp-backups');
    const filename = path.basename(filePath);
    
    if (!(await fs.pathExists(backupDir))) {
      logger.warn(`Backup directory not found: ${backupDir}`);
      return;
    }

    const files = await fs.readdir(backupDir);
    
    const backups = files
      .filter(f => f.startsWith(`${filename}.`) && f.endsWith('.bak'))
      .sort()
      .reverse();
    
    if (backups.length > 0) {
      const backupFile = backups[0];
      if (backupFile) {
        const backupPath = path.join(backupDir, backupFile);
        await fs.copy(backupPath, filePath);
        logger.info(`Restored backup: ${backupPath}`);
        await fs.remove(backupPath); // Clean up used backup
      }
    }
  }

  private async commitAction(action: Action): Promise<void> {
    try {
      const commitMessage = `[MCP Auto] ${action.description}`;
      await this.gitTools.commitChanges({
        workspacePath: this.workspacePath,
        files: [action.filePath],
        message: commitMessage,
      });
      logger.debug(`Committed action: ${action.id}`);
    } catch (error: any) {
      logger.warn(`Failed to commit action ${action.id}:`, error);
      // Don't fail the action if Git commit fails
    }
  }

  private async timeoutSession(sessionId: string): Promise<void> {
    logger.warn(`Session ${sessionId} timed out`);
    await this.stopSession(sessionId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default AutoContinueService;
