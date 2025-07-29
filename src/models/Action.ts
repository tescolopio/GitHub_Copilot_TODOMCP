export interface Action {
  id: string;
  sessionId: string;
  timestamp: Date;
  type: ActionType;
  status: ActionStatus;
  description: string;
  filePath: string;
  lineNumber: number;
  todo: {
    id: string;
    filePath: string;
    line: number;
    content: string;
    confidence: number;
  };
  execution: {
    startTime: Date;
    endTime: Date;
    duration: number;
    output: string;
    error: string;
  };
  changes: {
    filePath: string;
    beforeChecksum: string;
    afterChecksum?: string;
    backupPath?: string;
  };
  metadata: {
    todoText: string;
    patternId: string;
    confidence: number;
    riskLevel: 'low' | 'medium' | 'high';
    estimatedDuration: number;
    requiresApproval: boolean;
  };
}

export enum ActionType {
  ADD_COMMENT = 'add_comment',
  FIX_FORMATTING = 'fix_formatting',
  UPDATE_DOCUMENTATION = 'update_documentation',
  RENAME_VARIABLE = 'rename_variable',
  IMPLEMENT_FUNCTION = 'implement_function',
  ADD_IMPORT = 'add_import',
  REMOVE_UNUSED_CODE = 'remove_unused_code',
}

export enum ActionStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  REQUIRES_APPROVAL = 'requires_approval',
}

export interface ActionResult {
  success: boolean;
  output: string;
  changes: {
    linesAdded: number;
    linesRemoved: number;
    filesModified: string[];
  };
}

export interface SessionMetrics {
  totalActions: number;
  completedActions: number;
  failedActions: number;
  skippedActions: number;
  averageConfidence: number;
  totalTimeSaved: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
}
