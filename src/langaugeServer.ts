'use strict';

import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    StreamInfo
} from 'vscode-languageclient/node';
import * as path from 'path';
import * as fs from 'fs';
import { log } from './log';
import * as net from 'net';
import * as os from 'os';

/**
 * XMake语言服务器管理器
 */
export class XMakeLanguageServer {
    private client?: LanguageClient;
    private isStarted: boolean = false;

    constructor(private context: vscode.ExtensionContext) {
    }

    /**
     * 启动语言服务器
     */
    public async start(): Promise<void> {
        if (this.isStarted) {
            return;
        }

        try {
            // 创建服务器选项
            const serverOptions = this.createServerOptions();
            if (!serverOptions) {
                log.error('Failed to create server options');
                return;
            }

            // 创建客户端选项
            const clientOptions = this.createClientOptions();

            // 创建语言客户端
            this.client = new LanguageClient(
                'xmake_ls',
                'XMake Language Server',
                serverOptions,
                clientOptions
            );

            // 启动客户端
            await this.client.start();
            this.isStarted = true;

            log.verbose('XMake Language Server started successfully');

        } catch (error) {
            log.error(`Failed to start XMake Language Server: ${error}`);
            this.isStarted = false;
        }
    }

    /**
     * 停止语言服务器
     */
    public async stop(): Promise<void> {
        if (!this.client || !this.isStarted) {
            return;
        }

        try {
            await this.client.stop();
            this.client = undefined;
            this.isStarted = false;
            log.verbose('XMake Language Server stopped');
        } catch (error) {
            log.error(`Failed to stop XMake Language Server: ${error}`);
        }
    }

    /**
     * 重启语言服务器
     */
    public async restart(): Promise<void> {
        log.verbose('Restarting XMake Language Server...');
        await this.stop();
        await this.start();
    }

    /**
     * 检查语言服务器是否正在运行
     */
    public isRunning(): boolean {
        return this.isStarted && this.client !== undefined;
    }

    /**
     * 创建服务器选项
     */
    private createServerOptions(): ServerOptions | null {
        try {
            let debug = process.env['XMAKE_DEV'] === 'true'
            if (debug) {
                const connectionInfo = {
                    port: 5007,
                };
                const serverOptions = () => {
                    // Connect to language server via socket
                    let socket = net.connect(connectionInfo);
                    let result: StreamInfo = {
                        writer: socket,
                        reader: socket as NodeJS.ReadableStream
                    };
                    socket.on("close", () => {
                        console.log("client connect error!");
                    });
                    return Promise.resolve(result);
                };

                return serverOptions
            } else {
                // 使用xmake_ls作为语言服务器
                let platform = os.platform();
                let executableName = platform === 'win32' ? 'xmake_ls.exe' : 'xmake_ls';
                let configExecutablePath = path.join(this.context.extensionPath, 'server', executableName);

                if (platform !== 'win32') {
                    fs.chmodSync(configExecutablePath, '777');
                }
                const serverOptions: ServerOptions = {
                    command: configExecutablePath,
                    args: [],
                    options: { env: process.env }
                };

                return serverOptions;
            }
        } catch (error) {
            log.error(`Failed to create server options: ${error}`);
            return null;
        }
    }

    /**
     * 创建客户端选项
     */
    private createClientOptions(): LanguageClientOptions {
        return {
            // 为xmake.lua文件注册语言服务器
            documentSelector: [
                { scheme: 'file', language: 'xmake' },
                { scheme: 'file', pattern: '**/*.lua' },
            ],
        };
    }

    /**
     * 发送自定义请求到语言服务器
     */
    public async sendRequest(method: string, params?: any): Promise<any> {
        if (!this.client || !this.isStarted) {
            throw new Error('Language server is not running');
        }

        try {
            return await this.client.sendRequest(method, params);
        } catch (error) {
            log.error(`Failed to send request ${method}: ${error}`);
            throw error;
        }
    }

    /**
     * 发送通知到语言服务器
     */
    public sendNotification(method: string, params?: any): void {
        if (!this.client || !this.isStarted) {
            log.info('Cannot send notification: Language server is not running');
            return;
        }

        try {
            this.client.sendNotification(method, params);
        } catch (error) {
            log.error(`Failed to send notification ${method}: ${error}`);
        }
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        if (this.client) {
            this.client.stop();
            this.client = undefined;
        }
        this.isStarted = false;
    }
}

/**
 * 注册语言服务器相关命令
 */
export function registerLanguageServerCommands(
    context: vscode.ExtensionContext,
    languageServer: XMakeLanguageServer
): void {
    // 注册重启语言服务器命令
    const restartCommand = vscode.commands.registerCommand(
        'xmake.restartLanguageServer',
        async () => {
            try {
                await languageServer.restart();
                vscode.window.showInformationMessage('XMake Language Server restarted successfully');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to restart language server: ${error}`);
            }
        }
    );

    // 注册停止语言服务器命令
    const stopCommand = vscode.commands.registerCommand(
        'xmake.stopLanguageServer',
        async () => {
            try {
                await languageServer.stop();
                vscode.window.showInformationMessage('XMake Language Server stopped');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to stop language server: ${error}`);
            }
        }
    );

    // 注册启动语言服务器命令
    const startCommand = vscode.commands.registerCommand(
        'xmake.startLanguageServer',
        async () => {
            try {
                await languageServer.start();
                vscode.window.showInformationMessage('XMake Language Server started successfully');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to start language server: ${error}`);
            }
        }
    );

    // 注册语言服务器状态命令
    const statusCommand = vscode.commands.registerCommand(
        'xmake.languageServerStatus',
        () => {
            const isRunning = languageServer.isRunning();
            const status = isRunning ? 'Running' : 'Stopped';
            vscode.window.showInformationMessage(`XMake Language Server Status: ${status}`);
        }
    );

    context.subscriptions.push(restartCommand, stopCommand, startCommand, statusCommand);
}
