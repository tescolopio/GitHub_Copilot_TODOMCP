import * as vscode from 'vscode';
import * as path from 'path';
import { ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { MCPClient } from './mcpClient';

let client: MCPClient;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "todo-mcp" is now active!');

    const serverModule = context.asAbsolutePath(path.join('..', 'dist', 'server.js'));
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    client = new MCPClient(serverOptions);
    client.start();

    client.on('actionCompleted', (params) => {
        const { description, status } = params.action;
        if (status === 'completed') {
            vscode.window.showInformationMessage(`Action completed: ${description}`);
        } else {
            vscode.window.showWarningMessage(`Action failed: ${description}`);
        }
    });

    client.on('sessionCompleted', (params) => {
        const { reason } = params;
        vscode.window.showInformationMessage(`Session completed: ${reason}`);
        updateStatusBarItem('idle');
    });

    const startSessionCommand = vscode.commands.registerCommand('todo-mcp.startSession', async () => {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open.');
                return;
            }
            const workspacePath = workspaceFolders[0].uri.fsPath;
            await client.sendRequest('startAutoContinue', { workspacePath });
            vscode.window.showInformationMessage('Auto-Continue Session Started');
            updateStatusBarItem('running');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to start session: ${error.message}`);
            updateStatusBarItem('error');
        }
    });

    const stopSessionCommand = vscode.commands.registerCommand('todo-mcp.stopSession', async () => {
        try {
            // Assuming the session ID is managed by the extension
            // For now, let's assume we need to get it from somewhere, e.g., a stored state.
            // This part needs a proper implementation to track the active session ID.
            const sessionId = "some-active-session-id"; // Placeholder
            await client.sendRequest('stopAutoContinue', { sessionId });
            vscode.window.showInformationMessage('Auto-Continue Session Stopped');
            updateStatusBarItem('idle');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to stop session: ${error.message}`);
            updateStatusBarItem('error');
        }
    });

    const showHistoryCommand = vscode.commands.registerCommand('todo-mcp.showHistory', async () => {
        try {
            const history = await client.sendRequest('getSessionHistory');
            const doc = await vscode.workspace.openTextDocument({ content: JSON.stringify(history, null, 2), language: 'json' });
            await vscode.window.showTextDocument(doc);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to get session history: ${error.message}`);
        }
    });

    context.subscriptions.push(startSessionCommand, stopSessionCommand, showHistoryCommand);

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);
    updateStatusBarItem('idle');
    statusBarItem.show();
}

function updateStatusBarItem(state: 'idle' | 'running' | 'error'): void {
    if (!statusBarItem) {
        return;
    }
    switch (state) {
        case 'running':
            statusBarItem.text = `$(sync~spin) TODO MCP`;
            statusBarItem.tooltip = 'Auto-Continue Session is running';
            statusBarItem.command = 'todo-mcp.stopSession';
            break;
        case 'error':
            statusBarItem.text = `$(error) TODO MCP`;
            statusBarItem.tooltip = 'An error occurred';
            statusBarItem.command = 'todo-mcp.showHistory';
            break;
        case 'idle':
        default:
            statusBarItem.text = `$(check) TODO MCP`;
            statusBarItem.tooltip = 'Start Auto-Continue Session';
            statusBarItem.command = 'todo-mcp.startSession';
            break;
    }
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
