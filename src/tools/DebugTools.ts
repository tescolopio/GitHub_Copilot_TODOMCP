import { ReplayService } from '../services/ReplayService';
import { createLogger } from '../utils/logger';

const logger = createLogger('DebugTools');

export interface DebugToolsConfig {
  replayService: ReplayService;
}

/**
 * MCP tools for debugging autonomous development sessions
 */
export class DebugTools {
  private replayService: ReplayService;

  constructor(config: DebugToolsConfig) {
    this.replayService = config.replayService;
  }

  /**
   * List all available replay sessions for debugging
   */
  async listReplaySessions(): Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
  }> {
    try {
      const sessions = await this.replayService.listReplaySessions();
      
      if (sessions.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No replay sessions found. Start a development session to begin recording actions for debugging.',
          }],
        };
      }

      const sessionList = sessions.map(sessionId => `• ${sessionId}`).join('\n');
      
      return {
        content: [{
          type: 'text',
          text: `Available replay sessions for debugging:\n\n${sessionList}\n\nUse 'debug_session' to analyze a specific session.`,
        }],
      };
    } catch (error) {
      logger.error('Failed to list replay sessions:', error);
      return {
        content: [{
          type: 'text',
          text: `Error listing replay sessions: ${error instanceof Error ? error.message : String(error)}`,
        }],
      };
    }
  }

  /**
   * Get detailed breakdown of a replay session
   */
  async debugSession(args: { sessionId: string }): Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
  }> {
    try {
      const breakdown = await this.replayService.getStepBreakdown(args.sessionId);
      
      if (!breakdown) {
        return {
          content: [{
            type: 'text',
            text: `Replay session '${args.sessionId}' not found. Use 'list_replay_sessions' to see available sessions.`,
          }],
        };
      }

      const { sessionInfo, breakdown: steps } = breakdown;
      
      // Format session overview
      const overview = `
**Replay Session: ${args.sessionId}**
- Started: ${sessionInfo.metadata.startTime}
- Status: ${sessionInfo.metadata.status}
- Total Steps: ${sessionInfo.metadata.totalSteps}
${sessionInfo.metadata.endTime ? `- Ended: ${sessionInfo.metadata.endTime}` : '- Still recording'}

**Step-by-Step Breakdown:**
`;

      // Format each step
      const stepDetails = steps.map(step => {
        const statusIcon = step.success ? '✅' : '❌';
        const duration = step.duration > 0 ? `(${step.duration}ms)` : '';
        
        return `${statusIcon} **Step ${step.stepNumber}**: ${step.actionType}
   Description: ${step.description}
   File: ${step.fileModified}
   Status: ${step.status} ${duration}`;
      }).join('\n\n');

      return {
        content: [{
          type: 'text',
          text: overview + stepDetails,
        }],
      };
    } catch (error) {
      logger.error(`Failed to debug session ${args.sessionId}:`, error);
      return {
        content: [{
          type: 'text',
          text: `Error debugging session: ${error instanceof Error ? error.message : String(error)}`,
        }],
      };
    }
  }

  /**
   * Debug a specific step in detail
   */
  async debugStep(args: { sessionId: string; stepNumber: number }): Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
  }> {
    try {
      const result = await this.replayService.debugStep(args.sessionId, args.stepNumber);
      
      if (!result) {
        return {
          content: [{
            type: 'text',
            text: `Step ${args.stepNumber} not found in session '${args.sessionId}'. Check the session breakdown first.`,
          }],
        };
      }

      const { step, analysis } = result;
      
      // Format step details
      const stepInfo = `
**Debug Step ${step.stepNumber}**

**Action Details:**
- Type: ${step.action.type}
- Description: ${step.action.description}
- File: ${step.action.filePath}:${step.action.lineNumber}
- Status: ${step.action.status}
- Confidence: ${step.action.metadata.confidence}
- Risk Level: ${step.action.metadata.riskLevel}

**Execution:**
- Duration: ${step.action.execution.duration}ms
- Start: ${step.action.execution.startTime}
- End: ${step.action.execution.endTime}
${step.action.execution.error ? `- Error: ${step.action.execution.error}` : ''}

**Impact Analysis:**
${analysis.actionImpact}

**File Changes:**
${analysis.fileChanges.length > 0 ? analysis.fileChanges.map(change => `• ${change}`).join('\n') : 'No file changes detected'}

**Potential Issues:**
${analysis.potentialIssues.length > 0 ? analysis.potentialIssues.map(issue => `⚠️  ${issue}`).join('\n') : 'No issues detected'}

**Environment:**
- Working Directory: ${step.environmentState.workingDirectory}
- Timestamp: ${step.environmentState.timestamp}
${step.environmentState.gitCommit ? `- Git Commit: ${step.environmentState.gitCommit}` : ''}

**TODO Context:**
"${step.action.metadata.todoText}"
`;

      return {
        content: [{
          type: 'text',
          text: stepInfo,
        }],
      };
    } catch (error) {
      logger.error(`Failed to debug step ${args.stepNumber} in session ${args.sessionId}:`, error);
      return {
        content: [{
          type: 'text',
          text: `Error debugging step: ${error instanceof Error ? error.message : String(error)}`,
        }],
      };
    }
  }

  /**
   * Compare file states before and after an action
   */
  async compareFileStates(args: { sessionId: string; stepNumber: number }): Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
  }> {
    try {
      const result = await this.replayService.debugStep(args.sessionId, args.stepNumber);
      
      if (!result) {
        return {
          content: [{
            type: 'text',
            text: `Step ${args.stepNumber} not found in session '${args.sessionId}'.`,
          }],
        };
      }

      const { step } = result;
      
      if (!step.fileStateBefore) {
        return {
          content: [{
            type: 'text',
            text: 'File state recording is not enabled for this session.',
          }],
        };
      }

      const beforeLines = step.fileStateBefore.split('\n');
      const afterLines = step.fileStateAfter ? step.fileStateAfter.split('\n') : [];
      
      let diff = `**File Comparison for Step ${step.stepNumber}**\n`;
      diff += `File: ${step.action.filePath}\n\n`;
      
      if (!step.fileStateAfter) {
        diff += '**Before:**\n```\n' + step.fileStateBefore + '\n```\n\n';
        diff += '**After:** Not recorded (action may have failed)\n';
      } else {
        // Simple line-by-line diff
        const maxLines = Math.max(beforeLines.length, afterLines.length);
        let hasChanges = false;
        
        for (let i = 0; i < maxLines; i++) {
          const beforeLine = beforeLines[i] || '';
          const afterLine = afterLines[i] || '';
          
          if (beforeLine !== afterLine) {
            if (!hasChanges) {
              diff += '**Changes detected:**\n\n';
              hasChanges = true;
            }
            
            diff += `Line ${i + 1}:\n`;
            diff += `- Before: \`${beforeLine}\`\n`;
            diff += `- After:  \`${afterLine}\`\n\n`;
          }
        }
        
        if (!hasChanges) {
          diff += 'No changes detected between before and after states.\n';
        }
      }

      return {
        content: [{
          type: 'text',
          text: diff,
        }],
      };
    } catch (error) {
      logger.error(`Failed to compare file states for step ${args.stepNumber}:`, error);
      return {
        content: [{
          type: 'text',
          text: `Error comparing file states: ${error instanceof Error ? error.message : String(error)}`,
        }],
      };
    }
  }

  /**
   * Clean up old replay data
   */
  async cleanupReplays(args: { olderThanDays?: number } = {}): Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
  }> {
    try {
      const days = args.olderThanDays || 7;
      const cleanedCount = await this.replayService.cleanupOldReplays(days);
      
      return {
        content: [{
          type: 'text',
          text: `Cleaned up ${cleanedCount} replay sessions older than ${days} days.`,
        }],
      };
    } catch (error) {
      logger.error('Failed to cleanup replays:', error);
      return {
        content: [{
          type: 'text',
          text: `Error cleaning up replays: ${error instanceof Error ? error.message : String(error)}`,
        }],
      };
    }
  }
}

// MCP tool definitions
export const debugToolDefinitions = {
  list_replay_sessions: {
    name: 'list_replay_sessions',
    description: 'List all available replay sessions for debugging autonomous development actions',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  
  debug_session: {
    name: 'debug_session',
    description: 'Get detailed breakdown of a replay session showing all actions taken',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The ID of the session to debug',
        },
      },
      required: ['sessionId'],
    },
  },
  
  debug_step: {
    name: 'debug_step',
    description: 'Debug a specific action step in detail, showing execution context and impact',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The ID of the session containing the step',
        },
        stepNumber: {
          type: 'number',
          description: 'The step number to debug (1-based)',
        },
      },
      required: ['sessionId', 'stepNumber'],
    },
  },
  
  compare_file_states: {
    name: 'compare_file_states',
    description: 'Compare file states before and after an action to see exactly what changed',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The ID of the session containing the step',
        },
        stepNumber: {
          type: 'number',
          description: 'The step number to compare file states for',
        },
      },
      required: ['sessionId', 'stepNumber'],
    },
  },
  
  cleanup_replays: {
    name: 'cleanup_replays',
    description: 'Clean up old replay sessions to free up storage space',
    inputSchema: {
      type: 'object',
      properties: {
        olderThanDays: {
          type: 'number',
          description: 'Delete replay sessions older than this many days (default: 7)',
        },
      },
      required: [],
    },
  },
};

export default DebugTools;
