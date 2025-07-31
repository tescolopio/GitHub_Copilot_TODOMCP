import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

export class MCPClient {
    private client: LanguageClient | undefined;
    private serverOptions: ServerOptions;

    constructor(serverOptions: ServerOptions) {
        this.serverOptions = serverOptions;
    }

    public start() {
        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ scheme: 'file', language: '*' }],
            synchronize: {
                fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
            }
        };

        this.client = new LanguageClient(
            'todoMcpServer',
            'TODO MCP Server',
            this.serverOptions,
            clientOptions
        );

        this.client.start();
    }

    public stop(): Thenable<void> | undefined {
        if (this.client) {
            return this.client.stop();
        }
        return undefined;
    }

    public on(event: string, listener: (...args: any[]) => void): void {
        if (this.client) {
            this.client.onNotification(event, listener);
        }
    }

    public sendRequest(method: string, params?: any): Thenable<any> {
        if (this.client) {
            return this.client.sendRequest(method, params);
        }
        return Promise.reject('Client not initialized');
    }
}
