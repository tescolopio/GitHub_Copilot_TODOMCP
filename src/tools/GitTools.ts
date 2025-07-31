import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { createLogger } from '../utils/logger';

const execAsync = promisify(exec);
const logger = createLogger('GitTools');

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  hasChanges: boolean;
}

export class GitTools {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  async getGitStatus(): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      logger.info(`Getting Git status for ${this.workspacePath}`);

      // Check if it's a git repository
      try {
        await execAsync('git rev-parse --git-dir', { cwd: this.workspacePath });
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: '❌ Not a Git repository',
            },
          ],
        };
      }

      // Get current branch
      const { stdout: branchOutput } = await execAsync('git branch --show-current', {
        cwd: this.workspacePath,
      });
      const branch = branchOutput.trim();

      // Get status
      const { stdout: statusOutput } = await execAsync('git status --porcelain', {
        cwd: this.workspacePath,
      });

      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      statusOutput.split('\n').forEach((line) => {
        if (!line) return;

        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status[0] !== ' ' && status[0] !== '?') {
          staged.push(file);
        }
        if (status[1] !== ' ' && status[1] !== '?') {
          unstaged.push(file);
        }
        if (status === '??') {
          untracked.push(file);
        }
      });

      // Get ahead/behind info
      let ahead = 0;
      let behind = 0;
      try {
        const { stdout: upstreamOutput } = await execAsync(
          `git rev-list --count --left-right @{u}...HEAD`,
          { cwd: this.workspacePath }
        );
        const [behindStr, aheadStr] = upstreamOutput.trim().split('\t');
        behind = parseInt(behindStr || '0', 10) || 0;
        ahead = parseInt(aheadStr || '0', 10) || 0;
      } catch {
        // No upstream branch or other error
      }

      const hasChanges = staged.length > 0 || unstaged.length > 0 || untracked.length > 0;

      const result = `📊 Git Status for ${path.basename(this.workspacePath)}\n` +
        `${'='.repeat(50)}\n` +
        `🌿 Branch: ${branch}\n` +
        `📡 Remote: ${ahead > 0 ? `${ahead} ahead` : ''}${behind > 0 ? ` ${behind} behind` : ''}\n` +
        `\n` +
        `📝 Changes:\n` +
        `  Staged: ${staged.length} files\n` +
        `  Unstaged: ${unstaged.length} files\n` +
        `  Untracked: ${untracked.length} files\n` +
        `\n` +
        (staged.length > 0 ? `📋 Staged files:\n${staged.map(f => `  + ${f}`).join('\n')}\n\n` : '') +
        (unstaged.length > 0 ? `📝 Unstaged files:\n${unstaged.map(f => `  * ${f}`).join('\n')}\n\n` : '') +
        (untracked.length > 0 ? `❓ Untracked files:\n${untracked.map(f => `  ? ${f}`).join('\n')}\n\n` : '') +
        `✅ Repository is ${hasChanges ? 'dirty' : 'clean'}`;

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      logger.error('Error getting Git status:', error);
      throw error;
    }
  }

  async createBranch(args: {
    workspacePath: string;
    branchName: string;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const { workspacePath, branchName } = args;
      logger.info(`Creating branch ${branchName} in ${workspacePath}`);

      // Validate branch name
      if (!/^[a-zA-Z0-9._/-]+$/.test(branchName)) {
        throw new Error('Invalid branch name. Only alphanumeric characters, dots, underscores, hyphens, and forward slashes are allowed.');
      }

      // Check if branch already exists
      try {
        await execAsync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
          cwd: workspacePath,
        });
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ Branch '${branchName}' already exists`,
            },
          ],
        };
      } catch {
        // Branch doesn't exist, which is what we want
      }

      // Get current branch for reference
      const { stdout: currentBranch } = await execAsync('git branch --show-current', {
        cwd: workspacePath,
      });

      // Create and switch to the new branch
      await execAsync(`git checkout -b ${branchName}`, {
        cwd: workspacePath,
      });

      const result = `✅ Successfully created and switched to branch '${branchName}'\n` +
        `📍 Created from: ${currentBranch.trim()}\n` +
        `🎯 Current branch: ${branchName}`;

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      logger.error('Error creating branch:', error);
      throw error;
    }
  }

  async commitChanges(args: {
    workspacePath: string;
    message: string;
    files?: string[];
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const { workspacePath, message, files } = args;
      logger.info(`Committing changes in ${workspacePath}`);

      // Stage all changes, including new and deleted files. This is more reliable.
      await execAsync('git add -A', { cwd: workspacePath });

      const commitCommand = `git commit -m "${message}"`;
      try {
        await execAsync(commitCommand, { cwd: workspacePath });
      } catch (error: any) {
        // It's normal for a commit to fail if there are no staged changes.
        // We'll log this and continue, rather than treating it as a fatal error.
        if (error.stdout && (error.stdout.includes('nothing to commit') || error.stdout.includes('no changes added to commit'))) {
          logger.warn('Nothing to commit, skipping commit.');
          return {
            content: [
              {
                type: 'text',
                text: '⚠️ Nothing to commit.',
              },
            ],
          };
        }
        // For other errors, we'll re-throw to be handled upstream.
        throw error;
      }

      const result = `✅ Successfully committed changes\n` +
        `📝 Message: ${message}\n` +
        `📁 Files: ${files ? files.join(', ') : 'all changes'}`;

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      logger.error('Error committing changes:', error);
      throw error;
    }
  }

  async gitStash(args: {
    workspacePath: string;
    message?: string;
    pop?: boolean;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const { workspacePath, message = 'MCP auto-stash', pop = false } = args;
      logger.info(`${pop ? 'Popping' : 'Creating'} stash in ${workspacePath}`);

      if (pop) {
        // Pop the latest stash
        await execAsync('git stash pop', { cwd: workspacePath });
        return {
          content: [
            {
              type: 'text',
              text: '✅ Successfully popped latest stash',
            },
          ],
        };
      } else {
        // Create a stash
        await execAsync(`git stash push -m "${message}"`, { cwd: workspacePath });
        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully created stash: ${message}`,
            },
          ],
        };
      }
    } catch (error) {
      logger.error('Error with git stash:', error);
      throw error;
    }
  }
}
