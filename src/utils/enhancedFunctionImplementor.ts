import * as ts from 'typescript';
import { logger } from './logger';

export interface CodeContext {
  imports: string[];
  classContext?: {
    className: string;
    methods: string[];
    properties: string[];
    extends?: string;
    implements?: string[];
  };
  moduleExports: string[];
  surroundingFunctions: Array<{
    name: string;
    signature: string;
    purpose: string;
  }>;
  usedTypes: string[];
  codeStyle: {
    indentation: 'tabs' | 'spaces';
    indentSize: number;
    useTypeScript: boolean;
    useAsyncAwait: boolean;
    preferArrowFunctions: boolean;
    useSemicolons: boolean;
  };
}

export interface TypeInformation {
  parameterTypes: Array<{
    name: string;
    type: string;
    isOptional: boolean;
    hasDefault: boolean;
    inferredUsage?: string;
  }>;
  returnType: {
    declared: string;
    inferred: string;
    confidence: number;
  };
  genericConstraints?: string[];
}

export interface ImplementationTemplate {
  name: string;
  pattern: string;
  confidence: number;
  requiredContext?: string[];
  variables: Record<string, string>;
}

export interface EnhancedFunctionStub {
  name: string;
  parameters: Array<{
    name: string;
    type: string;
    isOptional: boolean;
    defaultValue?: string;
  }>;
  returnType: string;
  description?: string;
  position: {
    start: number;
    end: number;
    line: number;
  };
  context: CodeContext;
  typeInfo: TypeInformation;
  templates: ImplementationTemplate[];
}

export interface EnhancedImplementationSuggestion {
  implementation: string;
  confidence: number;
  reasoning: string;
  dependencies?: string[];
  template?: string;
  complexity: 'simple' | 'medium' | 'complex';
  style: 'functional' | 'object-oriented' | 'procedural';
  estimatedLines: number;
}

/**
 * Enhanced function implementor with context analysis and type inference
 */
export class EnhancedFunctionImplementor {
  private sourceFile: ts.SourceFile | null = null;
  private typeChecker: ts.TypeChecker | null = null;
  private program: ts.Program | null = null;

  /**
   * Analyze a source file and extract enhanced function stubs
   */
  public async analyzeFile(filePath: string, content: string): Promise<EnhancedFunctionStub[]> {
    try {
      logger.info(`Analyzing functions in: ${filePath}`);
      
      // Create TypeScript program for type information
      const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        strict: false,
        allowJs: true,
        jsx: filePath.endsWith('.tsx') ? ts.JsxEmit.React : ts.JsxEmit.None,
        skipLibCheck: true,
        noEmit: true,
        declaration: true
      };

      this.sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.ES2020,
        true,
        filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : 
        filePath.endsWith('.ts') ? ts.ScriptKind.TS :
        filePath.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS
      );

      if (!this.sourceFile) {
        throw new Error(`Could not parse file: ${filePath}`);
      }

      // Extract code context
      const context = this.extractCodeContext(this.sourceFile);
      
      // Find function stubs
      const stubs = this.findFunctionStubs(this.sourceFile, context);
      
      logger.info(`Found ${stubs.length} function stubs requiring implementation`);
      return stubs;

    } catch (error) {
      logger.error(`Error analyzing functions in ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Extract comprehensive code context from the source file
   */
  private extractCodeContext(sourceFile: ts.SourceFile): CodeContext {
    const context: CodeContext = {
      imports: [],
      moduleExports: [],
      surroundingFunctions: [],
      usedTypes: [],
      codeStyle: {
        indentation: 'spaces',
        indentSize: 2,
        useTypeScript: sourceFile.fileName.includes('.ts'),
        useAsyncAwait: false,
        preferArrowFunctions: false,
        useSemicolons: true
      }
    };

    const visit = (node: ts.Node) => {
      // Extract imports
      if (ts.isImportDeclaration(node)) {
        const importText = node.getText(sourceFile);
        context.imports.push(importText);
      }

      // Extract exports
      if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
        const exportText = node.getText(sourceFile);
        context.moduleExports.push(exportText);
      }

      // Extract class context
      if (ts.isClassDeclaration(node) && node.name) {
        const extendsClause = node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword)
          ?.types[0]?.getText(sourceFile);
        const implementsClause = node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ImplementsKeyword)
          ?.types.map(t => t.getText(sourceFile));
        
        context.classContext = {
          className: node.name.text,
          methods: [],
          properties: [],
          ...(extendsClause && { extends: extendsClause }),
          ...(implementsClause && { implements: implementsClause })
        };

        // Extract class members
        node.members.forEach(member => {
          if (ts.isMethodDeclaration(member) && member.name) {
            context.classContext!.methods.push(member.name.getText(sourceFile));
          }
          if (ts.isPropertyDeclaration(member) && member.name) {
            context.classContext!.properties.push(member.name.getText(sourceFile));
          }
        });
      }

      // Extract surrounding functions
      if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) {
        const nodeText = node.getText(sourceFile);
        const signature = nodeText.split('{')[0]?.trim() || nodeText.trim();
        context.surroundingFunctions.push({
          name: node.name.getText(sourceFile),
          signature,
          purpose: this.inferFunctionPurpose(node.name.getText(sourceFile))
        });
      }

      // Detect code style patterns
      if (ts.isArrowFunction(node)) {
        context.codeStyle.preferArrowFunctions = true;
      }

      if (node.getFullText(sourceFile).includes('async ') || node.getFullText(sourceFile).includes('await ')) {
        context.codeStyle.useAsyncAwait = true;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Analyze indentation style from the first few lines
    const lines = sourceFile.getFullText().split('\n').slice(0, 20);
    for (const line of lines) {
      if (line.match(/^\t/)) {
        context.codeStyle.indentation = 'tabs';
        break;
      } else if (line.match(/^  +/)) {
        const spaces = line.match(/^( +)/)?.[1]?.length || 2;
        context.codeStyle.indentSize = spaces;
        break;
      }
    }

    return context;
  }

  /**
   * Find function stubs that need implementation
   */
  private findFunctionStubs(sourceFile: ts.SourceFile, context: CodeContext): EnhancedFunctionStub[] {
    const stubs: EnhancedFunctionStub[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        const stub = this.analyzeFunctionNode(node, sourceFile, context);
        if (stub) {
          stubs.push(stub);
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return stubs;
  }

  /**
   * Analyze a function node to create an enhanced stub
   */
  private analyzeFunctionNode(
    node: ts.FunctionDeclaration | ts.MethodDeclaration,
    sourceFile: ts.SourceFile,
    context: CodeContext
  ): EnhancedFunctionStub | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const bodyText = node.body?.getFullText(sourceFile) || '';

    // Only process functions that need implementation
    if (!this.needsImplementation(bodyText)) {
      return null;
    }

    // Extract parameter information
    const parameters = node.parameters.map(param => {
      const defaultValue = param.initializer?.getText(sourceFile);
      return {
        name: param.name.getText(sourceFile),
        type: param.type?.getText(sourceFile) || 'any',
        isOptional: !!param.questionToken,
        ...(defaultValue && { defaultValue })
      };
    });

    // Extract return type
    const returnType = node.type?.getText(sourceFile) || 'any';

    // Get position information
    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    const position = sourceFile.getLineAndCharacterOfPosition(start);

    // Extract description from TODO comments
    const description = this.extractTodoDescription(bodyText);

    // Perform type inference
    const typeInfo = this.inferTypes(node, sourceFile, context);

    // Generate implementation templates
    const templates = this.generateTemplates(name, parameters, returnType, context);

    return {
      name,
      parameters,
      returnType,
      ...(description && { description }),
      position: {
        start,
        end,
        line: position.line + 1
      },
      context,
      typeInfo,
      templates
    };
  }

  /**
   * Check if a function needs implementation
   */
  private needsImplementation(bodyText: string): boolean {
    if (!bodyText) return true;

    // Remove comments and normalize whitespace
    const cleaned = bodyText
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Check for empty or placeholder patterns
    const emptyPatterns = [
      '{}',
      '{ }',
      '{ return; }',
      '{ throw new Error("Not implemented"); }',
      '{ throw new Error(\'Not implemented\'); }',
      '{ // TODO }',
      '{ /* TODO */ }'
    ];

    return emptyPatterns.some(pattern => cleaned === pattern || cleaned.includes(pattern)) ||
           this.containsTodoComment(bodyText);
  }

  /**
   * Check if function body contains TODO comments
   */
  private containsTodoComment(bodyText: string): boolean {
    return /\/\/\s*TODO|\/\*\s*TODO|\/\/\s*FIXME|\/\*\s*FIXME/i.test(bodyText);
  }

  /**
   * Extract TODO description from function body
   */
  private extractTodoDescription(bodyText: string): string | undefined {
    const todoMatch = bodyText.match(/\/\/\s*TODO:?\s*(.+)|\/\*\s*TODO:?\s*(.+?)\s*\*\//i);
    if (!todoMatch) return undefined;
    const description = todoMatch[1] || todoMatch[2];
    return description ? description.trim() : undefined;
  }

  /**
   * Infer types and usage patterns for function parameters and return type
   */
  private inferTypes(
    node: ts.FunctionDeclaration | ts.MethodDeclaration,
    sourceFile: ts.SourceFile,
    context: CodeContext
  ): TypeInformation {
    const parameterTypes = node.parameters.map(param => {
      const name = param.name.getText(sourceFile);
      const declaredType = param.type?.getText(sourceFile) || 'any';
      
      return {
        name,
        type: declaredType,
        isOptional: !!param.questionToken,
        hasDefault: !!param.initializer,
        inferredUsage: this.inferParameterUsage(name)
      };
    });

    const declaredReturnType = node.type?.getText(sourceFile) || 'any';
    const inferredReturnType = this.inferReturnType(node.name?.getText(sourceFile) || '', parameterTypes);

    return {
      parameterTypes,
      returnType: {
        declared: declaredReturnType,
        inferred: inferredReturnType.type,
        confidence: inferredReturnType.confidence
      }
    };
  }

  /**
   * Infer parameter usage patterns from name
   */
  private inferParameterUsage(paramName: string): string {
    const name = paramName.toLowerCase();
    
    if (name.includes('id') || name.includes('key')) return 'identifier';
    if (name.includes('data') || name.includes('obj')) return 'object';
    if (name.includes('arr') || name.includes('list')) return 'array';
    if (name.includes('str') || name.includes('text')) return 'string';
    if (name.includes('num') || name.includes('count')) return 'number';
    if (name.includes('bool') || name.includes('flag')) return 'boolean';
    if (name.includes('func') || name.includes('callback')) return 'function';
    if (name.includes('config') || name.includes('options')) return 'configuration';
    
    return 'general';
  }

  /**
   * Infer return type from function name and parameters
   */
  private inferReturnType(functionName: string, parameters: any[]): { type: string; confidence: number } {
    const name = functionName.toLowerCase();
    
    // Getter patterns
    if (name.startsWith('get') || name.startsWith('find') || name.startsWith('fetch')) {
      return { type: 'T | undefined', confidence: 0.8 };
    }
    
    // Boolean patterns
    if (name.startsWith('is') || name.startsWith('has') || name.startsWith('can') || name.startsWith('should')) {
      return { type: 'boolean', confidence: 0.9 };
    }
    
    // Setter patterns
    if (name.startsWith('set') || name.startsWith('update') || name.startsWith('save')) {
      return { type: 'void', confidence: 0.8 };
    }
    
    // Creator patterns
    if (name.startsWith('create') || name.startsWith('make') || name.startsWith('build')) {
      return { type: 'T', confidence: 0.7 };
    }
    
    // Array operations
    if (name.includes('filter') || name.includes('map') || name.includes('find')) {
      return { type: 'T[]', confidence: 0.8 };
    }
    
    // Async patterns
    if (name.includes('async') || name.includes('await')) {
      return { type: 'Promise<T>', confidence: 0.9 };
    }
    
    return { type: 'any', confidence: 0.3 };
  }

  /**
   * Generate implementation templates based on function characteristics
   */
  private generateTemplates(
    name: string,
    parameters: any[],
    returnType: string,
    context: CodeContext
  ): ImplementationTemplate[] {
    const templates: ImplementationTemplate[] = [];
    const purpose = this.inferFunctionPurpose(name);
    
    switch (purpose) {
      case 'getter':
        templates.push(this.createGetterTemplate(name, parameters, returnType, context));
        break;
      case 'setter':
        templates.push(this.createSetterTemplate(name, parameters, returnType, context));
        break;
      case 'validator':
        templates.push(this.createValidatorTemplate(name, parameters, returnType, context));
        break;
      case 'processor':
        templates.push(this.createProcessorTemplate(name, parameters, returnType, context));
        break;
      case 'calculator':
        templates.push(this.createCalculatorTemplate(name, parameters, returnType, context));
        break;
      default:
        templates.push(this.createGenericTemplate(name, parameters, returnType, context));
    }
    
    return templates;
  }

  /**
   * Infer function purpose from name
   */
  private inferFunctionPurpose(name: string): string {
    const lower = name.toLowerCase();
    
    if (lower.startsWith('get') || lower.startsWith('find') || lower.startsWith('fetch')) return 'getter';
    if (lower.startsWith('set') || lower.startsWith('update')) return 'setter';
    if (lower.startsWith('is') || lower.startsWith('validate') || lower.startsWith('check')) return 'validator';
    if (lower.includes('process') || lower.includes('transform') || lower.includes('convert')) return 'processor';
    if (lower.includes('calculate') || lower.includes('compute') || lower.includes('sum')) return 'calculator';
    
    return 'generic';
  }

  /**
   * Create getter implementation template
   */
  private createGetterTemplate(name: string, parameters: any[], returnType: string, context: CodeContext): ImplementationTemplate {
    const indent = context.codeStyle.indentation === 'tabs' ? '\t' : ' '.repeat(context.codeStyle.indentSize);
    const semi = context.codeStyle.useSemicolons ? ';' : '';
    
    let implementation: string;
    
    if (context.classContext) {
      const propertyName = name.replace(/^get/, '').toLowerCase();
      implementation = `{
${indent}return this.${propertyName}${semi}
}`;
    } else {
      implementation = `{
${indent}// TODO: Implement getter logic
${indent}throw new Error("Not implemented")${semi}
}`;
    }
    
    return {
      name: 'Getter Pattern',
      pattern: implementation,
      confidence: 0.8,
      variables: {
        propertyName: name.replace(/^get/, '').toLowerCase()
      }
    };
  }

  /**
   * Create setter implementation template
   */
  private createSetterTemplate(name: string, parameters: any[], returnType: string, context: CodeContext): ImplementationTemplate {
    const indent = context.codeStyle.indentation === 'tabs' ? '\t' : ' '.repeat(context.codeStyle.indentSize);
    const semi = context.codeStyle.useSemicolons ? ';' : '';
    
    let implementation: string;
    
    if (context.classContext && parameters.length > 0) {
      const propertyName = name.replace(/^set/, '').toLowerCase();
      const paramName = parameters[0].name;
      implementation = `{
${indent}this.${propertyName} = ${paramName}${semi}
}`;
    } else {
      implementation = `{
${indent}// TODO: Implement setter logic
${indent}throw new Error("Not implemented")${semi}
}`;
    }
    
    return {
      name: 'Setter Pattern',
      pattern: implementation,
      confidence: 0.8,
      variables: {
        propertyName: name.replace(/^set/, '').toLowerCase(),
        paramName: parameters[0]?.name || 'value'
      }
    };
  }

  /**
   * Create validator implementation template
   */
  private createValidatorTemplate(name: string, parameters: any[], returnType: string, context: CodeContext): ImplementationTemplate {
    const indent = context.codeStyle.indentation === 'tabs' ? '\t' : ' '.repeat(context.codeStyle.indentSize);
    const semi = context.codeStyle.useSemicolons ? ';' : '';
    
    const implementation = `{
${indent}// TODO: Add validation logic
${indent}if (!${parameters[0]?.name || 'input'}) {
${indent}${indent}return false${semi}
${indent}}
${indent}
${indent}// Add your validation rules here
${indent}return true${semi}
}`;
    
    return {
      name: 'Validator Pattern',
      pattern: implementation,
      confidence: 0.7,
      variables: {
        inputParam: parameters[0]?.name || 'input'
      }
    };
  }

  /**
   * Create processor implementation template
   */
  private createProcessorTemplate(name: string, parameters: any[], returnType: string, context: CodeContext): ImplementationTemplate {
    const indent = context.codeStyle.indentation === 'tabs' ? '\t' : ' '.repeat(context.codeStyle.indentSize);
    const semi = context.codeStyle.useSemicolons ? ';' : '';
    
    const implementation = `{
${indent}// TODO: Implement processing logic
${indent}const result = ${parameters[0]?.name || 'input'}${semi}
${indent}
${indent}// Add your processing logic here
${indent}
${indent}return result${semi}
}`;
    
    return {
      name: 'Processor Pattern',
      pattern: implementation,
      confidence: 0.6,
      variables: {
        inputParam: parameters[0]?.name || 'input'
      }
    };
  }

  /**
   * Create calculator implementation template
   */
  private createCalculatorTemplate(name: string, parameters: any[], returnType: string, context: CodeContext): ImplementationTemplate {
    const indent = context.codeStyle.indentation === 'tabs' ? '\t' : ' '.repeat(context.codeStyle.indentSize);
    const semi = context.codeStyle.useSemicolons ? ';' : '';
    
    const paramNames = parameters.map(p => p.name).join(', ');
    
    const implementation = `{
${indent}// TODO: Implement calculation logic
${indent}const result = 0${semi} // Replace with actual calculation
${indent}
${indent}// Example calculation using parameters: ${paramNames}
${indent}
${indent}return result${semi}
}`;
    
    return {
      name: 'Calculator Pattern',
      pattern: implementation,
      confidence: 0.7,
      variables: {
        parameters: paramNames
      }
    };
  }

  /**
   * Create generic implementation template
   */
  private createGenericTemplate(name: string, parameters: any[], returnType: string, context: CodeContext): ImplementationTemplate {
    const indent = context.codeStyle.indentation === 'tabs' ? '\t' : ' '.repeat(context.codeStyle.indentSize);
    const semi = context.codeStyle.useSemicolons ? ';' : '';
    
    let returnStatement = '';
    if (returnType !== 'void' && returnType !== 'undefined') {
      if (returnType === 'boolean') {
        returnStatement = `${indent}return false${semi}`;
      } else if (returnType === 'number') {
        returnStatement = `${indent}return 0${semi}`;
      } else if (returnType === 'string') {
        returnStatement = `${indent}return ''${semi}`;
      } else if (returnType.includes('[]')) {
        returnStatement = `${indent}return []${semi}`;
      } else if (returnType.includes('Promise')) {
        returnStatement = `${indent}return Promise.resolve()${semi}`;
      } else {
        returnStatement = `${indent}return null${semi}`;
      }
    }
    
    const implementation = `{
${indent}// TODO: Implement ${name} logic
${indent}throw new Error("Not implemented")${semi}
${returnStatement ? '\n' + returnStatement : ''}
}`;
    
    return {
      name: 'Generic Pattern',
      pattern: implementation,
      confidence: 0.5,
      variables: {
        functionName: name
      }
    };
  }

  /**
   * Generate enhanced implementation suggestions
   */
  public generateEnhancedImplementations(stub: EnhancedFunctionStub): EnhancedImplementationSuggestion[] {
    const suggestions: EnhancedImplementationSuggestion[] = [];
    
    for (const template of stub.templates) {
      suggestions.push({
        implementation: template.pattern,
        confidence: template.confidence,
        reasoning: `Generated using ${template.name} based on function name analysis and code context`,
        template: template.name,
        complexity: this.assessComplexity(stub),
        style: this.inferStyle(stub.context),
        estimatedLines: template.pattern.split('\n').length,
        dependencies: this.extractDependencies(template.pattern, stub.context)
      });
    }
    
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Assess implementation complexity
   */
  private assessComplexity(stub: EnhancedFunctionStub): 'simple' | 'medium' | 'complex' {
    const paramCount = stub.parameters.length;
    const hasComplexTypes = stub.parameters.some(p => p.type.includes('[]') || p.type.includes('<'));
    const isAsync = stub.returnType.includes('Promise');
    
    if (paramCount <= 2 && !hasComplexTypes && !isAsync) return 'simple';
    if (paramCount <= 5 && !isAsync) return 'medium';
    return 'complex';
  }

  /**
   * Infer coding style preference
   */
  private inferStyle(context: CodeContext): 'functional' | 'object-oriented' | 'procedural' {
    if (context.classContext) return 'object-oriented';
    if (context.codeStyle.preferArrowFunctions) return 'functional';
    return 'procedural';
  }

  /**
   * Extract required dependencies from implementation
   */
  private extractDependencies(implementation: string, context: CodeContext): string[] {
    const dependencies: string[] = [];
    
    // Check for common patterns that might require imports
    if (implementation.includes('Promise')) dependencies.push('Promise support');
    if (implementation.includes('async') || implementation.includes('await')) dependencies.push('async/await support');
    if (implementation.includes('this.')) dependencies.push('Class context');
    
    return dependencies;
  }
}
