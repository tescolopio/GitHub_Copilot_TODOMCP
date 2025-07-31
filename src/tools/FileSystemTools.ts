import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { createLogger } from '../utils/logger';
import { createSourceFile, findIdentifierAtPosition, findAllOccurrences } from '../utils/astParser';
import { FunctionImplementor } from '../utils/functionImplementor';
import { EnhancedFunctionImplementor } from '../utils/enhancedFunctionImplementor';
import { UnusedImportAnalyzer } from '../utils/unusedImportAnalyzer';
import { UnusedVariableAnalyzer } from '../utils/unusedVariableAnalyzer';
import * as ts from 'typescript';

const logger = createLogger('FileSystemTools');

export interface TodoItem {
  id: string;
  filePath: string;
  line: number;
  column: number;
  content: string;
  context: {
    before: string[];
    after: string[];
  };
  type: 'TODO' | 'FIXME' | 'HACK' | 'NOTE';
  confidence: number;
}

export interface FileWriteResult {
  success: boolean;
  backupPath?: string;
  error?: string;
}

export class FileSystemTools {
  private todoPatterns = [
    /(?:\/\/|#|\/\*|\*|<!--|<!--)\s*(TODO|FIXME|HACK|NOTE):?\s*(.+?)(?:\*\/|-->)?$/gim,
  ];

  async listTodos(args: {
    workspacePath: string;
    filePatterns?: string[];
  }): Promise<TodoItem[]> {
    try {
      const { workspacePath, filePatterns = ['**/*.{ts,js,py,java,cpp,c,h,md}'] } = args;
      logger.info(`Scanning for TODOs in ${workspacePath}`);

      const todos: TodoItem[] = [];
      
      for (const pattern of filePatterns) {
        const files = await glob(pattern, {
          cwd: workspacePath,
          ignore: ['node_modules/**', 'dist/**', '.git/**'],
          absolute: true,
        });

        for (const filePath of files) {
          const fileTodos = await this.extractTodosFromFile(filePath);
          todos.push(...fileTodos);
        }
      }

      const summary = `Found ${todos.length} TODO items.`;
      logger.info(summary);

      return todos;
    } catch (error) {
      logger.error('Error listing TODOs:', error);
      throw error;
    }
  }

  async readFileContext(args: {
    filePath: string;
    line: number;
    contextLines?: number;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const { filePath, line, contextLines = 10 } = args;
      logger.info(`Reading context for ${filePath}:${line}`);

      if (!(await fs.pathExists(filePath))) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const startLine = Math.max(0, line - contextLines - 1);
      const endLine = Math.min(lines.length, line + contextLines);

      const contextContent = lines
        .slice(startLine, endLine)
        .map((lineContent, index) => {
          const lineNumber = startLine + index + 1;
          return {
            type: 'text' as const,
            text: lineContent,
          };
        });

      return {
        content: contextContent,
      };
    } catch (error) {
      logger.error('Error reading file context:', error);
      throw error;
    }
  }

  async writeFile(args: {
    filePath: string;
    content: string;
    createBackup?: boolean;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const { filePath, content, createBackup = true } = args;
      logger.info(`Writing to ${filePath} (backup: ${createBackup})`);

      let backupPath: string | undefined;

      // Create backup if requested and file exists
      if (createBackup && (await fs.pathExists(filePath))) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = `${filePath}.backup-${timestamp}`;
        await fs.copy(filePath, backupPath);
        logger.info(`Backup created: ${backupPath}`);
      }

      // Ensure directory exists
      await fs.ensureDir(path.dirname(filePath));

      // Write the file
      await fs.writeFile(filePath, content, 'utf-8');

      const result = `✅ Successfully wrote to ${filePath}\n` +
        (backupPath ? `📄 Backup created: ${backupPath}\n` : '') +
        `📊 Content size: ${content.length} characters`;

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      logger.error('Error writing file:', error);
      throw error;
    }
  }

  async renameVariable(args: {
    filePath: string;
    oldName: string;
    newName: string;
    line?: number;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const { filePath, oldName, newName, line } = args;
      logger.info(`Renaming variable ${oldName} to ${newName} in ${filePath}`);

      if (!(await fs.pathExists(filePath))) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const extension = path.extname(filePath).toLowerCase();

      // Only process TypeScript/JavaScript files for now
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(extension)) {
        throw new Error(`AST-based renaming not supported for ${extension} files`);
      }

      // Parse the file into an AST
      const sourceFile = createSourceFile(filePath, content);
      
      // If a line number is provided, find the identifier at that position
      let targetIdentifier: ts.Identifier | undefined;
      if (line !== undefined) {
        const position = this.getPositionFromLine(content, line);
        targetIdentifier = findIdentifierAtPosition(sourceFile, position);
        
        if (!targetIdentifier || targetIdentifier.text !== oldName) {
          throw new Error(`Variable '${oldName}' not found at line ${line}`);
        }
      } else {
        // Find the first occurrence of the identifier
        const firstMatch = this.findFirstIdentifier(sourceFile, oldName);
        if (!firstMatch) {
          throw new Error(`Variable '${oldName}' not found in file`);
        }
        targetIdentifier = firstMatch;
      }

      // Find all occurrences of this variable
      const occurrences = findAllOccurrences(sourceFile, targetIdentifier);
      
      if (occurrences.length === 0) {
        throw new Error(`No occurrences of variable '${oldName}' found`);
      }

      // Sort occurrences by position (reverse order to avoid offset issues)
      const sortedOccurrences = occurrences.sort((a, b) => b.getStart() - a.getStart());

      // Replace all occurrences
      let newContent = content;
      let replacementCount = 0;

      for (const occurrence of sortedOccurrences) {
        if (ts.isIdentifier(occurrence) && occurrence.text === oldName) {
          const start = occurrence.getStart();
          const end = occurrence.getEnd();
          newContent = newContent.slice(0, start) + newName + newContent.slice(end);
          replacementCount++;
        }
      }

      // Create backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${filePath}.backup-${timestamp}`;
      await fs.copy(filePath, backupPath);

      // Write the modified content
      await fs.writeFile(filePath, newContent, 'utf-8');

      const result = `✅ Successfully renamed variable '${oldName}' to '${newName}'\n` +
        `📝 Replaced ${replacementCount} occurrences\n` +
        `📄 Backup created: ${backupPath}\n` +
        `📁 File: ${filePath}`;

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      logger.error('Error renaming variable:', error);
      throw error;
    }
  }

  private getPositionFromLine(content: string, lineNumber: number): number {
    const lines = content.split('\n');
    let position = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      const line = lines[i];
      if (line !== undefined) {
        position += line.length + 1; // +1 for newline character
      }
    }
    return position;
  }

  private findFirstIdentifier(sourceFile: ts.SourceFile, name: string): ts.Identifier | undefined {
    function find(node: ts.Node): ts.Identifier | undefined {
      if (ts.isIdentifier(node) && node.text === name) {
        return node;
      }
      return ts.forEachChild(node, find);
    }
    return find(sourceFile);
  }

  private async extractTodosFromFile(filePath: string): Promise<TodoItem[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const todos: TodoItem[] = [];

      lines.forEach((line, index) => {
        for (const pattern of this.todoPatterns) {
          pattern.lastIndex = 0; // Reset regex state
          const match = pattern.exec(line);
          
          if (match) {
            const [, type, todoContent] = match;
            const todoId = `${path.basename(filePath)}-${index + 1}-${Date.now()}`;

            const content = (todoContent || '').trim();

            todos.push({
              id: todoId,
              filePath,
              line: index + 1,
              column: match.index || 0,
              content,
              context: {
                before: lines.slice(Math.max(0, index - 3), index),
                after: lines.slice(index + 1, Math.min(lines.length, index + 4)),
              },
              type: type as TodoItem['type'],
              confidence: this.calculateConfidence(content),
            });
          }
        }
      });

      return todos;
    } catch (error) {
      logger.warn(`Failed to extract TODOs from ${filePath}:`, error);
      return [];
    }
  }

  private calculateConfidence(content: string): number {
    // Simple confidence calculation based on content characteristics
    let confidence = 0.5;

    // Boost confidence for specific patterns
    if (/add\s+comment/i.test(content)) confidence += 0.3;
    if (/fix\s+formatting/i.test(content)) confidence += 0.3;
    if (/update\s+documentation/i.test(content)) confidence += 0.2;
    if (/rename\s+\w+\s+to\s+\w+/i.test(content)) confidence += 0.2;

    // Reduce confidence for complex or vague content
    if (content.length > 100) confidence -= 0.1;
    if (/implement|refactor|optimize/i.test(content)) confidence -= 0.2;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Implement function stubs by generating code based on function signatures and TODOs
   */
  async implementFunction(args: {
    filePath: string;
    functionName?: string;
    line?: number;
    strategy?: 'conservative' | 'balanced' | 'creative';
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const { filePath, functionName, line, strategy = 'balanced' } = args;
      
      // Validate file path
      if (!await fs.pathExists(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Create backup
      const backupPath = `${filePath}.backup.${Date.now()}`;
      await fs.copy(filePath, backupPath);
      logger.info(`Backup created: ${backupPath}`);

      // Read file content
      const content = await fs.readFile(filePath, 'utf8');
      const sourceFile = createSourceFile(filePath, content);
      
      const implementor = new FunctionImplementor();
      
      // Find function stubs
      const stubs = implementor.findFunctionStubs(sourceFile);
      logger.info(`Found ${stubs.length} function stubs`);

      if (stubs.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No function stubs found in the file. Functions must be empty or contain TODO comments to be implemented.'
          }]
        };
      }

      // Filter stubs if specific criteria provided
      let targetStubs = stubs;
      if (functionName) {
        targetStubs = stubs.filter(stub => stub.name === functionName);
        if (targetStubs.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `Function '${functionName}' not found or not a stub.`
            }]
          };
        }
      } else if (line) {
        targetStubs = stubs.filter(stub => stub.position.line === line);
        if (targetStubs.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No function stub found at line ${line}.`
            }]
          };
        }
      }

      let implementedCount = 0;
      let newContent = content;
      const results: string[] = [];

      // Process each target stub
      for (const stub of targetStubs) {
        try {
          const suggestions = implementor.generateImplementation(stub);
          
          if (suggestions.length === 0) {
            results.push(`⚠️ No implementation suggestions for function '${stub.name}'`);
            continue;
          }

          // Select best suggestion based on strategy
          let selectedSuggestion = suggestions[0]; // Default to highest confidence
          
          if (strategy === 'conservative') {
            // Use only high-confidence suggestions
            const conservative = suggestions.filter(s => s.confidence >= 0.7);
            if (conservative.length === 0) {
              results.push(`⚠️ Function '${stub.name}' skipped - no high-confidence suggestions`);
              continue;
            }
            selectedSuggestion = conservative[0];
          } else if (strategy === 'creative') {
            // Allow lower-confidence but more creative suggestions
            selectedSuggestion = suggestions.find(s => s.confidence >= 0.4) || suggestions[0];
          }

          // Generate implementation
          const lines = newContent.split('\n');
          const stubEndLine = stub.position.line;
          
          // Find the function body to replace
          let bodyStartIndex = -1;
          let bodyEndIndex = -1;
          
          for (let i = stubEndLine - 1; i < lines.length; i++) {
            const line = lines[i];
            if (line && line.includes('{')) {
              bodyStartIndex = i;
              break;
            }
          }
          
          if (bodyStartIndex !== -1) {
            let braceCount = 0;
            for (let i = bodyStartIndex; i < lines.length; i++) {
              const line = lines[i];
              if (!line) continue;
              
              braceCount += (line.match(/\{/g) || []).length;
              braceCount -= (line.match(/\}/g) || []).length;
              
              if (braceCount === 0) {
                bodyEndIndex = i;
                break;
              }
            }
          }

          if (bodyStartIndex !== -1 && bodyEndIndex !== -1 && selectedSuggestion) {
            // Replace function body
            const beforeFunction = lines.slice(0, bodyStartIndex);
            const afterFunction = lines.slice(bodyEndIndex + 1);
            const headerLine = lines[bodyStartIndex];
            if (!headerLine) continue;
            
            const functionHeader = headerLine.split('{')[0];
            
            // Create new function with implementation
            const newFunctionLines = [
              functionHeader + ' ' + selectedSuggestion.implementation
            ];
            
            const newLines = [...beforeFunction, ...newFunctionLines, ...afterFunction];
            newContent = newLines.join('\n');
            
            implementedCount++;
            results.push(`✅ Implemented function '${stub.name}' with ${Math.round(selectedSuggestion.confidence * 100)}% confidence`);
            results.push(`   Reasoning: ${selectedSuggestion.reasoning}`);
            
            logger.info(`Implemented function '${stub.name}' at line ${stub.position.line}`);
          } else {
            results.push(`⚠️ Could not locate function body for '${stub.name}'`);
          }
          
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          results.push(`❌ Error implementing '${stub.name}': ${error.message}`);
          logger.error(`Error implementing function '${stub.name}':`, error);
        }
      }

      // Write updated content
      if (implementedCount > 0) {
        await fs.writeFile(filePath, newContent);
        results.unshift(`📝 Implemented ${implementedCount} function(s) in ${path.basename(filePath)}`);
        results.push(`💾 Backup saved as: ${path.basename(backupPath)}`);
      } else {
        // Remove backup if no changes made
        await fs.remove(backupPath);
        results.unshift(`ℹ️ No functions were implemented`);
      }

      return {
        content: [{
          type: 'text',
          text: results.join('\n')
        }]
      };

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Error implementing function:', error);
      throw new Error(`Function implementation failed: ${error.message}`);
    }
  }

  /**
   * Remove unused import statements from TypeScript/JavaScript files
   */
  async removeUnusedImports(args: {
    filePath: string;
    dryRun?: boolean;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      const { filePath, dryRun = false } = args;
      
      // Validate file path
      if (!await fs.pathExists(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Check file type
      const ext = path.extname(filePath);
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        return {
          content: [{
            type: 'text',
            text: `File type ${ext} not supported for import analysis. Supported: .ts, .tsx, .js, .jsx`
          }]
        };
      }

      // Read file content
      const content = await fs.readFile(filePath, 'utf8');
      const sourceFile = createSourceFile(filePath, content);
      
      // Get unused imports using the analyzer
      const analyzer = new UnusedImportAnalyzer();
      const unusedImports = analyzer.findUnusedImports(sourceFile);
      
      if (unusedImports.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No unused imports found in ${path.basename(filePath)}`
          }]
        };
      }

      // Sort by line number in descending order (remove from bottom to top)
      unusedImports.sort((a, b) => b.position.line - a.position.line);
      
      const results: string[] = [];
      results.push(`Found ${unusedImports.length} unused import(s) in ${path.basename(filePath)}:`);
      
      unusedImports.forEach(importDecl => {
        results.push(`  Line ${importDecl.position.line}: ${importDecl.importName} from '${importDecl.importPath}' (${importDecl.type})`);
      });

      if (dryRun) {
        results.push('');
        results.push('🔍 DRY RUN: No changes made. Use dryRun=false to apply changes.');
        return {
          content: [{
            type: 'text',
            text: results.join('\n')
          }]
        };
      }

      // Create backup
      const backupPath = `${filePath}.backup.${Date.now()}`;
      await fs.copy(filePath, backupPath);
      logger.info(`Backup created: ${backupPath}`);

      // Remove unused imports
      const newContent = analyzer.removeUnusedImports(content, unusedImports);
      
      // Write updated content
      await fs.writeFile(filePath, newContent);
      
      results.push('');
      results.push(`✅ Removed ${unusedImports.length} unused import(s)`);
      results.push(`💾 Backup saved as: ${path.basename(backupPath)}`);
      
      logger.info(`Removed ${unusedImports.length} unused imports from ${filePath}`);

      return {
        content: [{
          type: 'text',
          text: results.join('\n')
        }]
      };

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Error removing unused imports:', error);
      throw new Error(`Remove unused imports failed: ${error.message}`);
    }
  }

  /**
   * Remove unused variables from a file
   */
  async removeUnusedVariables(args: {
    filePath: string;
    createBackup?: boolean;
    safeOnly?: boolean;
  }) {
    try {
      const { filePath, createBackup = true, safeOnly = true } = args;
      logger.info(`Removing unused variables from: ${filePath}`);

      // Validate file exists
      if (!(await fs.pathExists(filePath))) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Validate file extension
      const ext = path.extname(filePath).toLowerCase();
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        throw new Error(`Unsupported file type: ${ext}. Only TypeScript and JavaScript files are supported.`);
      }

      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');

      // Analyze unused variables
      const analyzer = new UnusedVariableAnalyzer();
      const analysis = await analyzer.analyzeFile(filePath, content);

      // Determine which variables to remove
      const variablesToRemove = safeOnly ? analysis.safeToRemove : analysis.unusedVariables;

      if (variablesToRemove.length === 0) {
        const result = `No unused variables found${safeOnly ? ' (safe to remove)' : ''} in ${path.basename(filePath)}`;
        logger.info(result);
        return {
          content: [{
            type: 'text',
            text: result
          }]
        };
      }

      // Create backup if requested
      if (createBackup) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${filePath}.backup-${timestamp}`;
        await fs.copy(filePath, backupPath);
        logger.info(`Created backup: ${backupPath}`);
      }

      // Remove unused variables
      const { content: newContent, removedCount } = await analyzer.removeUnusedVariables(content, variablesToRemove);

      // Write the modified content back to the file
      await fs.writeFile(filePath, newContent, 'utf-8');

      // Build results summary
      const results: string[] = [
        `✅ Removed ${removedCount} unused variable declarations from ${path.basename(filePath)}`,
        '',
        'Removed Variables:'
      ];

      variablesToRemove.forEach(variable => {
        results.push(`  - ${variable.name} (${variable.kind}) at line ${variable.line} in ${variable.scope}`);
      });

      if (analysis.requiresReview.length > 0 && safeOnly) {
        results.push('');
        results.push('Variables requiring manual review:');
        analysis.requiresReview.forEach(variable => {
          results.push(`  - ${variable.name} (${variable.kind}) at line ${variable.line} in ${variable.scope}`);
        });
      }

      results.push('');
      results.push(`Total variables analyzed: ${analysis.totalVariables}`);
      results.push(`Total unused found: ${analysis.unusedVariables.length}`);
      results.push(`Automatically removed: ${removedCount}`);

      logger.info(`Successfully removed ${removedCount} unused variables from ${filePath}`);

      return {
        content: [{
          type: 'text',
          text: results.join('\n')
        }]
      };

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Error removing unused variables:', error);
      throw new Error(`Remove unused variables failed: ${error.message}`);
    }
  }

  /**
   * Helper method to apply function implementation to source code
   */
  private async applyFunctionImplementation(
    stub: any,
    suggestion: any,
    content: string,
    filePath: string
  ): Promise<{ success: boolean; content: string; error?: string }> {
    try {
      const lines = content.split('\n');
      const stubEndLine = stub.position.line;
      
      // Find the function body to replace
      let bodyStartIndex = -1;
      let bodyEndIndex = -1;
      
      for (let i = stubEndLine - 1; i < lines.length; i++) {
        const line = lines[i];
        if (line && line.includes('{')) {
          bodyStartIndex = i;
          break;
        }
      }
      
      if (bodyStartIndex !== -1) {
        let braceCount = 0;
        for (let i = bodyStartIndex; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          
          braceCount += (line.match(/\{/g) || []).length;
          braceCount -= (line.match(/\}/g) || []).length;
          
          if (braceCount === 0) {
            bodyEndIndex = i;
            break;
          }
        }
      }

      if (bodyStartIndex !== -1 && bodyEndIndex !== -1 && suggestion) {
        // Replace function body
        const beforeFunction = lines.slice(0, bodyStartIndex);
        const afterFunction = lines.slice(bodyEndIndex + 1);
        const headerLine = lines[bodyStartIndex];
        if (!headerLine) {
          return { success: false, content, error: 'Could not find function header' };
        }
        
        const functionHeader = headerLine.split('{')[0];
        
        // Create new function with implementation
        const newFunctionLines = [
          functionHeader + ' ' + suggestion.implementation
        ];
        
        const newLines = [...beforeFunction, ...newFunctionLines, ...afterFunction];
        const newContent = newLines.join('\n');
        
        return { success: true, content: newContent };
      } else {
        return { success: false, content, error: 'Could not locate function body boundaries' };
      }
      
    } catch (error) {
      return { 
        success: false, 
        content, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
}
