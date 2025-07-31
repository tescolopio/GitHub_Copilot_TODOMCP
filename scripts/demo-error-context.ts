#!/usr/bin/env ts-node

/**
 * Enhanced demo script showcasing A2 - Error Context Collection
 * This demonstrates detailed error reporting and actionable feedback
 */

import { AutoContinueService } from '../src/services/AutoContinueService';
import { FileSystemTools } from '../src/tools/FileSystemTools';
import { GitTools } from '../src/tools/GitTools';
import { ValidationTools } from '../src/tools/ValidationTools';
import { createLogger, closeLogger } from '../src/utils/logger';
import path from 'path';

const logger = createLogger('A2-Demo');

async function runA2Demo(): Promise<void> {
  console.log('🚀 A2 - Error Context Collection Demo');
  console.log('====================================\n');

  const workspacePath = path.join(__dirname, '../sample-workspace');
  
  try {
    // Initialize services
    const fileTools = new FileSystemTools();
    const gitTools = new GitTools(workspacePath);
    const validationTools = new ValidationTools();

    // Create AutoContinueService with better pattern coverage to show successful matches
    const autoContinueService = new AutoContinueService(
      fileTools,
      gitTools,
      validationTools,
      workspacePath,
      {
        maxActionsPerSession: 10,
        safetyThreshold: 0.7, // Moderate threshold to allow some actions
        enableReplay: true,
        patterns: {
          enabled: ['add-comment', 'fix-formatting', 'update-documentation'], // Enable more patterns
          disabled: ['rename-variable', 'implement-function'], // Keep risky ones disabled
        },
      }
    );

    console.log('📊 Starting session with error collection...\n');

    // Add timeout protection for the entire session
    const sessionPromise = autoContinueService.startSession(workspacePath);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Demo session timed out after 60 seconds')), 60000)
    );

    const result = await Promise.race([sessionPromise, timeoutPromise]);

    console.log('✅ Session completed!');
    console.log(`📈 Actions executed: ${result.actionsExecuted}`);
    console.log(`💬 Message: ${result.message}\n`);

    // Get and display error context
    const errorContextService = autoContinueService.getErrorContextService();
    const errorSummary = errorContextService.getSessionErrorSummary(result.sessionId);
    
    console.log('🔍 ERROR ANALYSIS');
    console.log('================\n');
    
    if (errorSummary.totalErrors === 0) {
      console.log('✅ No errors detected - all TODOs were successfully processed!\n');
    } else {
      console.log(`📊 Total Errors: ${errorSummary.totalErrors}`);
      console.log(`🔢 Error Breakdown:`);
      Object.entries(errorSummary.errorsByType).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });
      console.log();

      console.log(`🚨 Severity Breakdown:`);
      Object.entries(errorSummary.errorsBySeverity).forEach(([severity, count]) => {
        console.log(`   ${severity}: ${count}`);
      });
      console.log();

      // Show detailed errors
      const allErrors = errorContextService.getSessionErrors(result.sessionId);
      console.log('📋 DETAILED ERROR REPORTS');
      console.log('=========================\n');
      
      allErrors.slice(0, 5).forEach((error, index) => {
        console.log(`${index + 1}. ${error.userFriendlyMessage}`);
        console.log(`   Type: ${error.errorType} | Severity: ${error.severity}`);
        if (error.context.fileName) {
          console.log(`   File: ${error.context.fileName}:${error.context.lineNumber}`);
        }
        if (error.context.todoContent) {
          console.log(`   TODO: "${error.context.todoContent}"`);
        }
        if (error.context.confidence !== undefined) {
          console.log(`   Confidence: ${error.context.confidence} | Threshold: ${error.context.safetyThreshold}`);
        }
        console.log(`   Suggestions: ${error.suggestions.slice(0, 2).join(', ')}`);
        console.log();
      });

      if (allErrors.length > 5) {
        console.log(`... and ${allErrors.length - 5} more errors\n`);
      }

      // Show actionable suggestions
      if (errorSummary.suggestions.length > 0) {
        console.log('💡 TOP SUGGESTIONS');
        console.log('==================\n');
        errorSummary.suggestions.slice(0, 5).forEach((suggestion, index) => {
          console.log(`${index + 1}. ${suggestion}`);
        });
        console.log();
      }

      // Show user actions
      if (errorSummary.userActions.length > 0) {
        console.log('🎯 RECOMMENDED ACTIONS');
        console.log('======================\n');
        errorSummary.userActions.slice(0, 3).forEach((action, index) => {
          console.log(`${index + 1}. ${action}`);
        });
        console.log();
      }
    }

    // Show full error report if available
    if (result.errorReport) {
      console.log('📄 FULL ERROR REPORT');
      console.log('====================\n');
      console.log(result.errorReport);
    }

    console.log('🎉 A2 Demo completed successfully!');
    console.log('   Error context collection is now providing detailed,');
    console.log('   actionable feedback about why TODOs aren\'t being processed.\n');

    // Gracefully close logger to prevent hanging
    closeLogger();

  } catch (error) {
    console.error('❌ Demo failed:', error);
    
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    
    // Gracefully close logger to prevent hanging
    closeLogger();
    process.exit(1);
  }
}

// Main execution with timeout protection
async function main(): Promise<void> {
  try {
    // Set Python executable for child processes
    process.env.PYTHON_EXECUTABLE = '/home/xbyooki/github_copilot_TODOMCP/.venv/bin/python';

    // Add overall timeout for safety
    const demoPromise = runA2Demo();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Overall demo timed out after 90 seconds')), 90000)
    );

    await Promise.race([demoPromise, timeoutPromise]);
  } catch (error) {
    console.error('❌ Demo execution failed:', error);
    // Gracefully close logger to prevent hanging
    closeLogger();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
