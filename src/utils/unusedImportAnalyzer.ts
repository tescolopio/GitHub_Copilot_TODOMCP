import * as ts from 'typescript';
import { logger } from './logger';

export interface UnusedImport {
  importName: string;
  importPath: string;
  position: {
    start: number;
    end: number;
    line: number;
  };
  type: 'default' | 'named' | 'namespace' | 'side-effect';
}

/**
 * Analyzes TypeScript/JavaScript files to find unused imports
 */
export class UnusedImportAnalyzer {
  
  /**
   * Find all unused imports in a source file
   */
  public findUnusedImports(sourceFile: ts.SourceFile): UnusedImport[] {
    const imports = this.extractAllImports(sourceFile);
    const usedIdentifiers = this.extractUsedIdentifiers(sourceFile);
    
    const unusedImports: UnusedImport[] = [];
    
    for (const importInfo of imports) {
      if (importInfo.type === 'side-effect') {
        // Side-effect imports (e.g., import './styles.css') are always considered used
        continue;
      }
      
      const isUsed = this.isImportUsed(importInfo, usedIdentifiers);
      if (!isUsed) {
        unusedImports.push(importInfo);
      }
    }
    
    logger.debug(`Found ${unusedImports.length} unused imports out of ${imports.length} total imports`);
    return unusedImports;
  }
  
  /**
   * Extract all import statements from the source file
   */
  private extractAllImports(sourceFile: ts.SourceFile): UnusedImport[] {
    const imports: UnusedImport[] = [];
    
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node)) {
        const importPath = (node.moduleSpecifier as ts.StringLiteral).text;
        const start = node.getStart();
        const end = node.getEnd();
        const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
        
        if (!node.importClause) {
          // Side-effect import: import './file'
          imports.push({
            importName: '',
            importPath,
            position: { start, end, line },
            type: 'side-effect'
          });
        } else {
          // Named imports, default imports, or namespace imports
          if (node.importClause.name) {
            // Default import: import React from 'react'
            imports.push({
              importName: node.importClause.name.text,
              importPath,
              position: { start, end, line },
              type: 'default'
            });
          }
          
          if (node.importClause.namedBindings) {
            if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              // Namespace import: import * as React from 'react'
              imports.push({
                importName: node.importClause.namedBindings.name.text,
                importPath,
                position: { start, end, line },
                type: 'namespace'
              });
            } else if (ts.isNamedImports(node.importClause.namedBindings)) {
              // Named imports: import { useState, useEffect } from 'react'
              for (const element of node.importClause.namedBindings.elements) {
                const importName = element.propertyName 
                  ? element.propertyName.text 
                  : element.name.text;
                
                imports.push({
                  importName,
                  importPath,
                  position: { start, end, line },
                  type: 'named'
                });
              }
            }
          }
        }
      }
      
      ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    return imports;
  }
  
  /**
   * Extract all used identifiers from the source file (excluding import statements)
   */
  private extractUsedIdentifiers(sourceFile: ts.SourceFile): Set<string> {
    const usedIdentifiers = new Set<string>();
    let inImportStatement = false;
    const self = this;
    
    function visit(node: ts.Node) {
      // Skip import statements when collecting used identifiers
      if (ts.isImportDeclaration(node)) {
        inImportStatement = true;
        ts.forEachChild(node, visit);
        inImportStatement = false;
        return;
      }
      
      if (!inImportStatement && ts.isIdentifier(node)) {
        // Only consider identifiers that are actually references, not declarations
        if (self.isIdentifierReference(node)) {
          usedIdentifiers.add(node.text);
        }
      }
      
      ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    return usedIdentifiers;
  }
  
  /**
   * Check if an identifier is a reference (not a declaration)
   */
  private isIdentifierReference(node: ts.Identifier): boolean {
    const parent = node.parent;
    
    // Skip variable declarations
    if (ts.isVariableDeclaration(parent) && parent.name === node) {
      return false;
    }
    
    // Skip function declarations
    if (ts.isFunctionDeclaration(parent) && parent.name === node) {
      return false;
    }
    
    // Skip parameter declarations
    if (ts.isParameter(parent) && parent.name === node) {
      return false;
    }
    
    // Skip property declarations
    if (ts.isPropertyDeclaration(parent) && parent.name === node) {
      return false;
    }
    
    // Skip method declarations
    if (ts.isMethodDeclaration(parent) && parent.name === node) {
      return false;
    }
    
    // Skip class declarations
    if (ts.isClassDeclaration(parent) && parent.name === node) {
      return false;
    }
    
    // Skip interface declarations
    if (ts.isInterfaceDeclaration(parent) && parent.name === node) {
      return false;
    }
    
    // Skip type alias declarations
    if (ts.isTypeAliasDeclaration(parent) && parent.name === node) {
      return false;
    }
    
    // Skip enum declarations
    if (ts.isEnumDeclaration(parent) && parent.name === node) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Check if an import is used in the file
   */
  private isImportUsed(importInfo: UnusedImport, usedIdentifiers: Set<string>): boolean {
    return usedIdentifiers.has(importInfo.importName);
  }
  
  /**
   * Remove unused imports from source code
   */
  public removeUnusedImports(content: string, unusedImports: UnusedImport[]): string {
    if (unusedImports.length === 0) {
      return content;
    }
    
    // Group imports by their import declaration
    const importsByLine = new Map<number, UnusedImport[]>();
    for (const unusedImport of unusedImports) {
      const line = unusedImport.position.line;
      if (!importsByLine.has(line)) {
        importsByLine.set(line, []);
      }
      importsByLine.get(line)!.push(unusedImport);
    }
    
    const lines = content.split('\n');
    const modifiedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      
      if (!line) continue; // Skip undefined lines
      
      if (importsByLine.has(lineNum)) {
        const unusedInThisLine = importsByLine.get(lineNum)!;
        const modifiedLine = this.removeImportsFromLine(line, unusedInThisLine);
        
        // Only add the line if it's not completely empty after removal
        if (modifiedLine.trim()) {
          modifiedLines.push(modifiedLine);
        }
      } else {
        modifiedLines.push(line);
      }
    }
    
    return modifiedLines.join('\n');
  }
  
  /**
   * Remove specific imports from a single import line
   */
  private removeImportsFromLine(line: string, unusedImports: UnusedImport[]): string {
    // For simplicity, if any imports from this line are unused,
    // we'll remove the entire line. In a more sophisticated implementation,
    // we could parse and reconstruct the import statement.
    
    // Check if this is a complete import removal
    const hasNamedImports = line.includes('{');
    const hasDefaultImport = line.match(/import\s+(\w+)/);
    
    // For now, remove the entire line if it contains unused imports
    // TODO: Implement partial import removal for named imports
    return '';
  }
}
