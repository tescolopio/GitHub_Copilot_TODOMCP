import fs from 'fs-extra';
import path from 'path';
import { createLogger } from '../utils/logger';
import { SessionStorage, Session } from '../storage/SessionStorage';
import { Action, ActionStatus, ActionType } from '../models/Action';
import { FileSystemTools, TodoItem } from '../tools/FileSystemTools';

const logger = createLogger('ReplayService');

export interface ReplayStep {
  stepNumber: number;
  action: Action;
  fileStateBefore: string;
  fileStateAfter?: string;
  environmentState: {
    workingDirectory: string;
    timestamp: Date;
    gitCommit?: string;
  };
  debugInfo: {
    stackTrace?: string;
    variableStates?: Record<string, any>;
    executionPath?: string[];
  };
}

export interface ReplaySession {
  sessionId: string;
  steps: ReplayStep[];
  metadata: {
    totalSteps: number;
    startTime: Date;
    endTime?: Date;
    status: 'recording' | 'completed' | 'failed';
  };
}

export interface ReplayOptions {
  includeFileStates: boolean;
  includeStackTraces: boolean;
  includeVariableStates: boolean;
  maxStepsToKeep: number;
}

/**
 * Service for recording and replaying development actions for debugging
 */
export class ReplayService {
  private sessionStorage: SessionStorage;
  private fileTools: FileSystemTools;
  private replayPath: string;
  private activeReplays: Map<string, ReplaySession>;
  private options: ReplayOptions;

  constructor(
    sessionStorage: SessionStorage,
    fileTools: FileSystemTools,
    workspacePath: string,
    options: Partial<ReplayOptions> = {}
  ) {
    this.sessionStorage = sessionStorage;
    this.fileTools = fileTools;
    this.replayPath = path.join(workspacePath, '.mcp-replays');
    this.activeReplays = new Map();
    
    this.options = {
      includeFileStates: true,
      includeStackTraces: false, // Disabled by default for performance
      includeVariableStates: false, // Disabled by default for performance  
      maxStepsToKeep: 100,
      ...options,
    };

    // Ensure replay directory exists
    fs.ensureDirSync(this.replayPath);
    logger.info('ReplayService initialized', { replayPath: this.replayPath, options: this.options });
  }

  /**
   * Start recording a replay session
   */
  async startRecording(sessionId: string): Promise<void> {
    const replaySession: ReplaySession = {
      sessionId,
      steps: [],
      metadata: {
        totalSteps: 0,
        startTime: new Date(),
        status: 'recording',
      },
    };

    this.activeReplays.set(sessionId, replaySession);
    await this.saveReplaySession(replaySession);
    logger.info(`Started recording replay for session: ${sessionId}`);
  }

  /**
   * Record an action step for replay
   */
  async recordStep(action: Action): Promise<void> {
    const replaySession = this.activeReplays.get(action.sessionId);
    if (!replaySession) {
      logger.warn(`No active replay session found for: ${action.sessionId}`);
      return;
    }

    try {
      // Capture file state before action
      const fileStateBefore = await this.captureFileState(action.filePath);
      
      // Create replay step
      const step: ReplayStep = {
        stepNumber: replaySession.steps.length + 1,
        action: { ...action }, // Deep copy to avoid mutation
        fileStateBefore,
        environmentState: {
          workingDirectory: path.dirname(action.filePath),
          timestamp: new Date(),
        },
        debugInfo: {},
      };

      // Capture stack trace if enabled
      if (this.options.includeStackTraces) {
        step.debugInfo.stackTrace = this.captureStackTrace();
      }

      replaySession.steps.push(step);
      replaySession.metadata.totalSteps++;

      // Limit the number of steps to prevent memory issues
      if (replaySession.steps.length > this.options.maxStepsToKeep) {
        replaySession.steps.shift(); // Remove oldest step
      }

      await this.saveReplaySession(replaySession);
      logger.debug(`Recorded step ${step.stepNumber} for session ${action.sessionId}`);
    } catch (error) {
      logger.error(`Failed to record step for action ${action.id}:`, error);
    }
  }

  /**
   * Update a step with post-execution state
   */
  async updateStepAfterExecution(actionId: string, sessionId: string): Promise<void> {
    const replaySession = this.activeReplays.get(sessionId);
    if (!replaySession) {
      return;
    }

    try {
      // Find the step by action ID
      const step = replaySession.steps.find(s => s.action.id === actionId);
      if (!step) {
        logger.warn(`Step not found for action: ${actionId}`);
        return;
      }

      // Capture file state after action
      if (this.options.includeFileStates) {
        step.fileStateAfter = await this.captureFileState(step.action.filePath);
      }

      await this.saveReplaySession(replaySession);
      logger.debug(`Updated post-execution state for step ${step.stepNumber}`);
    } catch (error) {
      logger.error(`Failed to update step after execution for action ${actionId}:`, error);
    }
  }

  /**
   * Stop recording and finalize the replay session
   */
  async stopRecording(sessionId: string): Promise<void> {
    const replaySession = this.activeReplays.get(sessionId);
    if (!replaySession) {
      logger.warn(`No active replay session found for: ${sessionId}`);
      return;
    }

    replaySession.metadata.endTime = new Date();
    replaySession.metadata.status = 'completed';

    await this.saveReplaySession(replaySession);
    this.activeReplays.delete(sessionId);
    
    logger.info(`Stopped recording replay for session: ${sessionId}`);
  }

  /**
   * Get replay session for debugging
   */
  async getReplaySession(sessionId: string): Promise<ReplaySession | null> {
    // Check active replays first
    const activeReplay = this.activeReplays.get(sessionId);
    if (activeReplay) {
      return activeReplay;
    }

    // Check saved replays
    const replayFile = path.join(this.replayPath, `${sessionId}.json`);
    if (await fs.pathExists(replayFile)) {
      return await fs.readJson(replayFile);
    }

    return null;
  }

  /**
   * List all available replay sessions
   */
  async listReplaySessions(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.replayPath);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (error) {
      logger.error('Failed to list replay sessions:', error);
      return [];
    }
  }

  /**
   * Replay a specific step for debugging
   */
  async debugStep(sessionId: string, stepNumber: number): Promise<{
    step: ReplayStep;
    analysis: {
      fileChanges: string[];
      actionImpact: string;
      potentialIssues: string[];
    };
  } | null> {
    const replaySession = await this.getReplaySession(sessionId);
    if (!replaySession) {
      logger.error(`Replay session not found: ${sessionId}`);
      return null;
    }

    const step = replaySession.steps.find(s => s.stepNumber === stepNumber);
    if (!step) {
      logger.error(`Step ${stepNumber} not found in session ${sessionId}`);
      return null;
    }

    // Analyze the step
    const analysis = await this.analyzeStep(step);

    return { step, analysis };
  }

  /**
   * Get step-by-step breakdown of a session
   */
  async getStepBreakdown(sessionId: string): Promise<{
    sessionInfo: ReplaySession;
    breakdown: Array<{
      stepNumber: number;
      actionType: ActionType;
      description: string;
      status: ActionStatus;
      duration: number;
      fileModified: string;
      success: boolean;
    }>;
  } | null> {
    const replaySession = await this.getReplaySession(sessionId);
    if (!replaySession) {
      return null;
    }

    const breakdown = replaySession.steps.map(step => ({
      stepNumber: step.stepNumber,
      actionType: step.action.type,
      description: step.action.description,
      status: step.action.status,
      duration: step.action.execution.duration,
      fileModified: step.action.filePath,
      success: step.action.status === ActionStatus.COMPLETED,
    }));

    return {
      sessionInfo: replaySession,
      breakdown,
    };
  }

  /**
   * Clean up old replay sessions
   */
  async cleanupOldReplays(olderThanDays: number = 7): Promise<number> {
    try {
      const files = await fs.readdir(this.replayPath);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      let cleanedCount = 0;
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.replayPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.remove(filePath);
          cleanedCount++;
          logger.debug(`Cleaned up old replay: ${file}`);
        }
      }

      logger.info(`Cleaned up ${cleanedCount} old replay sessions`);
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup old replays:', error);
      return 0;
    }
  }

  private async captureFileState(filePath: string): Promise<string> {
    try {
      if (await fs.pathExists(filePath)) {
        return await fs.readFile(filePath, 'utf8');
      }
      return '// File not found';
    } catch (error) {
      logger.warn(`Failed to capture file state for ${filePath}:`, error);
      return '// Error reading file';
    }
  }

  private captureStackTrace(): string {
    const stack = new Error().stack;
    return stack ? stack.split('\n').slice(2, 10).join('\n') : 'No stack trace available';
  }

  private async analyzeStep(step: ReplayStep): Promise<{
    fileChanges: string[];
    actionImpact: string;
    potentialIssues: string[];
  }> {
    const fileChanges: string[] = [];
    const potentialIssues: string[] = [];

    // Analyze file changes
    if (step.fileStateBefore && step.fileStateAfter) {
      const beforeLines = step.fileStateBefore.split('\n');
      const afterLines = step.fileStateAfter.split('\n');

      if (beforeLines.length !== afterLines.length) {
        fileChanges.push(`Line count changed: ${beforeLines.length} → ${afterLines.length}`);
      }

      // Simple diff analysis
      for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
        const beforeLine = beforeLines[i] || '';
        const afterLine = afterLines[i] || '';
        
        if (beforeLine !== afterLine) {
          fileChanges.push(`Line ${i + 1}: "${beforeLine}" → "${afterLine}"`);
        }
      }
    }

    // Analyze potential issues
    if (step.action.status === ActionStatus.FAILED) {
      potentialIssues.push('Action failed - check error message');
    }

    if (step.action.execution.duration > 5000) {
      potentialIssues.push('Action took longer than expected (>5s)');
    }

    if (step.action.metadata.confidence < 0.7) {
      potentialIssues.push('Low confidence action - may need review');
    }

    const actionImpact = this.describeActionImpact(step.action);

    return {
      fileChanges,
      actionImpact,
      potentialIssues,
    };
  }

  private describeActionImpact(action: Action): string {
    switch (action.type) {
      case ActionType.ADD_COMMENT:
        return 'Added documentation comment to improve code clarity';
      case ActionType.FIX_FORMATTING:
        return 'Improved code formatting and consistency';
      case ActionType.UPDATE_DOCUMENTATION:
        return 'Updated documentation to reflect current implementation';
      case ActionType.ADD_IMPORT:
        return 'Added missing import statement';
      case ActionType.IMPLEMENT_FUNCTION:
        return 'Implemented function body based on TODO requirements';
      case ActionType.RENAME_VARIABLE:
        return 'Renamed variable for better clarity';
      case ActionType.REMOVE_UNUSED_CODE:
        return 'Removed unused code to reduce clutter';
      default:
        return 'Modified code according to TODO requirements';
    }
  }

  private async saveReplaySession(replaySession: ReplaySession): Promise<void> {
    const replayFile = path.join(this.replayPath, `${replaySession.sessionId}.json`);
    await fs.writeJson(replayFile, replaySession, { spaces: 2 });
  }
}

export default ReplayService;
