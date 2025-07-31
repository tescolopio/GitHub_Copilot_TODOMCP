import * as ts from 'typescript';
import { logger } from './logger';

export interface FunctionStub {
  name: string;
  parameters: Array<{
    name: string;
    type: string;
  }>;
  returnType: string;
  description?: string | undefined;
  position: {
    start: number;
    end: number;
    line: number;
  };
}

export interface ImplementationSuggestion {
  implementation: string;
  confidence: number;
  reasoning: string;
  dependencies?: string[];
}

/**
 * Analyzes function stubs and generates implementation suggestions
 */
export class FunctionImplementor {
  
  /**
   * Find function stubs (empty functions or TODO comments) in source code
   */
  public findFunctionStubs(sourceFile: ts.SourceFile): FunctionStub[] {
    const stubs: FunctionStub[] = [];
    const self = this;
    
    function visit(node: ts.Node) {
      // Look for function declarations with empty bodies or TODO comments
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        const stub = self.analyzeFunctionNode(node, sourceFile);
        if (stub) {
          stubs.push(stub);
        }
      }
      
      ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    return stubs;
  }
  
  /**
   * Analyze a function node to determine if it's a stub
   */
  private analyzeFunctionNode(node: ts.FunctionDeclaration | ts.MethodDeclaration, sourceFile: ts.SourceFile): FunctionStub | null {
    if (!node.name || !ts.isIdentifier(node.name)) return null;
    
    const name = node.name.text;
    const start = node.getStart();
    const end = node.getEnd();
    const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
    
    // Extract parameters
    const parameters = node.parameters.map(param => {
      const paramName = param.name?.getText() || 'unknown';
      const paramType = param.type?.getText() || 'any';
      return { name: paramName, type: paramType };
    });
    
    // Extract return type
    const returnType = node.type?.getText() || 'void';
    
    // Check if function body is empty or contains TODO
    const body = node.body;
    if (!body) {
      // Abstract method or interface - consider it a stub
      return { name, parameters, returnType, position: { start, end, line } };
    }
    
    const bodyText = body.getText();
    const isEmpty = this.isFunctionBodyEmpty(bodyText);
    const hasTodo = this.containsTodoComment(bodyText);
    
    if (isEmpty || hasTodo) {
      const description = hasTodo ? this.extractTodoDescription(bodyText) : undefined;
      return { name, parameters, returnType, description, position: { start, end, line } };
    }
    
    return null;
  }
  
  /**
   * Check if function body is effectively empty
   */
  private isFunctionBodyEmpty(bodyText: string): boolean {
    // Remove comments and whitespace
    const cleaned = bodyText
      .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove /* */ comments
      .replace(/\/\/.*$/gm, '')          // Remove // comments
      .replace(/\s+/g, ' ')              // Normalize whitespace
      .trim();
    
    // Check for common empty patterns
    const emptyPatterns = [
      '{}',
      '{ }',
      '{ return; }',
      '{ throw new Error("Not implemented"); }',
      '{ throw new Error(\'Not implemented\'); }'
    ];
    
    return emptyPatterns.some(pattern => 
      cleaned === pattern || cleaned.includes(pattern)
    );
  }
  
  /**
   * Check if function body contains TODO comments
   */
  private containsTodoComment(bodyText: string): boolean {
    const todoPattern = /\/\/\s*TODO|\/\*\s*TODO|\/\/\s*FIXME|\/\*\s*FIXME/i;
    return todoPattern.test(bodyText);
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
   * Generate implementation suggestions for a function stub
   */
  public generateImplementation(stub: FunctionStub): ImplementationSuggestion[] {
    const suggestions: ImplementationSuggestion[] = [];
    
    // Analyze function name and parameters to infer purpose
    const purpose = this.inferFunctionPurpose(stub);
    
    switch (purpose.category) {
      case 'getter':
        suggestions.push(this.generateGetterImplementation(stub, purpose));
        break;
      case 'setter':
        suggestions.push(this.generateSetterImplementation(stub, purpose));
        break;
      case 'validator':
        suggestions.push(this.generateValidatorImplementation(stub, purpose));
        break;
      case 'calculator':
        suggestions.push(this.generateCalculatorImplementation(stub, purpose));
        break;
      case 'formatter':
        suggestions.push(this.generateFormatterImplementation(stub, purpose));
        break;
      case 'converter':
        suggestions.push(this.generateConverterImplementation(stub, purpose));
        break;
      default:
        suggestions.push(this.generateGenericImplementation(stub, purpose));
    }
    
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Infer the purpose of a function from its name and signature
   */
  private inferFunctionPurpose(stub: FunctionStub): { category: string; details: any } {
    const name = stub.name.toLowerCase();
    const hasReturn = stub.returnType !== 'void';
    const paramCount = stub.parameters.length;
    
    // Common function patterns
    if (name.startsWith('get') && hasReturn && paramCount <= 1) {
      return { category: 'getter', details: { property: name.substring(3) } };
    }
    
    if (name.startsWith('set') && !hasReturn && paramCount === 1) {
      return { category: 'setter', details: { property: name.substring(3) } };
    }
    
    if (name.includes('valid') || name.includes('check') || name.includes('verify')) {
      return { category: 'validator', details: { target: name } };
    }
    
    if (name.includes('calculat') || name.includes('comput') || name.includes('sum')) {
      return { category: 'calculator', details: { operation: name } };
    }
    
    if (name.includes('format') || name.includes('display') || name.includes('render')) {
      return { category: 'formatter', details: { target: name } };
    }
    
    if (name.includes('convert') || name.includes('transform') || name.includes('parse')) {
      return { category: 'converter', details: { operation: name } };
    }
    
    return { category: 'generic', details: { name } };
  }
  
  /**
   * Generate getter implementation
   */
  private generateGetterImplementation(stub: FunctionStub, purpose: any): ImplementationSuggestion {
    const property = purpose.details.property.toLowerCase();
    const returnType = stub.returnType;
    
    let implementation = '';
    if (stub.parameters.length === 0) {
      // Simple property getter
      implementation = `{\n    return this.${property};\n  }`;
    } else {
      // Getter with parameter (e.g., getItem(id))
      const param = stub.parameters[0];
      if (param) {
        implementation = `{\n    // TODO: Implement ${property} retrieval logic\n    return this.${property}[${param.name}];\n  }`;
      } else {
        implementation = `{\n    // TODO: Implement ${property} retrieval logic\n    return this.${property};\n  }`;
      }
    }
    
    return {
      implementation,
      confidence: 0.8,
      reasoning: `Inferred as getter for property '${property}' based on naming convention`,
      dependencies: []
    };
  }
  
  /**
   * Generate setter implementation
   */
  private generateSetterImplementation(stub: FunctionStub, purpose: any): ImplementationSuggestion {
    const property = purpose.details.property.toLowerCase();
    const param = stub.parameters[0];
    
    if (!param) {
      return {
        implementation: `{\n    // TODO: Missing parameter for setter\n  }`,
        confidence: 0.3,
        reasoning: 'Setter requires a parameter',
        dependencies: []
      };
    }
    
    const implementation = `{\n    this.${property} = ${param.name};\n  }`;
    
    return {
      implementation,
      confidence: 0.8,
      reasoning: `Inferred as setter for property '${property}' based on naming convention`,
      dependencies: []
    };
  }
  
  /**
   * Generate validator implementation
   */
  private generateValidatorImplementation(stub: FunctionStub, purpose: any): ImplementationSuggestion {
    const param = stub.parameters[0];
    const returnType = stub.returnType;
    
    if (!param) {
      return {
        implementation: `{\n    // TODO: Missing parameter for validation\n  }`,
        confidence: 0.3,
        reasoning: 'Validator requires a parameter',
        dependencies: []
      };
    }
    
    let implementation = '';
    if (returnType === 'boolean') {
      implementation = `{\n    // TODO: Implement validation logic\n    return ${param.name} != null;\n  }`;
    } else {
      implementation = `{\n    // TODO: Implement validation logic\n    if (!${param.name}) {\n      throw new Error('Invalid ${param.name}');\n    }\n  }`;
    }
    
    return {
      implementation,
      confidence: 0.7,
      reasoning: 'Inferred as validator based on function name pattern',
      dependencies: []
    };
  }
  
  /**
   * Generate calculator implementation
   */
  private generateCalculatorImplementation(stub: FunctionStub, purpose: any): ImplementationSuggestion {
    const params = stub.parameters;
    const returnType = stub.returnType;
    
    let implementation = '';
    if (params.length === 2 && returnType === 'number' && params[0] && params[1]) {
      implementation = `{\n    // TODO: Implement calculation logic\n    return ${params[0].name} + ${params[1].name};\n  }`;
    } else {
      implementation = `{\n    // TODO: Implement calculation logic\n    let result = 0;\n    // Add calculation here\n    return result;\n  }`;
    }
    
    return {
      implementation,
      confidence: 0.6,
      reasoning: 'Inferred as calculation function based on naming pattern',
      dependencies: []
    };
  }
  
  /**
   * Generate formatter implementation
   */
  private generateFormatterImplementation(stub: FunctionStub, purpose: any): ImplementationSuggestion {
    const param = stub.parameters[0];
    const returnType = stub.returnType;
    
    if (!param) {
      return {
        implementation: `{\n    // TODO: Missing parameter for formatting\n  }`,
        confidence: 0.3,
        reasoning: 'Formatter requires a parameter',
        dependencies: []
      };
    }
    
    let implementation = '';
    if (returnType === 'string') {
      implementation = `{\n    // TODO: Implement formatting logic\n    return String(${param.name});\n  }`;
    } else {
      implementation = `{\n    // TODO: Implement formatting logic\n    console.log(${param.name});\n  }`;
    }
    
    return {
      implementation,
      confidence: 0.6,
      reasoning: 'Inferred as formatter based on function name pattern',
      dependencies: []
    };
  }
  
  /**
   * Generate converter implementation
   */
  private generateConverterImplementation(stub: FunctionStub, purpose: any): ImplementationSuggestion {
    const param = stub.parameters[0];
    const returnType = stub.returnType;
    
    if (!param) {
      return {
        implementation: `{\n    // TODO: Missing parameter for conversion\n  }`,
        confidence: 0.3,
        reasoning: 'Converter requires a parameter',
        dependencies: []
      };
    }
    
    const implementation = `{\n    // TODO: Implement conversion logic\n    try {\n      return ${returnType === 'number' ? 'Number' : returnType === 'string' ? 'String' : 'Object'}(${param.name});\n    } catch (error) {\n      throw new Error(\`Conversion failed: \${error.message}\`);\n    }\n  }`;
    
    return {
      implementation,
      confidence: 0.6,
      reasoning: 'Inferred as converter based on function name pattern',
      dependencies: []
    };
  }
  
  /**
   * Generate generic implementation
   */
  private generateGenericImplementation(stub: FunctionStub, purpose: any): ImplementationSuggestion {
    const returnType = stub.returnType;
    
    let implementation = '';
    if (returnType === 'void') {
      implementation = `{\n    // TODO: Implement ${stub.name} logic\n    console.log('${stub.name} called');\n  }`;
    } else if (returnType === 'boolean') {
      implementation = `{\n    // TODO: Implement ${stub.name} logic\n    return true;\n  }`;
    } else if (returnType === 'number') {
      implementation = `{\n    // TODO: Implement ${stub.name} logic\n    return 0;\n  }`;
    } else if (returnType === 'string') {
      implementation = `{\n    // TODO: Implement ${stub.name} logic\n    return '';\n  }`;
    } else {
      implementation = `{\n    // TODO: Implement ${stub.name} logic\n    throw new Error('Not implemented');\n  }`;
    }
    
    return {
      implementation,
      confidence: 0.4,
      reasoning: 'Generic implementation based on return type',
      dependencies: []
    };
  }
}
