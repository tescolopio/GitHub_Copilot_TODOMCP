import { createLogger } from '../utils/logger';
import { ActionType } from '../models/Action';

const logger = createLogger('SafePatterns');

export interface PatternMatch {
  pattern: SafePattern;
  confidence: number;
  actionType: ActionType;
  extractedData: Record<string, string>;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface SafePattern {
  id: string;
  name: string;
  description: string;
  regex: RegExp;
  actionType: ActionType;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  autoApprove: boolean;
  extractGroups?: string[];
  contextRequirements?: {
    fileTypes?: string[];
    excludePatterns?: string[];
    maxComplexity?: number;
  };
}

// Define safe patterns for auto-approvable changes
export const SAFE_PATTERNS: SafePattern[] = [
  {
    id: 'add-comment',
    name: 'Add Comment',
    description: 'Add a comment to explain code functionality',
    regex: /TODO:?\s*add\s+comment(?:\s+(?:about|for|to\s+explain)\s+(.+?))?/i,
    actionType: ActionType.ADD_COMMENT,
    confidence: 0.9,
    riskLevel: 'low',
    autoApprove: true,
    extractGroups: ['description'],
    contextRequirements: {
      fileTypes: ['ts', 'js', 'py', 'java', 'cpp', 'c', 'h'],
    },
  },
  {
    id: 'fix-formatting',
    name: 'Fix Formatting',
    description: 'Fix code formatting and indentation',
    regex: /TODO:?\s*fix\s+formatting|TODO:?\s*format\s+(?:this|code)/i,
    actionType: ActionType.FIX_FORMATTING,
    confidence: 0.85,
    riskLevel: 'low',
    autoApprove: true,
    contextRequirements: {
      fileTypes: ['ts', 'js', 'py', 'java', 'cpp', 'c', 'h', 'css', 'scss'],
    },
  },
  {
    id: 'update-documentation',
    name: 'Update Documentation',
    description: 'Update or add documentation',
    regex: /TODO:?\s*(?:update|add|write)\s+(?:documentation|docs?)(?:\s+for\s+(.+?))?/i,
    actionType: ActionType.UPDATE_DOCUMENTATION,
    confidence: 0.8,
    riskLevel: 'low',
    autoApprove: true,
    extractGroups: ['target'],
    contextRequirements: {
      fileTypes: ['ts', 'js', 'py', 'java', 'md', 'txt'],
    },
  },
  {
    id: 'rename-variable',
    name: 'Rename Variable',
    description: 'Rename a variable to a more descriptive name',
    regex: /TODO:?\s*rename\s+(?:variable\s+)?(\w+)\s+to\s+(\w+)/i,
    actionType: ActionType.RENAME_VARIABLE,
    confidence: 0.75,
    riskLevel: 'medium',
    autoApprove: false, // Requires more careful analysis
    extractGroups: ['oldName', 'newName'],
    contextRequirements: {
      fileTypes: ['ts', 'js', 'py', 'java', 'cpp', 'c'],
      maxComplexity: 50, // Don't rename in highly complex functions
    },
  },
  {
    id: 'add-import',
    name: 'Add Import',
    description: 'Add missing import statement',
    regex: /TODO:?\s*(?:add\s+)?import\s+(.+?)(?:\s+from\s+(.+?))?/i,
    actionType: ActionType.ADD_IMPORT,
    confidence: 0.7,
    riskLevel: 'medium',
    autoApprove: false,
    extractGroups: ['module', 'source'],
    contextRequirements: {
      fileTypes: ['ts', 'js', 'py'],
    },
  },
  {
    id: 'implement-function',
    name: 'Implement Function',
    description: 'Implement a function stub',
    regex: /TODO:?\s*implement(?:\s+function)?\s+(\w+)/i,
    actionType: ActionType.IMPLEMENT_FUNCTION,
    confidence: 0.6,
    riskLevel: 'high',
    autoApprove: false,
    extractGroups: ['functionName'],
  },
];

export class SafePatternMatcher {
  private patterns: SafePattern[];

  constructor(customPatterns: SafePattern[] = []) {
    this.patterns = [...SAFE_PATTERNS, ...customPatterns];
  }

  analyzePattern(args: {
    todoContent: string;
    fileContent: string;
  }): PatternMatch[] {
    const { todoContent } = args;
    const matches: PatternMatch[] = [];

    for (const pattern of this.patterns) {
      const match = todoContent.match(pattern.regex);
      if (match) {
        const extractedData: Record<string, string> = {};
        if (pattern.extractGroups) {
          pattern.extractGroups.forEach((group, index) => {
            extractedData[group] = match[index + 1] || '';
          });
        }

        matches.push({
          pattern,
          confidence: pattern.confidence,
          actionType: pattern.actionType,
          extractedData,
          riskLevel: pattern.riskLevel,
        });
      }
    }

    return matches;
  }

  findBestMatch(args: {
    todoContent: string;
    fileContent: string;
  }): PatternMatch | null {
    const matches = this.analyzePattern(args);
    if (matches.length === 0) {
      return null;
    }
    // Simple strategy: return the match with the highest confidence
    return matches.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
  }
}
