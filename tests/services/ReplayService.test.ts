import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { ReplayService } from '../../src/services/ReplayService';
import { SessionStorage } from '../../src/storage/SessionStorage';
import { FileSystemTools } from '../../src/tools/FileSystemTools';
import { Action, ActionType, ActionStatus } from '../../src/models/Action';

describe('ReplayService', () => {
  let replayService: ReplayService;
  let sessionStorage: SessionStorage;
  let fileTools: FileSystemTools;
  let tempDir: string;
  let workspacePath: string;

  beforeEach(async () => {
    // Create temporary workspace
    tempDir = path.join(__dirname, '..', 'temp', `test-${Date.now()}`);
    workspacePath = path.join(tempDir, 'workspace');
    await fs.ensureDir(workspacePath);

    // Initialize services
    sessionStorage = new SessionStorage(path.join(workspacePath, '.mcp-sessions'));
    fileTools = new FileSystemTools();
    replayService = new ReplayService(sessionStorage, fileTools, workspacePath, {
      includeFileStates: true,
      includeStackTraces: false,
      includeVariableStates: false,
      maxStepsToKeep: 10,
    });
  });

  afterEach(async () => {
    // Clean up
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('Recording and Replay', () => {
    it('should record action steps for replay', async () => {
      const sessionId = 'test-session-1';
      
      // Start recording
      await replayService.startRecording(sessionId);

      // Create a test file
      const testFile = path.join(workspacePath, 'test.ts');
      await fs.writeFile(testFile, '// TODO: Add function implementation\nfunction test() {\n  // empty\n}');

      // Create test action
      const action: Action = {
        id: 'action-1',
        sessionId,
        type: ActionType.ADD_COMMENT,
        status: ActionStatus.EXECUTING,
        description: 'Add TODO comment',
        filePath: testFile,
        lineNumber: 1,
        timestamp: new Date(),
        metadata: {
          todoText: 'TODO: Add function implementation',
          patternId: 'add-comment',
          confidence: 0.9,
          riskLevel: 'low',
          estimatedDuration: 1000,
          requiresApproval: false,
        },
        execution: {
          startTime: new Date(),
          endTime: new Date(),
          duration: 500,
          output: 'Comment added successfully',
          error: '',
        },
        changes: {
          filePath: testFile,
          beforeChecksum: 'abc123',
          afterChecksum: 'def456',
        },
        todo: {
          id: 'todo-1',
          filePath: testFile,
          line: 1,
          content: 'TODO: Add function implementation',
          confidence: 0.9,
        },
      };

      // Record the action
      await replayService.recordStep(action);

      // Simulate file change
      await fs.writeFile(testFile, '// TODO: Add function implementation\n// Added implementation comment\nfunction test() {\n  console.log("implemented");\n}');

      // Update step with post-execution state
      await replayService.updateStepAfterExecution(action.id, sessionId);

      // Stop recording
      await replayService.stopRecording(sessionId);

      // Verify replay session was created
      const replaySession = await replayService.getReplaySession(sessionId);
      expect(replaySession).toBeTruthy();
      expect(replaySession!.steps).toHaveLength(1);
      expect(replaySession!.steps[0].action.id).toBe('action-1');
      expect(replaySession!.steps[0].fileStateBefore).toContain('TODO: Add function implementation');
      expect(replaySession!.steps[0].fileStateAfter).toContain('Added implementation comment');
    });

    it('should provide detailed step debugging', async () => {
      const sessionId = 'test-session-2';
      
      // Start recording
      await replayService.startRecording(sessionId);

      // Create test action with potential issues
      const action: Action = {
        id: 'action-2',
        sessionId,
        type: ActionType.IMPLEMENT_FUNCTION,
        status: ActionStatus.FAILED,
        description: 'Implement function with error',
        filePath: path.join(workspacePath, 'error-test.ts'),
        lineNumber: 5,
        timestamp: new Date(),
        metadata: {
          todoText: 'TODO: Implement this function',
          patternId: 'implement-function',
          confidence: 0.5, // Low confidence
          riskLevel: 'high',
          estimatedDuration: 8000, // Long duration
          requiresApproval: true,
        },
        execution: {
          startTime: new Date(),
          endTime: new Date(),
          duration: 8500, // Took longer than expected
          output: '',
          error: 'Syntax error in implementation',
        },
        changes: {
          filePath: path.join(workspacePath, 'error-test.ts'),
          beforeChecksum: 'before123',
        },
        todo: {
          id: 'todo-2',
          filePath: path.join(workspacePath, 'error-test.ts'),
          line: 5,
          content: 'TODO: Implement this function',
          confidence: 0.5,
        },
      };

      // Create test file
      await fs.writeFile(action.filePath, 'function incomplete() {\n  // TODO: Implement this function\n}');

      // Record the action
      await replayService.recordStep(action);

      // Debug the step
      const debugResult = await replayService.debugStep(sessionId, 1);
      expect(debugResult).toBeTruthy();
      expect(debugResult!.analysis.potentialIssues).toContain('Action failed - check error message');
      expect(debugResult!.analysis.potentialIssues).toContain('Action took longer than expected (>5s)');
      expect(debugResult!.analysis.potentialIssues).toContain('Low confidence action - may need review');
    });

    it('should provide session breakdown', async () => {
      const sessionId = 'test-session-3';
      
      await replayService.startRecording(sessionId);

      // Record multiple actions
      const actions = [
        { type: ActionType.ADD_COMMENT, status: ActionStatus.COMPLETED, description: 'Add comment' },
        { type: ActionType.FIX_FORMATTING, status: ActionStatus.COMPLETED, description: 'Fix formatting' },
        { type: ActionType.IMPLEMENT_FUNCTION, status: ActionStatus.FAILED, description: 'Implement function' },
      ];

      for (let i = 0; i < actions.length; i++) {
        const action: Action = {
          id: `action-${i + 1}`,
          sessionId,
          type: actions[i].type,
          status: actions[i].status,
          description: actions[i].description,
          filePath: path.join(workspacePath, `test-${i}.ts`),
          lineNumber: 1,
          timestamp: new Date(),
          metadata: {
            todoText: `TODO: ${actions[i].description}`,
            patternId: 'test-pattern',
            confidence: 0.8,
            riskLevel: 'low',
            estimatedDuration: 1000,
            requiresApproval: false,
          },
          execution: {
            startTime: new Date(),
            endTime: new Date(),
            duration: 1000,
            output: actions[i].status === ActionStatus.COMPLETED ? 'Success' : '',
            error: actions[i].status === ActionStatus.FAILED ? 'Test error' : '',
          },
          changes: {
            filePath: path.join(workspacePath, `test-${i}.ts`),
            beforeChecksum: `before-${i}`,
          },
          todo: {
            id: `todo-${i + 1}`,
            filePath: path.join(workspacePath, `test-${i}.ts`),
            line: 1,
            content: `TODO: ${actions[i].description}`,
            confidence: 0.8,
          },
        };

        await replayService.recordStep(action);
      }

      await replayService.stopRecording(sessionId);

      // Get breakdown
      const breakdown = await replayService.getStepBreakdown(sessionId);
      expect(breakdown).toBeTruthy();
      expect(breakdown!.breakdown).toHaveLength(3);
      expect(breakdown!.breakdown[0].success).toBe(true);
      expect(breakdown!.breakdown[1].success).toBe(true);
      expect(breakdown!.breakdown[2].success).toBe(false);
    });

    it('should cleanup old replay sessions', async () => {
      // Create some test replay sessions
      const oldSessionId = 'old-session';
      const newSessionId = 'new-session';

      await replayService.startRecording(oldSessionId);
      await replayService.stopRecording(oldSessionId);
      
      await replayService.startRecording(newSessionId);
      await replayService.stopRecording(newSessionId);

      // Verify sessions exist
      let sessions = await replayService.listReplaySessions();
      expect(sessions).toContain(oldSessionId);
      expect(sessions).toContain(newSessionId);

      // Simulate old session by modifying file timestamp
      const oldReplayFile = path.join(workspacePath, '.mcp-replays', `${oldSessionId}.json`);
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago
      await fs.utimes(oldReplayFile, oldDate, oldDate);

      // Cleanup sessions older than 7 days
      const cleanedCount = await replayService.cleanupOldReplays(7);
      expect(cleanedCount).toBe(1);

      // Verify only new session remains
      sessions = await replayService.listReplaySessions();
      expect(sessions).not.toContain(oldSessionId);
      expect(sessions).toContain(newSessionId);
    });
  });

  describe('List Operations', () => {
    it('should list replay sessions', async () => {
      // Initially no sessions
      let sessions = await replayService.listReplaySessions();
      expect(sessions).toHaveLength(0);

      // Create some sessions
      await replayService.startRecording('session-1');
      await replayService.stopRecording('session-1');
      
      await replayService.startRecording('session-2');
      await replayService.stopRecording('session-2');

      // Should list sessions
      sessions = await replayService.listReplaySessions();
      expect(sessions).toHaveLength(2);
      expect(sessions).toContain('session-1');
      expect(sessions).toContain('session-2');
    });
  });
});
