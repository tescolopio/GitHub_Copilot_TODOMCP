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
    regex: /(?:TODO:?\s*)?(?:add\s+)?comment(?:\s+(?:about|for|to\s+explain|explaining)\s+(.+?))?/i,
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
    regex: /(?:TODO:?\s*)?(?:fix\s+)?formatting?(?:\s+(?:issues?|problems?|in\s+.+))?/i,
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
    regex: /(?:TODO:?\s*)?(?:update|add|write)\s+(?:documentation|docs?)(?:\s+(?:for|with|about)\s+(.+?))?/i,
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
    description: 'Rename a variable to a more descriptive name using AST analysis',
    regex: /(?:TODO:?\s*)?rename\s+(?:variable\s+)?(\w+)\s+to\s+(\w+)/i,
    actionType: ActionType.RENAME_VARIABLE,
    confidence: 0.9, // Increased confidence due to AST-based safety
    riskLevel: 'low', // Reduced risk level due to precise AST analysis
    autoApprove: true, // Now safe to auto-approve with AST parsing
    extractGroups: ['oldName', 'newName'],
    contextRequirements: {
      fileTypes: ['ts', 'js', 'tsx', 'jsx'], // Limited to files we can parse
      maxComplexity: 100, // Increased limit due to better safety
    },
  },
  {
    id: 'implement-function',
    name: 'Implement Function',
    description: 'Generate implementation for function stubs or empty functions',
    regex: /(?:TODO:?\s*)?(?:implement(?:\s+function)?|generate\s+implementation|create\s+function)\s*(?:for\s+)?(?:function\s+)?(.+?)(?:\s+function)?/i,
    actionType: ActionType.IMPLEMENT_FUNCTION,
    confidence: 0.8,
    riskLevel: 'medium',
    autoApprove: false, // Start with manual approval to verify generated code
    extractGroups: ['functionName'],
    contextRequirements: {
      fileTypes: ['ts', 'js', 'tsx', 'jsx'],
      maxComplexity: 50, // Lower limit for function implementation
    },
  },
  {
    id: 'add-import',
    name: 'Add Import',
    description: 'Add missing import statement',
    regex: /(?:TODO:?\s*)?(?:add\s+)?import(?:\s+(?:for\s+))?(.+?)(?:\s+(?:from\s+|utility))?/i,
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
    id: 'remove-unused-imports',
    name: 'Remove Unused Imports',
    description: 'Remove import statements that are not used in the file',
    regex: /(?:TODO:?\s*)?(?:remove|clean|delete|clear)\s+(?:unused\s+)?imports?/i,
    actionType: ActionType.REMOVE_UNUSED_IMPORTS,
    confidence: 0.85,
    riskLevel: 'low',
    autoApprove: true,
    contextRequirements: {
      fileTypes: ['ts', 'tsx', 'js', 'jsx'],
    },
  },
  {
    id: 'remove-unused-variables',
    name: 'Remove Unused Variables',
    description: 'Remove variable declarations that are not used in the file',
    regex: /(?:TODO:?\s*)?(?:remove|clean|delete|clear)\s+(?:unused\s+)?(?:variables?|vars?)/i,
    actionType: ActionType.REMOVE_UNUSED_VARIABLES,
    confidence: 0.8,
    riskLevel: 'low',
    autoApprove: true,
    contextRequirements: {
      fileTypes: ['ts', 'tsx', 'js', 'jsx'],
    },
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
