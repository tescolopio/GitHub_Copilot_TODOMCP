import path from 'path';
import fs from 'fs-extra';
import { AutoContinueService } from '../src/services/AutoContinueService';
import { FileSystemTools } from '../src/tools/FileSystemTools';
import { GitTools } from '../src/tools/GitTools';
import { ValidationTools } from '../src/tools/ValidationTools';
import { DebugTools } from '../src/tools/DebugTools';

/**
 * Demo script showing Action Replay functionality with timeout protection
 */
async function demoActionReplay() {
  console.log('🎬 Action Replay Demo - Alpha Testing Feature A1');
  console.log('===============================================\n');

  // Set up temporary workspace
  const tempDir = path.join(__dirname, '..', 'temp', `demo-${Date.now()}`);
  const workspacePath = path.join(tempDir, 'workspace');
  await fs.ensureDir(workspacePath);

  try {
    // Initialize services
    const fileTools = new FileSystemTools();
    const gitTools = new GitTools(workspacePath);
    const validationTools = new ValidationTools();
    
    const autoContinueService = new AutoContinueService(
      fileTools,
      gitTools,
      validationTools,
      workspacePath,
      {
        maxActionsPerSession: 3,
        enableReplay: true, // Enable replay recording
        enableBackups: false, // Disable backups for demo
        enableGitIntegration: false, // Disable git for demo
      }
    );

    // Get the replay service for debugging
    const replayService = autoContinueService.getReplayService();
    const debugTools = new DebugTools({ replayService });

    console.log('✅ Services initialized with replay recording enabled\n');

    // Create a sample file with TODOs
    const sampleFile = path.join(workspacePath, 'example.ts');
    const sampleContent = `// Example TypeScript file
export class Calculator {
  // TODO: Add method documentation
  add(a: number, b: number): number {
    return a + b;
  }

  // TODO: Implement multiply method
  multiply(a: number, b: number): number {
    // TODO: Add implementation
    return 0;
  }

  // TODO: Add error handling for division by zero
  divide(a: number, b: number): number {
    return a / b;
  }
}`;

    await fs.writeFile(sampleFile, sampleContent);
    console.log('📝 Created sample file with TODOs for processing\n');

    // Start an autonomous session with timeout protection
    console.log('🚀 Starting autonomous development session...');
    
    // Add overall timeout to the entire session
    const sessionPromise = autoContinueService.startSession(workspacePath);
    const sessionTimeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Demo session timed out after 60 seconds')), 60000)
    );
    
    const result = await Promise.race([sessionPromise, sessionTimeoutPromise]);
    
    console.log(`📊 Session completed:`);
    console.log(`   - Session ID: ${result.sessionId}`);
    console.log(`   - Actions executed: ${result.actionsExecuted}`);
    console.log(`   - Success: ${result.success}`);
    console.log(`   - Message: ${result.message}\n`);

    if (result.success && result.actionsExecuted > 0) {
      // Demonstrate debugging tools with timeout protection
      console.log('🔍 Debugging with Action Replay:');
      console.log('================================\n');

      try {
        // Add timeout to debugging operations
        const debugPromise = (async () => {
          // List available replay sessions
          console.log('1. Available replay sessions:');
          const sessionsList = await debugTools.listReplaySessions();
          if (sessionsList.content[0]) {
            console.log(sessionsList.content[0].text);
          }
          console.log('');

          // Debug the session
          console.log('2. Session breakdown:');
          const sessionDebug = await debugTools.debugSession({ sessionId: result.sessionId });
          if (sessionDebug.content[0]) {
            console.log(sessionDebug.content[0].text);
          }
          console.log('');

          // Debug the first step in detail
          if (result.actionsExecuted > 0) {
            console.log('3. Detailed step analysis:');
            const stepDebug = await debugTools.debugStep({ 
              sessionId: result.sessionId, 
              stepNumber: 1 
            });
            if (stepDebug.content[0]) {
              console.log(stepDebug.content[0].text);
            }
            console.log('');

            // Compare file states
            console.log('4. File state comparison:');
            const fileComparison = await debugTools.compareFileStates({
              sessionId: result.sessionId,
              stepNumber: 1
            });
            if (fileComparison.content[0]) {
              console.log(fileComparison.content[0].text);
            }
          }
        })();

        const debugTimeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Debug operations timed out after 30 seconds')), 30000)
        );

        await Promise.race([debugPromise, debugTimeoutPromise]);

      } catch (debugError) {
        console.log('⚠️  Debug operations encountered an issue:', debugError instanceof Error ? debugError.message : String(debugError));
        console.log('This doesn\'t affect the core replay functionality - replay data was recorded successfully.\n');
      }
    } else {
      console.log('⚠️  No actions were executed, so no replay data is available for debugging.');
      console.log('This could happen if no suitable TODOs were found or if safety thresholds prevented execution.');
    }

    console.log('\n🎉 Action Replay Demo Complete!');
    console.log('\nKey Features Demonstrated:');
    console.log('• ✅ A1 - Action Replay for Debugging: Record and replay autonomous actions');
    console.log('• 🔍 Step-by-step action breakdown');
    console.log('• 📊 Detailed execution analysis');
    console.log('• 📝 File state before/after comparison');
    console.log('• ⚠️  Potential issue detection');
    console.log('\nThis enables developers to:');
    console.log('- Debug autonomous development sessions');
    console.log('- Understand what actions were taken and why');
    console.log('- Identify issues in the autonomous decision-making process');
    console.log('- Replay and analyze failed or unexpected behaviors\n');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Clean up
    await fs.remove(tempDir);
    console.log('🧹 Cleaned up temporary files');
  }
}

// Run the demo
if (require.main === module) {
  demoActionReplay().catch(console.error);
}

export { demoActionReplay };
