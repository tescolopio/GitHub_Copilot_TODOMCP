import fs from 'fs-extra';
import path from 'path';
import glob from 'glob';
import { createLogger } from '../utils/logger';

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
        const files = glob.sync(pattern, {
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
          const marker = lineNumber === line ? '>>> ' : '    ';
          return `${marker}${String(lineNumber).padStart(4)}: ${lineContent}`;
        })
        .join('\n');

      const result = `Context for ${path.basename(filePath)}:${line}\n` +
        `${'='.repeat(50)}\n` +
        contextContent + '\n' +
        `${'='.repeat(50)}`;

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
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
}
