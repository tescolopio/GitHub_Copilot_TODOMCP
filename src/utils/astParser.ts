import * as ts from 'typescript';
import { createLogger } from './logger';

const logger = createLogger('ASTParser');

export function createSourceFile(filePath: string, content: string): ts.SourceFile {
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
}

export function findIdentifierAtPosition(sourceFile: ts.SourceFile, position: number): ts.Identifier | undefined {
  function find(node: ts.Node): ts.Identifier | undefined {
    if (node.getStart() <= position && position < node.getEnd()) {
      if (ts.isIdentifier(node)) {
        return node;
      }
      return ts.forEachChild(node, find);
    }
    return undefined;
  }
  return find(sourceFile);
}

export function findAllIdentifiersWithName(sourceFile: ts.SourceFile, targetName: string): ts.Identifier[] {
  const results: ts.Identifier[] = [];

  function visit(node: ts.Node) {
    if (ts.isIdentifier(node) && node.text === targetName) {
      results.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

export function findAllOccurrences(sourceFile: ts.SourceFile, identifier: ts.Identifier): ts.Node[] {
  // For a simpler implementation, we'll find all identifiers with the same name
  // In a production system, you'd want to use the TypeScript language service
  // to get proper symbol resolution and scope analysis
  return findAllIdentifiersWithName(sourceFile, identifier.text);
}

export interface ImportDeclaration {
  start: number;
  end: number;
  line: number;
  importPath: string;
  namedImports: string[];
  defaultImport?: string | undefined;
  namespaceImport?: string | undefined;
  isUsed: boolean;
}

/**
 * Analyze imports in a TypeScript/JavaScript file
 */
export function analyzeImports(sourceFile: ts.SourceFile): ImportDeclaration[] {
  const imports: ImportDeclaration[] = [];
  
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const importDecl = parseImportDeclaration(node, sourceFile);
      if (importDecl) {
        imports.push(importDecl);
      }
    }
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  
  // Check usage for each import
  imports.forEach(importDecl => {
    importDecl.isUsed = isImportUsed(sourceFile, importDecl);
  });
  
  return imports;
}

/**
 * Parse an import declaration node
 */
function parseImportDeclaration(node: ts.ImportDeclaration, sourceFile: ts.SourceFile): ImportDeclaration | null {
  if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
    return null;
  }
  
  const start = node.getStart();
  const end = node.getEnd();
  const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  const importPath = node.moduleSpecifier.text;
  
  const namedImports: string[] = [];
  let defaultImport: string | undefined;
  let namespaceImport: string | undefined;
  
  if (node.importClause) {
    // Default import
    if (node.importClause.name) {
      defaultImport = node.importClause.name.text;
    }
    
    // Named imports
    if (node.importClause.namedBindings) {
      if (ts.isNamedImports(node.importClause.namedBindings)) {
        node.importClause.namedBindings.elements.forEach(element => {
          namedImports.push(element.name.text);
        });
      } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
        namespaceImport = node.importClause.namedBindings.name.text;
      }
    }
  }
  
  return {
    start,
    end,
    line,
    importPath,
    namedImports,
    defaultImport,
    namespaceImport,
    isUsed: false // Will be determined later
  };
}

/**
 * Check if an import is used in the file
 */
function isImportUsed(sourceFile: ts.SourceFile, importDecl: ImportDeclaration): boolean {
  const importedNames = [
    ...(importDecl.defaultImport ? [importDecl.defaultImport] : []),
    ...importDecl.namedImports,
    ...(importDecl.namespaceImport ? [importDecl.namespaceImport] : [])
  ];
  
  if (importedNames.length === 0) {
    // Side-effect import (e.g., import './styles.css')
    return true;
  }
  
  // Check if any imported name is used in the file
  return importedNames.some(name => isIdentifierUsedInFile(sourceFile, name, importDecl.end));
}

/**
 * Check if an identifier is used in the file after the import
 */
function isIdentifierUsedInFile(sourceFile: ts.SourceFile, identifier: string, afterPosition: number): boolean {
  let found = false;
  
  function visit(node: ts.Node) {
    if (found) return;
    
    // Skip nodes before the import
    if (node.getStart() <= afterPosition) {
      ts.forEachChild(node, visit);
      return;
    }
    
    if (ts.isIdentifier(node) && node.text === identifier) {
      // Found usage - but need to verify it's not in another import
      const parent = node.parent;
      if (!ts.isImportDeclaration(parent) && !isInImportDeclaration(node)) {
        found = true;
        return;
      }
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return found;
}

/**
 * Check if a node is within an import declaration
 */
function isInImportDeclaration(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isImportDeclaration(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Get unused imports from a file
 */
export function getUnusedImports(sourceFile: ts.SourceFile): ImportDeclaration[] {
  const allImports = analyzeImports(sourceFile);
  return allImports.filter(importDecl => !importDecl.isUsed);
}
