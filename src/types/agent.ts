import { z } from 'zod';

/**
 * Basic action types supported by the agent
 */
export enum ActionType {
    ShellRunCommand = 'shell/runCommand',
    WorkspaceApplyEdit = 'workspace/applyEdit',
    FileRead = 'file/read',
    FileWrite = 'file/write'
}

/**
 * Schema for shell command action parameters
 */
export const ShellCommandDetailsSchema = z.object({
    command: z.string().min(1),
    cwd: z.string().optional()
});

export type ShellCommandDetails = z.infer<typeof ShellCommandDetailsSchema>;

/**
 * Text edit range schema
 */
export const RangeSchema = z.object({
    start: z.object({
        line: z.number().int().min(0),
        character: z.number().int().min(0)
    }),
    end: z.object({
        line: z.number().int().min(0),
        character: z.number().int().min(0)
    })
});

/**
 * Text edit schema
 */
export const TextEditSchema = z.object({
    range: RangeSchema,
    newText: z.string()
});

/**
 * Schema for file edit action parameters
 */
export const FileEditDetailsSchema = z.object({
    filePath: z.string().min(1),
    edits: z.array(TextEditSchema)
});

export type FileEditDetails = z.infer<typeof FileEditDetailsSchema>;

/**
 * Schema for file read action parameters
 */
export const FileReadDetailsSchema = z.object({
    filePath: z.string().min(1)
});

export type FileReadDetails = z.infer<typeof FileReadDetailsSchema>;

/**
 * Schema for file write action parameters
 */
export const FileWriteDetailsSchema = z.object({
    filePath: z.string().min(1),
    content: z.string()
});

export type FileWriteDetails = z.infer<typeof FileWriteDetailsSchema>;

/**
 * Combined action schema for all supported action types
 */
export const ParsedActionSchema = z.object({
    type: z.nativeEnum(ActionType),
    details: z.union([
        ShellCommandDetailsSchema,
        FileEditDetailsSchema,
        FileReadDetailsSchema,
        FileWriteDetailsSchema
    ])
});

export type ParsedAction = z.infer<typeof ParsedActionSchema>;

/**
 * Union type for all action details
 */
export type ActionDetails = 
    | ShellCommandDetails
    | FileEditDetails
    | FileReadDetails
    | FileWriteDetails;

/**
 * Result of an action execution
 */
export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
}

/**
 * Configuration for the MCP server and agent
 */
export interface AppConfig {
    openaiApiKey?: string;
    mcp?: {
        port?: number;
    };
    agent?: {
        modelName?: string;
        temperature?: number;
        maxTokens?: number;
    };
}
