import * as ts from 'typescript';
import { logger } from './logger';

export interface UnusedVariable {
  name: string;
  line: number;
  column: number;
  kind: 'variable' | 'function' | 'parameter' | 'class';
  scope: string;
}

export interface VariableAnalysisResult {
  unusedVariables: UnusedVariable[];
  totalVariables: number;
  safeToRemove: UnusedVariable[];
  requiresReview: UnusedVariable[];
}

export class UnusedVariableAnalyzer {
  private sourceFile: ts.SourceFile | null = null;
  private checker: ts.TypeChecker | null = null;
  private program: ts.Program | null = null;

  /**
   * Analyzes a TypeScript/JavaScript file for unused variables
   */
  async analyzeFile(filePath: string, content: string): Promise<VariableAnalysisResult> {
    try {
      logger.info(`Analyzing unused variables in: ${filePath}`);
      
      // Use absolute path
      const absolutePath = require('path').resolve(filePath);
      const extension = require('path').extname(absolutePath).toLowerCase();
      
      // Create TypeScript program
      const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        strict: false,
        allowJs: true,
        jsx: extension.includes('x') ? ts.JsxEmit.React : ts.JsxEmit.None,
        skipLibCheck: true,
        noEmit: true
      };

      // Create a simple source file directly if it's JavaScript
      let sourceFile: ts.SourceFile;
      if (['.js', '.jsx'].includes(extension)) {
        sourceFile = ts.createSourceFile(
          absolutePath, 
          content, 
          ts.ScriptTarget.ES2020, 
          true,
          extension === '.jsx' ? ts.ScriptKind.JSX : ts.ScriptKind.JS
        );
      } else {
        sourceFile = ts.createSourceFile(
          absolutePath, 
          content, 
          ts.ScriptTarget.ES2020, 
          true,
          extension === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        );
      }

      if (!sourceFile) {
        throw new Error(`Could not parse file: ${filePath}`);
      }

      this.sourceFile = sourceFile;

      const declared = this.findDeclaredVariables(this.sourceFile);
      const used = this.findUsedIdentifiers(this.sourceFile);
      
      const unusedVariables = this.identifyUnusedVariables(declared, used);
      const { safeToRemove, requiresReview } = this.categorizeUnusedVariables(unusedVariables);

      const result: VariableAnalysisResult = {
        unusedVariables,
        totalVariables: declared.length,
        safeToRemove,
        requiresReview
      };

      logger.info(`Found ${unusedVariables.length} unused variables out of ${declared.length} total`);
      return result;

    } catch (error) {
      logger.error(`Error analyzing variables in ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Find all declared variables, functions, parameters, and classes
   */
  private findDeclaredVariables(sourceFile: ts.SourceFile): UnusedVariable[] {
    const declared: UnusedVariable[] = [];

    const visit = (node: ts.Node) => {
      // Variable declarations
      if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        declared.push({
          name: node.name.text,
          line: pos.line + 1,
          column: pos.character + 1,
          kind: 'variable',
          scope: this.getScopeName(node)
        });
      }

      // Function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        declared.push({
          name: node.name.text,
          line: pos.line + 1,
          column: pos.character + 1,
          kind: 'function',
          scope: this.getScopeName(node)
        });
      }

      // Class declarations
      if (ts.isClassDeclaration(node) && node.name) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        declared.push({
          name: node.name.text,
          line: pos.line + 1,
          column: pos.character + 1,
          kind: 'class',
          scope: this.getScopeName(node)
        });
      }

      // Function parameters
      if (ts.isParameter(node) && node.name && ts.isIdentifier(node.name)) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        declared.push({
          name: node.name.text,
          line: pos.line + 1,
          column: pos.character + 1,
          kind: 'parameter',
          scope: this.getScopeName(node)
        });
      }

      // Arrow function parameters
      if (ts.isArrowFunction(node)) {
        node.parameters.forEach(param => {
          if (param.name && ts.isIdentifier(param.name)) {
            const pos = sourceFile.getLineAndCharacterOfPosition(param.getStart());
            declared.push({
              name: param.name.text,
              line: pos.line + 1,
              column: pos.character + 1,
              kind: 'parameter',
              scope: this.getScopeName(param)
            });
          }
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return declared;
  }

  /**
   * Find all identifier usages in the file
   */
  private findUsedIdentifiers(sourceFile: ts.SourceFile): Set<string> {
    const used = new Set<string>();

    const visit = (node: ts.Node) => {
      // Skip declaration contexts - we only want usage
      if (this.isDeclarationContext(node)) {
        // Still visit children but don't count this identifier as used
        ts.forEachChild(node, visit);
        return;
      }

      if (ts.isIdentifier(node)) {
        used.add(node.text);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return used;
  }

  /**
   * Check if a node is in a declaration context (not a usage)
   */
  private isDeclarationContext(node: ts.Node): boolean {
    const parent = node.parent;
    
    if (!parent) return false;

    // Variable declarations: const x = ...
    if (ts.isVariableDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Function declarations: function x() {}
    if (ts.isFunctionDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Class declarations: class X {}
    if (ts.isClassDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Parameter declarations: function f(x) {}
    if (ts.isParameter(parent) && parent.name === node) {
      return true;
    }

    // Property assignments in object literals: { x: value }
    if (ts.isPropertyAssignment(parent) && parent.name === node) {
      return true;
    }

    return false;
  }

  /**
   * Get a human-readable scope name for a node
   */
  private getScopeName(node: ts.Node): string {
    let current = node.parent;
    const scopes: string[] = [];

    while (current) {
      if (ts.isFunctionDeclaration(current) && current.name) {
        scopes.unshift(current.name.text);
      } else if (ts.isClassDeclaration(current) && current.name) {
        scopes.unshift(current.name.text);
      } else if (ts.isMethodDeclaration(current) && current.name && ts.isIdentifier(current.name)) {
        scopes.unshift(current.name.text);
      } else if (ts.isSourceFile(current)) {
        scopes.unshift('global');
        break;
      }
      current = current.parent;
    }

    return scopes.length > 0 ? scopes.join('.') : 'global';
  }

  /**
   * Identify which declared variables are not used
   */
  private identifyUnusedVariables(declared: UnusedVariable[], used: Set<string>): UnusedVariable[] {
    return declared.filter(variable => {
      // Exclude variables that start with underscore (conventional "unused" marker)
      if (variable.name.startsWith('_')) {
        return false;
      }

      // Check if the variable is used
      return !used.has(variable.name);
    });
  }

  /**
   * Categorize unused variables into safe-to-remove and requires-review
   */
  private categorizeUnusedVariables(unusedVariables: UnusedVariable[]): {
    safeToRemove: UnusedVariable[];
    requiresReview: UnusedVariable[];
  } {
    const safeToRemove: UnusedVariable[] = [];
    const requiresReview: UnusedVariable[] = [];

    for (const variable of unusedVariables) {
      // Conservative approach: only local variables are safe to remove automatically
      if (variable.kind === 'variable' && variable.scope !== 'global') {
        safeToRemove.push(variable);
      } else {
        // Functions, classes, global variables, and parameters require review
        requiresReview.push(variable);
      }
    }

    return { safeToRemove, requiresReview };
  }

  /**
   * Remove unused variables from the source code
   */
  async removeUnusedVariables(
    content: string,
    variablesToRemove: UnusedVariable[]
  ): Promise<{ content: string; removedCount: number }> {
    if (variablesToRemove.length === 0) {
      return { content, removedCount: 0 };
    }

    try {
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        content,
        ts.ScriptTarget.ES2020,
        true
      );

      const toRemove = new Set(variablesToRemove.map(v => v.name));
      const changes: { start: number; end: number }[] = [];

      const visit = (node: ts.Node) => {
        // Remove variable declarations
        if (ts.isVariableStatement(node)) {
          const declarations = node.declarationList.declarations;
          const unusedDeclarations = declarations.filter(decl => 
            decl.name && ts.isIdentifier(decl.name) && toRemove.has(decl.name.text)
          );

          if (unusedDeclarations.length === declarations.length) {
            // Remove entire statement if all declarations are unused
            changes.push({ start: node.getFullStart(), end: node.getEnd() });
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);

      // Sort changes in reverse order to maintain correct positions
      changes.sort((a, b) => b.start - a.start);

      let modifiedContent = content;
      for (const change of changes) {
        modifiedContent = modifiedContent.slice(0, change.start) + modifiedContent.slice(change.end);
      }

      logger.info(`Removed ${changes.length} unused variable declarations`);
      return { content: modifiedContent, removedCount: changes.length };

    } catch (error) {
      logger.error('Error removing unused variables:', error);
      throw error;
    }
  }
}
