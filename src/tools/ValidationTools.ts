import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { createLogger } from '../utils/logger';
import findUp from 'find-up';

const execAsync = promisify(exec);
const logger = createLogger('ValidationTools');

export interface SyntaxValidationResult {
  isValid: boolean;
  errors: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

export interface TestResult {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  failures: Array<{
    test: string;
    error: string;
  }>;
  duration: number;
}

export class ValidationTools {
  async validateSyntax(args: {
    filePath: string;
    content?: string;
  }): Promise<SyntaxValidationResult> {
    try {
      const { filePath, content } = args;
      logger.info(`Validating syntax for ${filePath}`);

      const fileContent = content || (await fs.readFile(filePath, 'utf-8'));
      const extension = path.extname(filePath).toLowerCase();

      let validationResult: SyntaxValidationResult;

      switch (extension) {
        case '.ts':
        case '.tsx':
          validationResult = await this.validateTypeScript(filePath, fileContent);
          break;
        case '.js':
        case '.jsx':
          validationResult = await this.validateJavaScript(filePath, fileContent);
          break;
        case '.py':
          validationResult = await this.validatePython(filePath, fileContent);
          break;
        case '.json':
          validationResult = await this.validateJson(fileContent);
          break;
        default:
          validationResult = { isValid: true, errors: [] };
          break;
      }

      return validationResult;
    } catch (error) {
      logger.error('Error validating syntax:', error);
      throw error;
    }
  }

  async runTests(args: {
    workspacePath: string;
    testPattern?: string;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const { workspacePath, testPattern } = args;
      logger.info(`Running tests in ${workspacePath}`);

      const testFramework = await this.detectTestFramework(workspacePath);
      
      if (!testFramework) {
        return {
          content: [
            {
              type: 'text',
              text: '⚠️ No test framework detected',
            },
          ],
        };
      }

      const testResult = await this.executeTests(workspacePath, testFramework, testPattern);

      const result = `🧪 Test Results\n` +
        `${'='.repeat(50)}\n` +
        `Framework: ${testFramework}\n` +
        `Status: ${testResult.success ? '✅ Passed' : '❌ Failed'}\n` +
        `Duration: ${testResult.duration}ms\n` +
        `\n` +
        `📊 Summary:\n` +
        `  Total: ${testResult.summary.total}\n` +
        `  Passed: ${testResult.summary.passed} ✅\n` +
        `  Failed: ${testResult.summary.failed} ❌\n` +
        `  Skipped: ${testResult.summary.skipped} ⏭️\n` +
        `\n` +
        (testResult.failures.length > 0 
          ? `💥 Failures:\n${testResult.failures.map(failure => 
              `  ❌ ${failure.test}\n     ${failure.error.split('\n')[0]}`
            ).join('\n')}\n`
          : '');

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      logger.error('Error running tests:', error);
      throw error;
    }
  }

  private async validateTypeScript(filePath: string, content: string): Promise<SyntaxValidationResult> {
    try {
      const tempFile = path.join(path.dirname(filePath), `.temp-${Date.now()}.ts`);
      await fs.writeFile(tempFile, content);
      
      const tsconfigPath = await findUp('tsconfig.json', { cwd: path.dirname(filePath) });

      try {
        const command = `npx tsc --noEmit --skipLibCheck ${tsconfigPath ? `--project "${tsconfigPath}"` : ''} "${tempFile}"`;
        await execAsync(command);
        
        await fs.remove(tempFile);
        
        return {
          isValid: true,
          errors: [],
        };
      } catch (execError: any) {
        await fs.remove(tempFile);
        
        const stderr = execError.stderr || execError.stdout || '';
        let errors = this.parseTypeScriptErrors(stderr);

        if (errors.length === 0 && stderr.trim()) {
          // If parsing returns no specific errors but there was output,
          // treat the whole output as a single, general error.
          errors.push({
            line: 1,
            column: 1,
            message: stderr.trim(),
            severity: 'error',
          });
        }

        return {
          isValid: false,
          errors,
        };
      }
    } catch (error: any) {
      logger.warn('TypeScript validation failed:', error);
      return { 
        isValid: false, 
        errors: [{
          line: 1,
          column: 1,
          message: error.message || 'An unknown validation error occurred.',
          severity: 'error'
        }] 
      };
    }
  }

  private async validateJavaScript(filePath: string, content: string): Promise<SyntaxValidationResult> {
    try {
      // Simple syntax validation using eval in a try-catch
      new Function(content);
      return { isValid: true, errors: [] };
    } catch (error: any) {
      return {
        isValid: false,
        errors: [{
          line: 1,
          column: 1,
          message: error.message,
          severity: 'error' as const,
        }],
      };
    }
  }

  private async validatePython(filePath: string, content: string): Promise<SyntaxValidationResult> {
    try {
      const tempFile = path.join(path.dirname(filePath), `.temp-${Date.now()}.py`);
      await fs.writeFile(tempFile, content);

      try {
        const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python';
        await execAsync(`${pythonExecutable} -m py_compile "${tempFile}"`);
        await fs.remove(tempFile);
        return { isValid: true, errors: [] };
      } catch (execError: any) {
        await fs.remove(tempFile);
        
        const errorMessage = execError.stderr || execError.stdout || 'Unknown Python syntax error';
        return {
          isValid: false,
          errors: [{
            line: 1,
            column: 1,
            message: errorMessage,
            severity: 'error' as const,
          }],
        };
      }
    } catch (error) {
      logger.warn('Python validation failed:', error);
      return { isValid: true, errors: [] }; // Fallback
    }
  }

  private async validateJson(content: string): Promise<SyntaxValidationResult> {
    try {
      JSON.parse(content);
      return { isValid: true, errors: [] };
    } catch (error: any) {
      return {
        isValid: false,
        errors: [{
          line: 1,
          column: 1,
          message: error.message,
          severity: 'error' as const,
        }],
      };
    }
  }

  private parseTypeScriptErrors(stderr: string): Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
  }> {
    const errors: Array<{
      line: number;
      column: number;
      message: string;
      severity: 'error' | 'warning';
    }> = [];

    const lines = stderr.split('\n');
    
    for (const line of lines) {
      // Match TypeScript error format: filename(line,column): error TS####: message
      const match = line.match(/\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)/);
      
      if (match) {
        const [, lineNum, colNum, severity, message] = match;
        errors.push({
          line: parseInt(lineNum || '1', 10),
          column: parseInt(colNum || '1', 10),
          message: (message || 'Unknown error').trim(),
          severity: severity as 'error' | 'warning',
        });
      }
    }

    return errors;
  }

  private async detectTestFramework(workspacePath: string): Promise<string | null> {
    const packageJsonPath = path.join(workspacePath, 'package.json');
    
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (deps.jest) return 'jest';
      if (deps.mocha) return 'mocha';
      if (deps.vitest) return 'vitest';
      if (deps['@playwright/test']) return 'playwright';
    }

    return null;
  }

  private async executeTests(
    workspacePath: string,
    framework: string,
    testPattern?: string
  ): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      let command = '';
      
      switch (framework) {
        case 'jest':
          command = testPattern ? `npx jest "${testPattern}"` : 'npx jest';
          break;
        case 'mocha':
          command = testPattern ? `npx mocha "${testPattern}"` : 'npx mocha';
          break;
        case 'vitest':
          command = 'npx vitest run';
          break;
        case 'playwright':
          command = 'npx playwright test';
          break;
        default:
          throw new Error(`Unsupported test framework: ${framework}`);
      }

      const { stdout, stderr } = await execAsync(command, { 
        cwd: workspacePath,
        timeout: 30000 // 30 second timeout
      });

      const duration = Date.now() - startTime;
      
      return this.parseTestOutput(framework, stdout, stderr, duration);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        summary: { total: 0, passed: 0, failed: 1, skipped: 0 },
        failures: [{
          test: 'Test execution',
          error: error.message,
        }],
        duration,
      };
    }
  }

  private parseTestOutput(
    framework: string,
    stdout: string,
    stderr: string,
    duration: number
  ): TestResult {
    // Simplified test result parsing - this would need to be expanded
    // for production use with proper parsing for each framework
    
    const output = stdout + stderr;
    const lines = output.split('\n');
    
    // Basic parsing - would need framework-specific implementation
    const failedLines = lines.filter(line => 
      line.includes('failed') || line.includes('FAIL') || line.includes('✗')
    );
    
    const passedLines = lines.filter(line => 
      line.includes('passed') || line.includes('PASS') || line.includes('✓')
    );

    return {
      success: failedLines.length === 0,
      summary: {
        total: passedLines.length + failedLines.length,
        passed: passedLines.length,
        failed: failedLines.length,
        skipped: 0,
      },
      failures: failedLines.map(line => ({
        test: 'Test case',
        error: line.trim(),
      })),
      duration,
    };
  }

  async checkBuild(args: {
    workspacePath: string;
    buildCommand?: string;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const { workspacePath, buildCommand } = args;
      logger.info(`Checking build for ${workspacePath}`);

      const buildCmd = buildCommand || await this.detectBuildCommand(workspacePath);
      
      if (!buildCmd) {
        return {
          content: [
            {
              type: 'text',
              text: '⚠️ No build command detected. Please specify a build command or ensure package.json has a build script.',
            },
          ],
        };
      }

      const startTime = Date.now();
      
      try {
        const { stdout, stderr } = await execAsync(buildCmd, { 
          cwd: workspacePath,
          timeout: 60000 // 60 second timeout for builds
        });

        const duration = Date.now() - startTime;
        
        const result = `🏗️ Build Check Results\n` +
          `${'='.repeat(50)}\n` +
          `Command: ${buildCmd}\n` +
          `Status: ✅ Success\n` +
          `Duration: ${duration}ms\n` +
          `\n` +
          `📤 Output:\n${stdout}\n` +
          (stderr ? `⚠️ Warnings/Errors:\n${stderr}\n` : '');

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (buildError: any) {
        const duration = Date.now() - startTime;
        
        const result = `🏗️ Build Check Results\n` +
          `${'='.repeat(50)}\n` +
          `Command: ${buildCmd}\n` +
          `Status: ❌ Failed\n` +
          `Duration: ${duration}ms\n` +
          `\n` +
          `💥 Error Output:\n${buildError.stdout || ''}\n${buildError.stderr || ''}\n` +
          `\n` +
          `🚨 Build failed! Please fix the compilation errors before proceeding.`;

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
    } catch (error) {
      logger.error('Error checking build:', error);
      throw error;
    }
  }

  private async detectBuildCommand(workspacePath: string): Promise<string | null> {
    const packageJsonPath = path.join(workspacePath, 'package.json');
    
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      const scripts = packageJson.scripts || {};
      
      // Check for common build script names
      if (scripts.build) return 'npm run build';
      if (scripts.compile) return 'npm run compile';
      if (scripts.tsc) return 'npm run tsc';
      
      // Check for TypeScript project
      if (await fs.pathExists(path.join(workspacePath, 'tsconfig.json'))) {
        return 'npx tsc';
      }
    }

    // Check for other build systems
    if (await fs.pathExists(path.join(workspacePath, 'Makefile'))) {
      return 'make';
    }
    
    if (await fs.pathExists(path.join(workspacePath, 'build.gradle'))) {
      return './gradlew build';
    }
    
    if (await fs.pathExists(path.join(workspacePath, 'pom.xml'))) {
      return 'mvn compile';
    }

    return null;
  }
}
