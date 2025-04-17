import { createLogger } from '../utils/logger';
import { ParsedAction, ParsedActionSchema, ActionType, ShellCommandDetailsSchema, FileEditDetailsSchema, FileReadDetailsSchema, FileWriteDetailsSchema } from '../types/agent';
import { z } from 'zod';

const logger = createLogger('action-parser');

/**
 * Regular expressions for different action formats
 */
const ACTION_PATTERNS = {
    // Standard format: ```mcp_action {...} ```
    MCP_ACTION: /```mcp_action\s*([\s\S]*?)\s*```/g,
    // Complex action format: <complex_action>...</complex_action>
    COMPLEX_ACTION: /<complex_action>([\s\S]*?)<\/complex_action>/g,
    // JSON-LD like format: <action>...</action>
    ACTION_TAG: /<action>([\s\S]*?)<\/action>/g,
    // Function call format: executeAction({...})
    FUNCTION_CALL: /executeAction\s*\(\s*(\{[\s\S]*?\})\s*\)/g,
    // Command format: !command [params]
    COMMAND_FORMAT: /!([a-zA-Z]+)\s+([^\n]+)/g,
    // Simple named blocks: [ACTION:TYPE] content [/ACTION]
    BLOCK_FORMAT: /\[ACTION:([a-zA-Z\/]+)\]\s*([\s\S]*?)\s*\[\/ACTION\]/g
};

/**
 * A map of type-specific validators for different action types
 */
const ACTION_VALIDATORS = {
    [ActionType.ShellRunCommand]: ShellCommandDetailsSchema,
    [ActionType.WorkspaceApplyEdit]: FileEditDetailsSchema,
    [ActionType.FileRead]: FileReadDetailsSchema,
    [ActionType.FileWrite]: FileWriteDetailsSchema
};

/**
 * Parse and validate a potential action from text
 * @param actionText The text containing a potential action
 * @param actionType Optional action type for command-like formats
 * @returns Parsed and validated action or null if invalid
 */
function parseAndValidateAction(actionText: string, actionType?: ActionType): ParsedAction | null {
    try {
        // For command-like formats where we have text instead of JSON
        if (actionType) {
            // Create appropriate structure based on action type
            let details: any;
            
            switch (actionType) {
                case ActionType.ShellRunCommand:
                    details = {
                        command: actionText.trim(),
                        cwd: process.cwd()
                    };
                    break;
                case ActionType.FileRead:
                    details = {
                        filePath: actionText.trim()
                    };
                    break;
                case ActionType.FileWrite:
                    // Extract file path and content (format: filepath:content)
                    const [filePath, ...contentParts] = actionText.split(':');
                    if (!filePath) return null;
                    details = {
                        filePath: filePath.trim(),
                        content: contentParts.join(':').trim()
                    };
                    break;
                default:
                    logger.warn(`Unsupported action type for command format: ${actionType}`);
                    return null;
            }

            // Validate with type-specific schema
            const validator = ACTION_VALIDATORS[actionType];
            if (!validator) {
                logger.warn(`No validator found for action type: ${actionType}`);
                return null;
            }

            const detailsResult = validator.safeParse(details);
            if (!detailsResult.success) {
                logger.warn(`Invalid details for ${actionType}:`, { details, errors: detailsResult.error.errors });
                return null;
            }

            // Create the action structure
            return {
                type: actionType,
                details: detailsResult.data
            };
        }
        
        // For JSON-formatted actions
        const parsed = JSON.parse(actionText);
        
        // Validate with general schema
        const result = ParsedActionSchema.safeParse(parsed);
        if (!result.success) {
            logger.warn('Invalid action structure:', { 
                json: actionText, 
                validationErrors: result.error.errors 
            });
            return null;
        }
        
        // Validate details with type-specific schema
        const actionTypeKey = result.data.type;
        const validator = ACTION_VALIDATORS[actionTypeKey];
        
        if (validator) {
            const detailsResult = validator.safeParse(result.data.details);
            if (!detailsResult.success) {
                logger.warn(`Invalid details for ${actionTypeKey}:`, { 
                    details: result.data.details, 
                    errors: detailsResult.error.errors 
                });
                return null;
            }
            
            // Return with validated details
            return {
                type: result.data.type,
                details: detailsResult.data
            };
        }
        
        // If no specific validator, return the general validated result
        return result.data;
    } catch (error: any) {
        logger.error('Failed to parse action:', { text: actionText, error: error.message });
        return null;
    }
}

/**
 * Extracts action blocks from the Codex AI response text
 * 
 * Looks for actions formatted like:
 * ```mcp_action
 * {
 *   "type": "shell/runCommand",
 *   "details": {
 *     "command": "ls -la"
 *   }
 * }
 * ```
 * 
 * @param responseText The AI model's response text
 * @returns Array of parsed actions, empty array if none found
 */
export function parseActionsFromCodexResponse(responseText: string): ParsedAction[] {
    const actions: ParsedAction[] = [];
    
    // Process primary format: ```mcp_action {...} ```
    let match;
    while ((match = ACTION_PATTERNS.MCP_ACTION.exec(responseText)) !== null) {
        const actionText = match[1].trim();
        const parsedAction = parseAndValidateAction(actionText);
        if (parsedAction) {
            actions.push(parsedAction);
            logger.debug('Parsed mcp_action:', { type: parsedAction.type, details: parsedAction.details });
        }
    }
    
    // Process secondary format: <complex_action>...</complex_action>
    while ((match = ACTION_PATTERNS.COMPLEX_ACTION.exec(responseText)) !== null) {
        const actionText = match[1].trim();
        const parsedAction = parseAndValidateAction(actionText);
        if (parsedAction) {
            actions.push(parsedAction);
            logger.debug('Parsed complex_action:', { type: parsedAction.type, details: parsedAction.details });
        }
    }
    
    logger.info(`Found ${actions.length} valid action(s) in the response`);
    return actions;
}

/**
 * Alternative parsing for different action formats
 * Some models might format their actions differently, this can be extended
 * as needed to support different formats
 */
export function parseActionsAlternateFormat(responseText: string): ParsedAction[] {
    const actions: ParsedAction[] = [];
    
    // Process <action>...</action> format
    let match;
    while ((match = ACTION_PATTERNS.ACTION_TAG.exec(responseText)) !== null) {
        const actionText = match[1].trim();
        const parsedAction = parseAndValidateAction(actionText);
        if (parsedAction) {
            actions.push(parsedAction);
            logger.debug('Parsed <action> tag:', { type: parsedAction.type, details: parsedAction.details });
        }
    }
    
    // Process function call format: executeAction({...})
    while ((match = ACTION_PATTERNS.FUNCTION_CALL.exec(responseText)) !== null) {
        const actionText = match[1].trim();
        const parsedAction = parseAndValidateAction(actionText);
        if (parsedAction) {
            actions.push(parsedAction);
            logger.debug('Parsed function call:', { type: parsedAction.type, details: parsedAction.details });
        }
    }
    
    // Process command format: !command [params]
    while ((match = ACTION_PATTERNS.COMMAND_FORMAT.exec(responseText)) !== null) {
        const command = match[1].toLowerCase();
        const params = match[2].trim();
        
        let actionType: ActionType | undefined;
        
        // Map command to action type
        switch (command) {
            case 'run':
            case 'exec':
            case 'shell':
                actionType = ActionType.ShellRunCommand;
                break;
            case 'read':
            case 'cat':
                actionType = ActionType.FileRead;
                break;
            case 'write':
            case 'save':
                actionType = ActionType.FileWrite;
                break;
            default:
                logger.warn(`Unknown command format: !${command}`);
                continue;
        }
        
        const parsedAction = parseAndValidateAction(params, actionType);
        if (parsedAction) {
            actions.push(parsedAction);
            logger.debug('Parsed command format:', { type: parsedAction.type, details: parsedAction.details });
        }
    }
    
    // Process block format: [ACTION:TYPE] content [/ACTION]
    while ((match = ACTION_PATTERNS.BLOCK_FORMAT.exec(responseText)) !== null) {
        const typeString = match[1].trim();
        const content = match[2].trim();
        
        // Convert type string to ActionType
        let actionType: ActionType | undefined;
        
        // Check if type directly matches an ActionType
        if (Object.values(ActionType).includes(typeString as ActionType)) {
            actionType = typeString as ActionType;
        } else {
            // Map common names to action types
            switch (typeString.toLowerCase()) {
                case 'shell':
                case 'command':
                case 'run':
                    actionType = ActionType.ShellRunCommand;
                    break;
                case 'edit':
                case 'modify':
                    actionType = ActionType.WorkspaceApplyEdit;
                    break;
                case 'read':
                    actionType = ActionType.FileRead;
                    break;
                case 'write':
                case 'create':
                    actionType = ActionType.FileWrite;
                    break;
                default:
                    logger.warn(`Unknown action type in block format: ${typeString}`);
                    continue;
            }
        }
        
        // For non-JSON content, we need special handling based on action type
        try {
            // Try to parse as JSON first
            const parsedAction = parseAndValidateAction(content);
            if (parsedAction) {
                actions.push(parsedAction);
                continue;
            }
            
            // If not JSON, try to parse based on action type
            const actionWithType = parseAndValidateAction(content, actionType);
            if (actionWithType) {
                actions.push(actionWithType);
                logger.debug('Parsed block format:', { type: actionWithType.type, details: actionWithType.details });
            }
        } catch (error) {
            logger.warn(`Failed to parse block format [${typeString}]:`, { error });
        }
    }
    
    logger.info(`Found ${actions.length} additional action(s) in alternate formats`);
    return actions;
}

/**
 * Attempt to repair and parse malformed JSON in actions
 * @param text Potentially malformed JSON text
 * @returns Parsed object or null if unrepairable
 */
export function repairActionJson(text: string): any | null {
    // First try with standard parsing
    try {
        return JSON.parse(text);
    } catch (e) {
        // JSON parsing failed, apply common repairs
    }
    
    try {
        // Fix common issues:
        
        // 1. Add missing quotes around property names
        const fixedProperties = text.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
        
        // 2. Fix trailing commas in objects
        const fixedCommas = fixedProperties.replace(/,(\s*[}\]])/g, '$1');
        
        // 3. Replace single quotes with double quotes
        const fixedQuotes = fixedCommas.replace(/'/g, '"');
        
        // Try parsing the repaired JSON
        return JSON.parse(fixedQuotes);
    } catch (e) {
        logger.debug(`Failed to repair malformed JSON: ${text}`);
        return null;
    }
}

/**
 * Parses actions from a Codex response, trying multiple formats
 * @param responseText The AI model's response text
 * @returns Array of parsed actions
 */
export function parseActions(responseText: string): ParsedAction[] {
    // Reset regex lastIndex values to ensure consistent behavior across calls
    Object.values(ACTION_PATTERNS).forEach(regex => {
        regex.lastIndex = 0;
    });
    
    // Try the primary format first
    const primaryActions = parseActionsFromCodexResponse(responseText);
    
    // Always check alternate formats to get a complete set of actions
    const alternateActions = parseActionsAlternateFormat(responseText);
    
    // Combine both sets of actions
    const allActions = [...primaryActions, ...alternateActions];
    
    if (allActions.length > 0) {
        logger.info(`Found a total of ${allActions.length} valid action(s)`);
    } else {
        logger.warn('No valid actions found in the response');
    }
    
    return allActions;
}
