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
import { FatalError, RecoverableError, ValidationError, FileSystemError, GitError } from '../models/errors';
import { ReplayService } from './ReplayService';
import { ErrorContextService } from './ErrorContextService';
import { withTimeout, TimeoutError } from '../utils/timeout';

const logger = createLogger('AutoContinueService');

export interface AutoContinueConfig {
  maxActionsPerSession: number;
  sessionTimeoutMinutes: number;
  safetyThreshold: number;
  enableGitIntegration: boolean;
  enableBackups: boolean;
  enableReplay: boolean; // Add replay recording option
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
  errorReport?: string; // Add error report to results
}

export class AutoContinueService {
  private fileTools: FileSystemTools;
  private validationTools: ValidationTools;
  private gitTools: GitTools;
  private patternMatcher: SafePatternMatcher;
  private sessionStorage: SessionStorage;
  private replayService: ReplayService; // Add replay service
  private errorContext: ErrorContextService; // Add error context service
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
      enableReplay: true, // Enable replay recording by default
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

    // Initialize error context service
    this.errorContext = new ErrorContextService();

    // Initialize replay service
    this.replayService = new ReplayService(
      this.sessionStorage,
      this.fileTools,
      this.workspacePath,
      {
        includeFileStates: true,
        includeStackTraces: false, // Keep disabled for performance
        includeVariableStates: false,
        maxStepsToKeep: 50,
      }
    );

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

      // Generate error report
      const errorReport = this.errorContext.generateErrorReport(session.id);

      return {
        success: true,
        sessionId: session.id,
        actionsExecuted: result.actionsExecuted,
        message: result.message,
        session: result.session,
        errorReport,
      };
    } catch (error: any) {
      logger.error('Failed to start autonomous session:', error);
      
      // Record the session startup failure
      if (error instanceof Error) {
        this.errorContext.recordError({
          sessionId: 'session-startup-failed',
          errorType: 'FATAL',
          error,
          context: {
            operation: 'session_startup',
          },
        });
      }
      
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
   * Get the replay service for debugging
   */
  getReplayService(): ReplayService {
    return this.replayService;
  }

  /**
   * Get the error context service for debugging and reporting
   */
  getErrorContextService(): ErrorContextService {
    return this.errorContext;
  }

  /**
   * Main autonomous development loop with timeout and recovery mechanisms
   */
  private async runAutonomousLoop(session: Session): Promise<{
    actionsExecuted: number;
    message: string;
    session: Session;
  }> {
    let actionsExecuted = 0;
    const errors: string[] = [];
    const maxRetries = 3;
    let consecutiveFailures = 0;

    logger.info(`Starting autonomous loop for session ${session.id}`);

    // Start replay recording if enabled
    if (this.config.enableReplay) {
      await this.replayService.startRecording(session.id);
    }

    try {
      while (
        session.status === SessionStatus.ACTIVE &&
        actionsExecuted < this.config.maxActionsPerSession &&
        consecutiveFailures < maxRetries
      ) {
        // Check if session should continue
        if (!this.shouldContinueSession(session)) {
          break;
        }

        try {
          // Add timeout for TODO listing to prevent hanging
          const todoPromise = this.fileTools.listTodos({ workspacePath: session.workspacePath });
          const todos = await withTimeout(
            todoPromise,
            30000,
            new TimeoutError('TODO listing timed out after 30 seconds')
          );
          
          if (todos.length === 0) {
            logger.info('No TODOs found, ending session');
            break;
          }
          
          logger.info(`Found ${todos.length} TODOs to analyze`);
          consecutiveFailures = 0; // Reset failure counter on success

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
              
              if (error instanceof FatalError) {
                throw error; // Propagate fatal errors to stop the loop
              }
              // Continue processing other TODOs for non-fatal errors
            }
          }

          // If no actions were taken in this iteration, break to avoid infinite loop
          if (!actionTaken) {
            logger.info('No actionable TODOs found, ending session');
            break;
          }

        } catch (error: any) {
          consecutiveFailures++;
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Iteration failed (attempt ${consecutiveFailures}/${maxRetries}): ${message}`, error);
          errors.push(`Iteration ${consecutiveFailures} failed: ${message}`);
          
          // Record recoverable error with retry context
          this.errorContext.recordError({
            sessionId: session.id,
            errorType: 'RECOVERABLE',
            error: message,
            context: {
              operation: 'autonomous_iteration',
              attemptNumber: consecutiveFailures,
              maxRetries,
            },
          });
          
          if (consecutiveFailures >= maxRetries) {
            logger.error(`Max retries (${maxRetries}) exceeded, stopping session`);
            
            // Record fatal error when max retries exceeded
            this.errorContext.recordError({
              sessionId: session.id,
              errorType: 'FATAL',
              error: `Session failed after ${maxRetries} consecutive failures. Last error: ${message}`,
              context: {
                operation: 'max_retries_exceeded',
                attemptNumber: consecutiveFailures,
                maxRetries,
              },
            });
            
            throw new FatalError(`Session failed after ${maxRetries} consecutive failures. Last error: ${message}`);
          }
          
          // Wait before retrying
          logger.info(`Waiting 5 seconds before retry ${consecutiveFailures + 1}/${maxRetries}...`);
          await this.sleep(5000);
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

      // Clear the session timeout as the loop is concluding
      const sessionTimeoutHandle = this.activeSessions.get(session.id);
      if (sessionTimeoutHandle) {
        clearTimeout(sessionTimeoutHandle);
        this.activeSessions.delete(session.id);
      }

      // Complete the session
      if (session.status === SessionStatus.ACTIVE) {
        await this.sessionStorage.completeSession(session.id);
      }
      
      // Stop replay recording if enabled
      if (this.config.enableReplay) {
        await this.replayService.stopRecording(session.id);
      }
      
      const finalSession = await this.sessionStorage.getSession(session.id);
      if (finalSession) {
        session = finalSession;
      }

      const message = actionsExecuted > 0
        ? `Completed ${actionsExecuted} autonomous actions successfully`
        : 'No actionable TODOs found';

      const finalMessage = errors.length > 0 
        ? `${message} (${errors.length} non-fatal errors encountered)`
        : message;

      logger.info(`Session ${session.id} completed: ${finalMessage}`);
      if (errors.length > 0) {
        logger.info(`Errors encountered: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
      }

      return {
       actionsExecuted,
        message: finalMessage,
        session,
      };
    } catch (error: any) {
      logger.error(`Autonomous loop failed for session ${session.id}:`, error);
      session.status = SessionStatus.FAILED;
      await this.sessionStorage.updateSession(session);
      
      // Stop replay recording on failure
      if (this.config.enableReplay) {
        await this.replayService.stopRecording(session.id);
      }
      
      // Clear session timeout on failure
      const sessionTimeoutHandle = this.activeSessions.get(session.id);
      if (sessionTimeoutHandle) {
        clearTimeout(sessionTimeoutHandle);
        this.activeSessions.delete(session.id);
      }
      
      throw new FatalError(`Autonomous loop failed for session ${session.id}: ${error.message}`);
    }
  }

  /**
   * Process a single TODO item with timeout protection
   */
  private async processTodo(todo: TodoItem, session: Session): Promise<Action | null> {
    try {
      logger.debug(`Processing TODO: ${todo.content}`);

      // Add timeout for file context reading to prevent hanging
      const contextPromise = this.fileTools.readFileContext({
        filePath: todo.filePath,
        line: todo.line,
        contextLines: 5,
      });
      const fileContext = await withTimeout(
        contextPromise,
        10000,
        new TimeoutError('File context reading timed out after 10 seconds')
      );

      // Add timeout for pattern analysis
      const analysisPromise = Promise.resolve(this.patternMatcher.analyzePattern({
        todoContent: todo.content,
        fileContent: fileContext.content.map(c => c.text).join('\\n'),
      }));
      const matches = await withTimeout(
        analysisPromise,
        5000,
        new TimeoutError('Pattern analysis timed out after 5 seconds')
      );

      // Find the best match
      const bestMatch = this.selectBestMatch(matches);
      if (!bestMatch) {
        // Record pattern match failure
        this.errorContext.recordPatternMatchFailure({
          sessionId: session.id,
          todoContent: todo.content,
          fileName: todo.filePath,
          lineNumber: todo.line,
          availablePatterns: this.config.patterns.enabled,
        });
        
        logger.debug(`No pattern matches found for TODO: ${todo.content}`);
        return null;
      }
      
      if (bestMatch.confidence < this.config.safetyThreshold) {
        // Record safety threshold rejection
        this.errorContext.recordSafetyRejection({
          sessionId: session.id,
          todoContent: todo.content,
          fileName: todo.filePath,
          lineNumber: todo.line,
          confidence: bestMatch.confidence,
          safetyThreshold: this.config.safetyThreshold,
          patternId: bestMatch.pattern.id,
        });
        
        logger.debug(`TODO doesn't meet safety threshold: ${todo.content} (confidence: ${bestMatch.confidence}, threshold: ${this.config.safetyThreshold})`);
        return null;
      }

      // Check if pattern is enabled
      if (!this.config.patterns.enabled.includes(bestMatch.pattern.id)) {
        // Record pattern disabled error
        this.errorContext.recordError({
          sessionId: session.id,
          errorType: 'SAFETY',
          error: `Pattern ${bestMatch.pattern.id} is disabled in configuration`,
          context: {
            operation: 'pattern_check',
            fileName: todo.filePath,
            lineNumber: todo.line,
            todoContent: todo.content,
            patternId: bestMatch.pattern.id,
          },
        });
        
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
        // Record action start for replay if enabled
        if (this.config.enableReplay) {
          await this.replayService.recordStep(action);
        }
        
        // Add timeout for action execution
        const executePromise = this.executeAction(action, bestMatch, todo);
        await withTimeout(
          executePromise,
          30000,
          new TimeoutError('Action execution timed out after 30 seconds')
        );
        
        // Update replay with post-execution state if enabled
        if (this.config.enableReplay) {
          await this.replayService.updateStepAfterExecution(action.id, action.sessionId);
        }
      } else {
        action.status = ActionStatus.REQUIRES_APPROVAL;
        logger.info(`Action requires approval (confidence: ${bestMatch.confidence}): ${action.description}`);
        
        // Still record the action for replay analysis
        if (this.config.enableReplay) {
          await this.replayService.recordStep(action);
        }
      }

      return action;
    } catch (error: any) {
      logger.error(`Failed to process TODO: ${todo.content}`, error);
      
      // Record the processing error with appropriate type
      const errorType = error instanceof RecoverableError ? 'RECOVERABLE' :
                       error instanceof ValidationError ? 'VALIDATION' :
                       error instanceof Error && error.message.includes('timed out') ? 'TIMEOUT' :
                       'FATAL';
      
      this.errorContext.recordError({
        sessionId: session.id,
        errorType,
        error,
        context: {
          operation: 'todo_processing',
          fileName: todo.filePath,
          lineNumber: todo.line,
          todoContent: todo.content,
        },
        ...(error instanceof Error && { originalError: error }),
      });
      
      // Decide whether to re-throw or handle gracefully
      if (error instanceof RecoverableError) {
        // Log and continue to the next TODO
        return null;
      }
      // For other errors, it might be better to let the loop handle it
      throw error;
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
          throw new FatalError(`Unsupported action type: ${action.type}`);
      }

      // Update action with results
      action.execution.output = result.output;
      action.execution.endTime = new Date();
      action.execution.duration = action.execution.endTime.getTime() - (action.execution.startTime?.getTime() || 0);

      // Validate the changes
      const validationResult = await this.validationTools.validateSyntax({ filePath: action.filePath });
      if (!validationResult.isValid) {
        const validationError = `Validation failed: ${validationResult.errors?.map(e => e.message).join(', ')}`;
        
        // Record validation error
        this.errorContext.recordError({
          sessionId: action.sessionId,
          actionId: action.id,
          errorType: 'VALIDATION',
          error: validationError,
          context: {
            operation: 'post_action_validation',
            fileName: action.filePath,
            lineNumber: action.lineNumber,
          },
        });
        
        throw new ValidationError(validationError);
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
      
      // Record action execution error
      const errorType = error instanceof ValidationError ? 'VALIDATION' :
                       error instanceof FileSystemError ? 'FATAL' :
                       error instanceof GitError ? 'RECOVERABLE' :
                       'FATAL';
      
      this.errorContext.recordError({
        sessionId: action.sessionId,
        actionId: action.id,
        errorType,
        error,
        context: {
          operation: 'action_execution',
          fileName: action.filePath,
          lineNumber: action.lineNumber,
        },
        ...(error instanceof Error && { originalError: error }),
      });
      
      // Restore backup if available
      if (this.config.enableBackups) {
        await this.restoreBackup(action.filePath);
      }
      
      throw new RecoverableError(`Action failed: ${action.description}, error: ${error.message}`);
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
      throw new FileSystemError('No import module provided', action.filePath);
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
      .filter((f: string) => f.startsWith(`${filename}.`) && f.endsWith('.bak'))
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
      throw new GitError(`Failed to commit changes for action ${action.id}: ${error.message}`);
    }
  }

  private async timeoutSession(sessionId: string): Promise<void> {
    logger.warn(`Session ${sessionId} timed out`);
    
    // Record timeout error
    this.errorContext.recordError({
      sessionId,
      errorType: 'TIMEOUT',
      error: `Session timed out after ${this.config.sessionTimeoutMinutes} minutes`,
      context: {
        operation: 'session_timeout',
      },
    });
    
    await this.stopSession(sessionId);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, timeoutError = new Error('Operation timed out')): Promise<T> {
    let timeout: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(timeoutError), ms);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeout);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default AutoContinueService;
