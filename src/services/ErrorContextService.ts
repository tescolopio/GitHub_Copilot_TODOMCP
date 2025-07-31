import { createLogger } from '../utils/logger';
import { Action, ActionStatus } from '../models/Action';

const logger = createLogger('ErrorContext');

export interface ErrorContext {
  id: string;
  timestamp: Date;
  sessionId: string;
  actionId?: string | undefined;
  errorType: 'FATAL' | 'RECOVERABLE' | 'VALIDATION' | 'SAFETY' | 'TIMEOUT' | 'PATTERN_MATCH';
  errorMessage: string;
  originalError?: Error | undefined;
  stackTrace?: string | undefined;
  context: {
    operation: string;
    fileName?: string | undefined;
    lineNumber?: number | undefined;
    todoContent?: string | undefined;
    confidence?: number | undefined;
    safetyThreshold?: number | undefined;
    patternId?: string | undefined;
    attemptNumber?: number | undefined;
    maxRetries?: number | undefined;
  };
  suggestions: string[];
  userFriendlyMessage: string;
  actionable: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface ErrorSummary {
  sessionId: string;
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  criticalErrors: ErrorContext[];
  suggestions: string[];
  userActions: string[];
}

/**
 * Service for collecting, analyzing, and reporting error context with actionable suggestions
 */
export class ErrorContextService {
  private errors: Map<string, ErrorContext[]> = new Map();
  private errorSequence = 0;

  /**
   * Record an error with full context and generate actionable suggestions
   */
  recordError(params: {
    sessionId: string;
    actionId?: string;
    errorType: ErrorContext['errorType'];
    error: Error | string;
    context: Partial<ErrorContext['context']>;
    originalError?: Error;
  }): ErrorContext {
    const errorId = `error-${Date.now()}-${++this.errorSequence}`;
    const errorMessage = params.error instanceof Error ? params.error.message : params.error;
    const originalError = params.error instanceof Error ? params.error : params.originalError;

    // Generate stack trace if available
    const stackTrace = originalError?.stack || new Error().stack;

    // Analyze the error and generate suggestions
    const analysis = this.analyzeError(params.errorType, errorMessage, params.context);

    const errorContext: ErrorContext = {
      id: errorId,
      timestamp: new Date(),
      sessionId: params.sessionId,
      actionId: params.actionId,
      errorType: params.errorType,
      errorMessage,
      originalError,
      stackTrace,
      context: {
        operation: 'unknown',
        ...params.context,
      },
      suggestions: analysis.suggestions,
      userFriendlyMessage: analysis.userFriendlyMessage,
      actionable: analysis.actionable,
      severity: analysis.severity,
    };

    // Store the error
    if (!this.errors.has(params.sessionId)) {
      this.errors.set(params.sessionId, []);
    }
    this.errors.get(params.sessionId)!.push(errorContext);

    // Log with appropriate level
    this.logError(errorContext);

    return errorContext;
  }

  /**
   * Record a safety threshold rejection with detailed context
   */
  recordSafetyRejection(params: {
    sessionId: string;
    todoContent: string;
    fileName: string;
    lineNumber: number;
    confidence: number;
    safetyThreshold: number;
    patternId?: string;
  }): ErrorContext {
    return this.recordError({
      sessionId: params.sessionId,
      errorType: 'SAFETY',
      error: `TODO rejected due to low confidence: ${params.confidence} < ${params.safetyThreshold}`,
      context: {
        operation: 'safety_check',
        fileName: params.fileName,
        lineNumber: params.lineNumber,
        todoContent: params.todoContent,
        confidence: params.confidence,
        safetyThreshold: params.safetyThreshold,
        patternId: params.patternId || undefined,
      },
    });
  }

  /**
   * Record a pattern matching failure
   */
  recordPatternMatchFailure(params: {
    sessionId: string;
    todoContent: string;
    fileName: string;
    lineNumber: number;
    availablePatterns: string[];
  }): ErrorContext {
    return this.recordError({
      sessionId: params.sessionId,
      errorType: 'PATTERN_MATCH',
      error: `No matching patterns found for TODO: "${params.todoContent}"`,
      context: {
        operation: 'pattern_matching',
        fileName: params.fileName,
        lineNumber: params.lineNumber,
        todoContent: params.todoContent,
      },
    });
  }

  /**
   * Get error summary for a session
   */
  getSessionErrorSummary(sessionId: string): ErrorSummary {
    const sessionErrors = this.errors.get(sessionId) || [];
    
    const errorsByType: Record<string, number> = {};
    const errorsBySeverity: Record<string, number> = {};
    const criticalErrors: ErrorContext[] = [];
    const allSuggestions = new Set<string>();
    const userActions = new Set<string>();

    for (const error of sessionErrors) {
      // Count by type
      errorsByType[error.errorType] = (errorsByType[error.errorType] || 0) + 1;
      
      // Count by severity
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
      
      // Collect critical errors
      if (error.severity === 'CRITICAL') {
        criticalErrors.push(error);
      }
      
      // Collect unique suggestions
      error.suggestions.forEach(suggestion => allSuggestions.add(suggestion));
      
      // Generate user actions
      if (error.actionable) {
        userActions.add(this.generateUserAction(error));
      }
    }

    return {
      sessionId,
      totalErrors: sessionErrors.length,
      errorsByType,
      errorsBySeverity,
      criticalErrors,
      suggestions: Array.from(allSuggestions),
      userActions: Array.from(userActions),
    };
  }

  /**
   * Get all errors for a session
   */
  getSessionErrors(sessionId: string): ErrorContext[] {
    return this.errors.get(sessionId) || [];
  }

  /**
   * Clear errors for a session
   */
  clearSessionErrors(sessionId: string): void {
    this.errors.delete(sessionId);
  }

  /**
   * Generate a user-friendly error report
   */
  generateErrorReport(sessionId: string): string {
    const summary = this.getSessionErrorSummary(sessionId);
    const errors = this.getSessionErrors(sessionId);
    
    if (summary.totalErrors === 0) {
      return `✅ No errors recorded for session ${sessionId}`;
    }

    let report = `📋 Error Report for Session: ${sessionId}\n`;
    report += `${'='.repeat(50)}\n\n`;
    
    // Summary
    report += `📊 Summary:\n`;
    report += `   Total Errors: ${summary.totalErrors}\n`;
    report += `   Critical: ${summary.errorsBySeverity.CRITICAL || 0}\n`;
    report += `   High: ${summary.errorsBySeverity.HIGH || 0}\n`;
    report += `   Medium: ${summary.errorsBySeverity.MEDIUM || 0}\n`;
    report += `   Low: ${summary.errorsBySeverity.LOW || 0}\n\n`;

    // Error breakdown by type
    report += `🔍 Error Types:\n`;
    Object.entries(summary.errorsByType).forEach(([type, count]) => {
      report += `   ${type}: ${count}\n`;
    });
    report += '\n';

    // Critical errors
    if (summary.criticalErrors.length > 0) {
      report += `🚨 Critical Errors:\n`;
      summary.criticalErrors.forEach((error, index) => {
        report += `   ${index + 1}. ${error.userFriendlyMessage}\n`;
        report += `      Context: ${error.context.operation} in ${error.context.fileName}:${error.context.lineNumber}\n`;
      });
      report += '\n';
    }

    // Top suggestions
    if (summary.suggestions.length > 0) {
      report += `💡 Suggestions:\n`;
      summary.suggestions.slice(0, 5).forEach((suggestion, index) => {
        report += `   ${index + 1}. ${suggestion}\n`;
      });
      report += '\n';
    }

    // User actions
    if (summary.userActions.length > 0) {
      report += `🎯 Recommended Actions:\n`;
      summary.userActions.slice(0, 3).forEach((action, index) => {
        report += `   ${index + 1}. ${action}\n`;
      });
    }

    return report;
  }

  private analyzeError(
    errorType: ErrorContext['errorType'],
    errorMessage: string,
    context: Partial<ErrorContext['context']>
  ): {
    suggestions: string[];
    userFriendlyMessage: string;
    actionable: boolean;
    severity: ErrorContext['severity'];
  } {
    switch (errorType) {
      case 'SAFETY':
        return this.analyzeSafetyError(errorMessage, context);
      case 'PATTERN_MATCH':
        return this.analyzePatternMatchError(errorMessage, context);
      case 'TIMEOUT':
        return this.analyzeTimeoutError(errorMessage, context);
      case 'VALIDATION':
        return this.analyzeValidationError(errorMessage, context);
      case 'FATAL':
        return this.analyzeFatalError(errorMessage, context);
      case 'RECOVERABLE':
        return this.analyzeRecoverableError(errorMessage, context);
      default:
        return {
          suggestions: ['Review the error details and try again'],
          userFriendlyMessage: `An unexpected error occurred: ${errorMessage}`,
          actionable: false,
          severity: 'MEDIUM',
        };
    }
  }

  private analyzeSafetyError(errorMessage: string, context: Partial<ErrorContext['context']>) {
    const confidence = context.confidence || 0;
    const threshold = context.safetyThreshold || 0.7;
    const todoContent = context.todoContent || 'unknown TODO';

    const suggestions: string[] = [];
    let userFriendlyMessage = '';
    let severity: ErrorContext['severity'] = 'LOW';

    if (confidence < 0.3) {
      severity = 'HIGH';
      userFriendlyMessage = `The TODO "${todoContent}" has very low confidence (${confidence}). The system cannot safely determine how to handle it.`;
      suggestions.push('Rewrite the TODO with more specific instructions');
      suggestions.push('Use standard TODO formats like "TODO: Add error handling for X"');
      suggestions.push('Consider breaking complex TODOs into smaller, clearer tasks');
    } else if (confidence < threshold) {
      severity = 'MEDIUM';
      userFriendlyMessage = `The TODO "${todoContent}" has moderate confidence (${confidence}) but is below the safety threshold (${threshold}).`;
      suggestions.push(`Lower the safety threshold to ${confidence - 0.1} to allow this action`);
      suggestions.push('Make the TODO more specific to increase confidence');
      suggestions.push('Review the TODO to ensure it matches supported patterns');
    } else {
      severity = 'LOW';
      userFriendlyMessage = `Safety check prevented action on TODO "${todoContent}".`;
      suggestions.push('Review the safety configuration');
    }

    return {
      suggestions,
      userFriendlyMessage,
      actionable: true,
      severity,
    };
  }

  private analyzePatternMatchError(errorMessage: string, context: Partial<ErrorContext['context']>): {
    suggestions: string[];
    userFriendlyMessage: string;
    actionable: boolean;
    severity: ErrorContext['severity'];
  } {
    const todoContent = context.todoContent || 'unknown TODO';
    
    return {
      suggestions: [
        'Use standard TODO formats: "TODO: Add comment", "TODO: Fix formatting", "TODO: Add import"',
        'Check that your TODO matches one of the supported patterns',
        'Consider adding custom patterns for your specific use case',
        'Ensure the TODO is clear and specific about what needs to be done',
      ],
      userFriendlyMessage: `No action pattern found for TODO "${todoContent}". The system doesn't know how to handle this type of request.`,
      actionable: true,
      severity: 'MEDIUM',
    };
  }

  private analyzeTimeoutError(errorMessage: string, context: Partial<ErrorContext['context']>): {
    suggestions: string[];
    userFriendlyMessage: string;
    actionable: boolean;
    severity: ErrorContext['severity'];
  } {
    return {
      suggestions: [
        'Check network connectivity if the operation involves external resources',
        'Reduce the complexity of the operation',
        'Increase timeout limits in configuration if appropriate',
        'Check for file locks or permission issues',
      ],
      userFriendlyMessage: `Operation timed out: ${errorMessage}. This might indicate a performance issue or external dependency problem.`,
      actionable: true,
      severity: 'HIGH',
    };
  }

  private analyzeValidationError(errorMessage: string, context: Partial<ErrorContext['context']>): {
    suggestions: string[];
    userFriendlyMessage: string;
    actionable: boolean;
    severity: ErrorContext['severity'];
  } {
    return {
      suggestions: [
        'Check the syntax of the generated code',
        'Ensure all required imports are present',
        'Verify that the file structure is correct',
        'Review the validation rules and ensure they are appropriate',
      ],
      userFriendlyMessage: `Code validation failed: ${errorMessage}. The generated code has syntax or structural issues.`,
      actionable: true,
      severity: 'HIGH',
    };
  }

  private analyzeFatalError(errorMessage: string, context: Partial<ErrorContext['context']>): {
    suggestions: string[];
    userFriendlyMessage: string;
    actionable: boolean;
    severity: ErrorContext['severity'];
  } {
    return {
      suggestions: [
        'Check the system logs for more details',
        'Verify all dependencies are installed correctly',
        'Ensure the workspace has proper permissions',
        'Contact support if the issue persists',
      ],
      userFriendlyMessage: `A critical error occurred that stopped the session: ${errorMessage}`,
      actionable: true,
      severity: 'CRITICAL',
    };
  }

  private analyzeRecoverableError(errorMessage: string, context: Partial<ErrorContext['context']>): {
    suggestions: string[];
    userFriendlyMessage: string;
    actionable: boolean;
    severity: ErrorContext['severity'];
  } {
    const attemptNumber = context.attemptNumber || 1;
    const maxRetries = context.maxRetries || 3;
    
    return {
      suggestions: [
        `Automatic retry ${attemptNumber}/${maxRetries} will be attempted`,
        'Check if the issue is transient (network, file locks, etc.)',
        'Review the error details for specific guidance',
      ],
      userFriendlyMessage: `Recoverable error (attempt ${attemptNumber}/${maxRetries}): ${errorMessage}`,
      actionable: attemptNumber >= maxRetries,
      severity: attemptNumber >= maxRetries ? 'HIGH' : 'LOW',
    };
  }

  private generateUserAction(error: ErrorContext): string {
    switch (error.errorType) {
      case 'SAFETY':
        if (error.context.confidence && error.context.confidence < 0.3) {
          return `Rewrite TODO in ${error.context.fileName}:${error.context.lineNumber} to be more specific`;
        }
        return `Consider lowering safety threshold or improving TODO clarity`;
      
      case 'PATTERN_MATCH':
        return `Update TODO format in ${error.context.fileName}:${error.context.lineNumber} to match supported patterns`;
      
      case 'TIMEOUT':
        return `Investigate performance issues with ${error.context.operation}`;
      
      case 'VALIDATION':
        return `Fix syntax errors in generated code for ${error.context.fileName}`;
      
      case 'FATAL':
        return `Review system configuration and dependencies`;
      
      default:
        return `Review error details and take appropriate action`;
    }
  }

  private logError(errorContext: ErrorContext): void {
    const logMessage = `[${errorContext.errorType}] ${errorContext.userFriendlyMessage}`;
    const logData = {
      errorId: errorContext.id,
      sessionId: errorContext.sessionId,
      actionId: errorContext.actionId,
      context: errorContext.context,
      suggestions: errorContext.suggestions.slice(0, 2), // Limit suggestions in log
    };

    switch (errorContext.severity) {
      case 'CRITICAL':
        logger.error(logMessage, logData);
        break;
      case 'HIGH':
        logger.warn(logMessage, logData);
        break;
      case 'MEDIUM':
        logger.info(logMessage, logData);
        break;
      case 'LOW':
        logger.debug(logMessage, logData);
        break;
    }
  }
}

export default ErrorContextService;
