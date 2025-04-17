import { McpConnection, Context, ChatRequestParams, ShellRunCommandParams, ApplyEditParams } from '@modelcontextprotocol/sdk/server';
import { render } from 'ink';
import React from 'react';
import { Logger } from 'pino';
import { ActionApprovalComponent } from './components/ActionApprovalComponent';
import { checkPermission, savePermission } from './permissions';
import { runAgentLogic } from './agent/runAgentLogic';
import { executeShellCommandLocally } from './services/shellExecutor';
import { applyEditLocally, readFileLocally, writeFileLocally } from './services/fileEditor';
import { AppConfig } from './types/agent';
import { createLogger } from './utils/logger';
import { getConfig } from './utils/config';

// Map to hold context for each client connection
const clientContexts = new Map<string, Context>();
const logger = createLogger('mcp-handlers');

/**
 * Registers all MCP method handlers for a client connection
 * @param connection The MCP connection
 * @param config Application configuration
 */
export function registerMethodHandlers(connection: McpConnection, config: AppConfig = getConfig()) {
    const connectionId = connection.connectionId;

    // Cleanup context on disconnect
    connection.onDisconnect(() => {
        clientContexts.delete(connectionId);
        logger.info(`Context cleared for disconnected client: ${connectionId}`);
    });

    // --- Core Method Handlers ---

    // context/setContext: Notification from client to set/update context
    connection.onNotification('context/setContext', (params: Context) => {
        logger.info(`Received context update for ${connectionId}`);
        clientContexts.set(connectionId, params);
    });

    // chat/request: Request from client to process a chat message
    connection.onRequest('chat/request', async (params: ChatRequestParams) => {
        logger.info(`Received chat/request from ${connectionId}`);
        const context = clientContexts.get(connectionId);
        if (!context) {
            logger.error(`Error: Context not set for connection ${connectionId}. Rejecting chat/request.`);
            throw { code: -32000, message: 'Context not set. Please send context/setContext first.' };
        }

        try {
            // Delegate processing to the agent logic function
            await runAgentLogic(connection, context, params, logger, config);
            
            // Return an empty object to acknowledge the request
            // The actual responses will be sent as notifications by runAgentLogic
            return {};
        } catch (error: any) {
            logger.error({ err: error }, `Error processing chat/request for ${connectionId}`);
            throw { code: -32001, message: `Agent error: ${error.message || 'Unknown error'}` };
        }
    });

    // --- Handlers for Client-Initiated Actions (Require Server Operator Approval) ---

    // shell/runCommand: Request from client to run a shell command on the server
    connection.onRequest('shell/runCommand', async (params: ShellRunCommandParams): Promise<{ approved: boolean; stdout?: string; stderr?: string; exitCode?: number }> => {
        const commandToRun = params.command;
        const cwd = params.cwd || process.cwd();
        logger.info(`Client ${connectionId} requests server to run command: "${commandToRun}" in ${cwd}`);

        const actionType = 'shell/runCommand';
        const actionDetails = { command: commandToRun, cwd }; // Use structured details for permissions

        // 1. Check persistent permissions
        const hasPersistedPermission = await checkPermission(actionType, actionDetails);
        if (hasPersistedPermission) {
            logger.info(`Persistent permission found for command: "${commandToRun}". Auto-approving.`);
            
            // Execute the command locally
            try {
                const result = await executeShellCommandLocally(commandToRun, cwd);
                return { 
                    approved: true, 
                    stdout: result.stdout, 
                    stderr: result.stderr, 
                    exitCode: result.exitCode 
                };
            } catch (execError: any) {
                logger.error({ err: execError }, `Execution failed for auto-approved command: ${commandToRun}`);
                throw { code: -32002, message: `Command execution failed: ${execError.message}` };
            }
        }

        // 2. Prompt user running the server via Ink UI
        logger.info(`Prompting server operator for approval for command: "${commandToRun}"`);
        return new Promise((resolve, reject) => {
            const { unmount, clear } = render(
                React.createElement(ActionApprovalComponent, {
                    actionType: 'Run Shell Command on Server',
                    actionDetails: `Command: ${commandToRun}\nDirectory: ${cwd}`,
                    contextInfo: `Requested by client ${connectionId}.`,
                    onDecide: async (approved: boolean, remember: boolean) => {
                        clear(); // Clear the Ink UI
                        unmount(); // Unmount the component
                        
                        if (approved) {
                            logger.info(`Server operator approved command: "${commandToRun}"`);
                            
                            // Save permission if requested
                            if (remember) {
                                await savePermission(actionType, actionDetails);
                            }
                            
                            // Execute locally after explicit approval
                            try {
                                const result = await executeShellCommandLocally(commandToRun, cwd);
                                resolve({ 
                                    approved: true, 
                                    stdout: result.stdout, 
                                    stderr: result.stderr, 
                                    exitCode: result.exitCode 
                                });
                            } catch (execError: any) {
                                logger.error({ err: execError }, `Execution failed for approved command: ${commandToRun}`);
                                // Reject the promise to send JSON-RPC error
                                reject({ code: -32002, message: `Command execution failed: ${execError.message}` });
                            }
                        } else {
                            logger.warn(`Server operator rejected command: "${commandToRun}"`);
                            resolve({ approved: false }); // Send rejection back to client
                        }
                    },
                })
            );
        });
    });

    // workspace/applyEdit: Request from client to edit a file on the server
    connection.onRequest('workspace/applyEdit', async (params: ApplyEditParams): Promise<{ applied: boolean }> => {
        const filePath = params.edit.documentChanges?.[0]?.textDocument?.uri.replace('file://', '') || '';
        const edits = params.edit.documentChanges?.[0]?.edits || [];
        
        if (!filePath) {
            throw { code: -32602, message: 'Invalid parameters: missing file path' };
        }
        
        logger.info(`Client ${connectionId} requests server to edit file: "${filePath}"`);

        const actionType = 'workspace/applyEdit';
        const actionDetails = { filePath, edits }; // Use structured details for permissions

        // 1. Check persistent permissions
        const hasPersistedPermission = await checkPermission(actionType, actionDetails);
        if (hasPersistedPermission) {
            logger.info(`Persistent permission found for editing file: "${filePath}". Auto-approving.`);
            
            // Apply edits locally
            try {
                const result = await applyEditLocally(filePath, edits);
                return { applied: result.success };
            } catch (editError: any) {
                logger.error({ err: editError }, `Edit failed for auto-approved file: ${filePath}`);
                throw { code: -32003, message: `File edit failed: ${editError.message}` };
            }
        }

        // 2. Prompt user running the server via Ink UI
        logger.info(`Prompting server operator for approval to edit file: "${filePath}"`);
        return new Promise((resolve, reject) => {
            const { unmount, clear } = render(
                React.createElement(ActionApprovalComponent, {
                    actionType: 'Edit File on Server',
                    actionDetails: `File: ${filePath}\nEdits: ${JSON.stringify(edits, null, 2)}`,
                    contextInfo: `Requested by client ${connectionId}.`,
                    onDecide: async (approved: boolean, remember: boolean) => {
                        clear(); // Clear the Ink UI
                        unmount(); // Unmount the component
                        
                        if (approved) {
                            logger.info(`Server operator approved editing file: "${filePath}"`);
                            
                            // Save permission if requested
                            if (remember) {
                                await savePermission(actionType, actionDetails);
                            }
                            
                            // Apply edits locally after explicit approval
                            try {
                                const result = await applyEditLocally(filePath, edits);
                                resolve({ applied: result.success });
                            } catch (editError: any) {
                                logger.error({ err: editError }, `Edit failed for approved file: ${filePath}`);
                                // Reject the promise to send JSON-RPC error
                                reject({ code: -32003, message: `File edit failed: ${editError.message}` });
                            }
                        } else {
                            logger.warn(`Server operator rejected editing file: "${filePath}"`);
                            resolve({ applied: false }); // Send rejection back to client
                        }
                    },
                })
            );
        });
    });

    // file/read: Request from client to read a file on the server
    connection.onRequest('file/read', async (params: { filePath: string }): Promise<{ content?: string; success: boolean; message: string }> => {
        const filePath = params.filePath;
        logger.info(`Client ${connectionId} requests to read file: "${filePath}"`);

        const actionType = 'file/read';
        const actionDetails = { filePath }; // Use structured details for permissions

        // 1. Check persistent permissions
        const hasPersistedPermission = await checkPermission(actionType, actionDetails);
        if (hasPersistedPermission) {
            logger.info(`Persistent permission found for reading file: "${filePath}". Auto-approving.`);
            
            // Read file locally
            try {
                return await readFileLocally(filePath);
            } catch (readError: any) {
                logger.error({ err: readError }, `Read failed for auto-approved file: ${filePath}`);
                throw { code: -32004, message: `File read failed: ${readError.message}` };
            }
        }

        // 2. Prompt user running the server via Ink UI
        logger.info(`Prompting server operator for approval to read file: "${filePath}"`);
        return new Promise((resolve, reject) => {
            const { unmount, clear } = render(
                React.createElement(ActionApprovalComponent, {
                    actionType: 'Read File on Server',
                    actionDetails: `File: ${filePath}`,
                    contextInfo: `Requested by client ${connectionId}.`,
                    onDecide: async (approved: boolean, remember: boolean) => {
                        clear(); // Clear the Ink UI
                        unmount(); // Unmount the component
                        
                        if (approved) {
                            logger.info(`Server operator approved reading file: "${filePath}"`);
                            
                            // Save permission if requested
                            if (remember) {
                                await savePermission(actionType, actionDetails);
                            }
                            
                            // Read file locally after explicit approval
                            try {
                                const result = await readFileLocally(filePath);
                                resolve(result);
                            } catch (readError: any) {
                                logger.error({ err: readError }, `Read failed for approved file: ${filePath}`);
                                // Reject the promise to send JSON-RPC error
                                reject({ code: -32004, message: `File read failed: ${readError.message}` });
                            }
                        } else {
                            logger.warn(`Server operator rejected reading file: "${filePath}"`);
                            resolve({ 
                                success: false, 
                                message: 'File read rejected by server operator' 
                            });
                        }
                    },
                })
            );
        });
    });

    // file/write: Request from client to write to a file on the server
    connection.onRequest('file/write', async (params: { filePath: string; content: string }): Promise<{ success: boolean; message: string }> => {
        const { filePath, content } = params;
        logger.info(`Client ${connectionId} requests to write to file: "${filePath}"`);

        const actionType = 'file/write';
        const actionDetails = { filePath, contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : '') }; // Use structured details for permissions

        // 1. Check persistent permissions
        const hasPersistedPermission = await checkPermission(actionType, actionDetails);
        if (hasPersistedPermission) {
            logger.info(`Persistent permission found for writing to file: "${filePath}". Auto-approving.`);
            
            // Write to file locally
            try {
                return await writeFileLocally(filePath, content);
            } catch (writeError: any) {
                logger.error({ err: writeError }, `Write failed for auto-approved file: ${filePath}`);
                throw { code: -32005, message: `File write failed: ${writeError.message}` };
            }
        }

        // 2. Prompt user running the server via Ink UI
        logger.info(`Prompting server operator for approval to write to file: "${filePath}"`);
        return new Promise((resolve, reject) => {
            const { unmount, clear } = render(
                React.createElement(ActionApprovalComponent, {
                    actionType: 'Write to File on Server',
                    actionDetails: `File: ${filePath}\nContent Preview: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`,
                    contextInfo: `Requested by client ${connectionId}.`,
                    onDecide: async (approved: boolean, remember: boolean) => {
                        clear(); // Clear the Ink UI
                        unmount(); // Unmount the component
                        
                        if (approved) {
                            logger.info(`Server operator approved writing to file: "${filePath}"`);
                            
                            // Save permission if requested
                            if (remember) {
                                await savePermission(actionType, actionDetails);
                            }
                            
                            // Write to file locally after explicit approval
                            try {
                                const result = await writeFileLocally(filePath, content);
                                resolve(result);
                            } catch (writeError: any) {
                                logger.error({ err: writeError }, `Write failed for approved file: ${filePath}`);
                                // Reject the promise to send JSON-RPC error
                                reject({ code: -32005, message: `File write failed: ${writeError.message}` });
                            }
                        } else {
                            logger.warn(`Server operator rejected writing to file: "${filePath}"`);
                            resolve({ 
                                success: false, 
                                message: 'File write rejected by server operator' 
                            });
                        }
                    },
                })
            );
        });
    });

    // Initialize notification
    connection.onRequest('initialize', async () => {
        logger.info(`Initializing client ${connectionId}`);
        return {
            capabilities: {
                // Define server capabilities here
                supportedMethods: [
                    'context/setContext',
                    'chat/request',
                    'shell/runCommand',
                    'workspace/applyEdit',
                    'file/read',
                    'file/write'
                ]
            }
        };
    });
}
