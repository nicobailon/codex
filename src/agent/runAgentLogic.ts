import { McpConnection, Context, ChatRequestParams } from '@modelcontextprotocol/sdk/server';
import { render } from 'ink';
import React from 'react';
import { Logger } from 'pino';
import { ActionApprovalComponent } from '../components/ActionApprovalComponent';
import { checkPermission, savePermission } from '../permissions';
import { callCodexApi } from './codexService';
import { parseActions } from './actionParser';
import { executeShellCommandLocally } from '../services/shellExecutor';
import { applyEditLocally, readFileLocally, writeFileLocally } from '../services/fileEditor';
import { ActionType, ParsedAction, AppConfig } from '../types/agent';

/**
 * Main agent logic to process chat requests
 * @param connection The MCP connection
 * @param context The client context
 * @param request The chat request parameters
 * @param logger Logger instance
 * @param config App configuration
 */
export async function runAgentLogic(
    connection: McpConnection,
    context: Context,
    request: ChatRequestParams,
    logger: Logger,
    config: AppConfig
) {
    const userMessage = request.message.text;
    const connectionId = connection.connectionId;
    logger.info(`Agent processing chat request for ${connectionId}`);

    // Send notification that processing is starting
    connection.sendNotification('window/logMessage', { 
        type: 'info', 
        message: 'Thinking...' 
    });

    try {
        // 1. Call the AI Model (Codex) with the user's message and context
        const codexResponseText = await callCodexApi(userMessage, context, config);
        
        // 2. Send the text response back to the client immediately
        connection.sendNotification('chat/response', { 
            message: { 
                role: 'assistant', 
                text: codexResponseText 
            } 
        });

        // 3. Parse the response for potential actions
        const potentialActions = parseActions(codexResponseText);

        if (potentialActions.length > 0) {
            logger.info(`Agent identified ${potentialActions.length} action(s). Seeking approval...`);
            connection.sendNotification('window/logMessage', { 
                type: 'info', 
                message: `Agent proposes ${potentialActions.length} action(s). Seeking approval...` 
            });
        } else {
            logger.info('Agent response contained no actions.');
            connection.sendNotification('window/logMessage', { 
                type: 'info', 
                message: 'No actions to execute. Processing complete.' 
            });
            return {}; // Exit early if no actions
        }

        // 4. Process each potential action sequentially
        let actionIndex = 0;
        for (const action of potentialActions) {
            actionIndex++;
            const actionLogPrefix = `[Action ${actionIndex}/${potentialActions.length}: ${action.type}]`;
            logger.info(`${actionLogPrefix} Processing proposed action.`);
            
            // Notify the client about the action
            connection.sendNotification('window/logMessage', { 
                type: 'info', 
                message: `${actionLogPrefix} Proposing: ${JSON.stringify(action.details)}` 
            });

            let approved = false;
            let rememberDecision = false;

            // 4a. Check for persistent permission
            const hasPersistedPermission = await checkPermission(action.type, action.details);
            if (hasPersistedPermission) {
                approved = true;
                logger.info(`${actionLogPrefix} Action auto-approved via saved permission.`);
                connection.sendNotification('window/logMessage', { 
                    type: 'info', 
                    message: `${actionLogPrefix} Auto-approved (saved permission).` 
                });
            } else {
                // 4b. Prompt server operator via Ink for approval
                logger.info(`${actionLogPrefix} Action requires server operator approval.`);
                connection.sendNotification('window/logMessage', { 
                    type: 'warning', 
                    message: `${actionLogPrefix} Requires your approval in the server terminal.` 
                });
                
                try {
                    // Format action details for display
                    const actionDetailsFormatted = typeof action.details === 'string' 
                        ? action.details 
                        : JSON.stringify(action.details, null, 2);
                    
                    // Prompt for approval using Ink component
                    approved = await new Promise<boolean>((resolve) => {
                        const { unmount, clear } = render(
                            React.createElement(ActionApprovalComponent, {
                                actionType: action.type,
                                actionDetails: actionDetailsFormatted,
                                contextInfo: `Proposed by agent in response to request from client ${connectionId}.`,
                                onDecide: (userApproved: boolean, remember: boolean) => {
                                    clear();
                                    unmount();
                                    rememberDecision = remember;
                                    resolve(userApproved);
                                },
                            })
                        );
                    });
                } catch (promptError: any) {
                    logger.error({ err: promptError }, `${actionLogPrefix} Error displaying approval prompt.`);
                    connection.sendNotification('window/logMessage', { 
                        type: 'error', 
                        message: `${actionLogPrefix} Error showing approval prompt: ${promptError.message}` 
                    });
                    approved = false; // Fail safe to rejection
                }
            }

            // 4c. Execute the action if approved
            if (approved) {
                logger.info(`${actionLogPrefix} Action approved. Executing locally...`);
                connection.sendNotification('window/logMessage', { 
                    type: 'info', 
                    message: `${actionLogPrefix} Approved. Executing...` 
                });
                
                // Save permission if requested
                if (rememberDecision && !hasPersistedPermission) {
                    await savePermission(action.type, action.details);
                    logger.info(`${actionLogPrefix} Permission saved for future instances of this action.`);
                }
                
                try {
                    // Execute the appropriate action based on type
                    switch (action.type) {
                        case ActionType.ShellRunCommand:
                            const commandDetails = action.details as any;
                            if (typeof commandDetails.command === 'string') {
                                const result = await executeShellCommandLocally(
                                    commandDetails.command, 
                                    commandDetails.cwd
                                );
                                
                                if (result.success) {
                                    logger.info(`${actionLogPrefix} Command executed successfully.`);
                                    connection.sendNotification('window/logMessage', { 
                                        type: 'info', 
                                        message: `${actionLogPrefix} Command completed successfully.` 
                                    });
                                    
                                    // Send the command output to the client
                                    connection.sendNotification('window/logMessage', { 
                                        type: 'info', 
                                        message: `${actionLogPrefix} Output:\n${result.stdout}\n${result.stderr}` 
                                    });
                                } else {
                                    logger.warn(`${actionLogPrefix} Command execution failed: ${result.message}`);
                                    connection.sendNotification('window/logMessage', { 
                                        type: 'warning', 
                                        message: `${actionLogPrefix} Command failed: ${result.message}\n${result.stderr}` 
                                    });
                                }
                            } else {
                                throw new Error('Invalid shell/runCommand details format');
                            }
                            break;
                            
                        case ActionType.WorkspaceApplyEdit:
                            const editDetails = action.details as any;
                            if (typeof editDetails.filePath === 'string' && Array.isArray(editDetails.edits)) {
                                const result = await applyEditLocally(
                                    editDetails.filePath, 
                                    editDetails.edits
                                );
                                
                                if (result.success) {
                                    logger.info(`${actionLogPrefix} File edits applied successfully.`);
                                    connection.sendNotification('window/logMessage', { 
                                        type: 'info', 
                                        message: `${actionLogPrefix} File edits applied successfully to ${editDetails.filePath}.` 
                                    });
                                } else {
                                    logger.warn(`${actionLogPrefix} File edit failed: ${result.message}`);
                                    connection.sendNotification('window/logMessage', { 
                                        type: 'warning', 
                                        message: `${actionLogPrefix} File edit failed: ${result.message}` 
                                    });
                                }
                            } else {
                                throw new Error('Invalid workspace/applyEdit details format');
                            }
                            break;
                            
                        case ActionType.FileRead:
                            const readDetails = action.details as any;
                            if (typeof readDetails.filePath === 'string') {
                                const result = await readFileLocally(readDetails.filePath);
                                
                                if (result.success && result.content) {
                                    logger.info(`${actionLogPrefix} File read successfully.`);
                                    connection.sendNotification('window/logMessage', { 
                                        type: 'info', 
                                        message: `${actionLogPrefix} File read successful. Content preview: ${result.content.substring(0, 100)}...` 
                                    });
                                    
                                    // Send the content to the client (could be done differently)
                                    connection.sendNotification('chat/response', { 
                                        message: { 
                                            role: 'assistant', 
                                            text: `Content of ${readDetails.filePath}:\n\n\`\`\`\n${result.content}\n\`\`\`` 
                                        } 
                                    });
                                } else {
                                    logger.warn(`${actionLogPrefix} File read failed: ${result.message}`);
                                    connection.sendNotification('window/logMessage', { 
                                        type: 'warning', 
                                        message: `${actionLogPrefix} File read failed: ${result.message}` 
                                    });
                                }
                            } else {
                                throw new Error('Invalid file/read details format');
                            }
                            break;
                            
                        case ActionType.FileWrite:
                            const writeDetails = action.details as any;
                            if (typeof writeDetails.filePath === 'string' && typeof writeDetails.content === 'string') {
                                const result = await writeFileLocally(
                                    writeDetails.filePath, 
                                    writeDetails.content
                                );
                                
                                if (result.success) {
                                    logger.info(`${actionLogPrefix} File written successfully.`);
                                    connection.sendNotification('window/logMessage', { 
                                        type: 'info', 
                                        message: `${actionLogPrefix} File written successfully to ${writeDetails.filePath}.` 
                                    });
                                } else {
                                    logger.warn(`${actionLogPrefix} File write failed: ${result.message}`);
                                    connection.sendNotification('window/logMessage', { 
                                        type: 'warning', 
                                        message: `${actionLogPrefix} File write failed: ${result.message}` 
                                    });
                                }
                            } else {
                                throw new Error('Invalid file/write details format');
                            }
                            break;
                            
                        default:
                            logger.warn(`${actionLogPrefix} Unsupported action type: ${action.type}`);
                            connection.sendNotification('window/logMessage', { 
                                type: 'warning', 
                                message: `${actionLogPrefix} Unsupported action type: ${action.type}` 
                            });
                    }
                } catch (execError: any) {
                    // Handle execution errors
                    logger.error({ err: execError }, `${actionLogPrefix} Error during action execution.`);
                    connection.sendNotification('window/logMessage', { 
                        type: 'error', 
                        message: `${actionLogPrefix} Execution error: ${execError.message}` 
                    });
                }
            } else {
                // Action was rejected
                logger.warn(`${actionLogPrefix} Action rejected by server operator.`);
                connection.sendNotification('window/logMessage', { 
                    type: 'warning', 
                    message: `${actionLogPrefix} Action was rejected.` 
                });
            }
        }

        // 5. Send completion message
        logger.info(`Agent processing complete for ${connectionId}.`);
        connection.sendNotification('window/logMessage', { 
            type: 'info', 
            message: 'Processing complete.' 
        });

        return {}; // Signal successful completion
    } catch (error: any) {
        // Handle critical errors in the agent logic
        logger.error({ err: error }, `Critical error in runAgentLogic for ${connectionId}`);
        connection.sendNotification('window/logMessage', { 
            type: 'error', 
            message: `Agent logic failed: ${error.message}` 
        });
        
        // Send an error message to the client
        connection.sendNotification('chat/response', { 
            message: { 
                role: 'assistant', 
                text: `Sorry, I encountered an internal error: ${error.message}` 
            } 
        });
        
        throw { code: -32001, message: `Agent error: ${error.message}` };
    }
}
