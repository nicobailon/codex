import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { createLogger } from '../utils/logger';
import { ActionResult } from '../types/agent';

const execAsync = promisify(exec);
const logger = createLogger('shell-executor');

// Define potentially dangerous commands that should be blocked
const BLOCKED_COMMANDS_REGEX = [
    /^rm\s+-rf\s+[\/~]/i,  // rm -rf / or ~
    /^dd\s+if=.*of=/i,     // dd commands with both if and of
    /^:(){ :|:& };:/,      // Fork bomb
    /^wget.+\s+\|\s+bash$/i, // wget piped to bash
    /^curl.+\s+\|\s+bash$/i, // curl piped to bash
    /^\s*reboot\s*$/i,     // reboot
    /^\s*shutdown\s*/i,    // shutdown
    /^sudo\s+rm\s/i,       // sudo rm
    /^mv\s+.*\s+\/dev\/null/i, // move to /dev/null
];

/**
 * Sanitizes user input to ensure security
 * @param command The command to sanitize
 * @returns True if the command is allowed, false if blocked
 */
function sanitizeCommand(command: string): boolean {
    // Check against known dangerous patterns
    for (const regex of BLOCKED_COMMANDS_REGEX) {
        if (regex.test(command)) {
            logger.warn(`Blocked potentially dangerous command: "${command}"`);
            return false;
        }
    }
    return true;
}

/**
 * Verifies that the working directory is within a safe boundary
 * @param cwd The requested working directory
 * @returns The verified working directory path
 */
function verifyCwd(cwd: string | undefined): string {
    if (!cwd) {
        return process.cwd(); // Default to current working directory
    }
    
    // Make sure the path is absolute
    const resolvedPath = path.resolve(cwd);
    
    // TODO: Implement additional security checks if needed
    // e.g., ensure it's within the project directory or approved directories
    
    return resolvedPath;
}

/**
 * Executes a shell command locally with safety checks
 * @param command The command to execute
 * @param cwd Working directory for the command
 * @returns Promise with execution result
 */
export async function executeShellCommandLocally(
    command: string, 
    cwd: string | undefined
): Promise<ActionResult & { stdout?: string; stderr?: string; exitCode?: number }> {
    logger.info(`Executing command: "${command}" in ${cwd || process.cwd()}`);
    
    // Security checks
    if (!sanitizeCommand(command)) {
        return {
            success: false,
            message: 'Command rejected: potentially dangerous operation',
        };
    }
    
    const verifiedCwd = verifyCwd(cwd);
    
    try {
        // Execute the command
        const { stdout, stderr } = await execAsync(command, { 
            cwd: verifiedCwd,
            // Set reasonable timeout (5 minutes)
            timeout: 5 * 60 * 1000,
            // Allocate a generous buffer for command output
            maxBuffer: 10 * 1024 * 1024 // 10MB
        });
        
        logger.debug(`Command "${command}" executed successfully`);
        return {
            success: true,
            message: 'Command executed successfully',
            stdout,
            stderr,
            exitCode: 0
        };
    } catch (error: any) {
        logger.error({ err: error }, `Command "${command}" failed`);
        return {
            success: false,
            message: `Command execution failed: ${error.message}`,
            stdout: error.stdout || '',
            stderr: error.stderr || '',
            exitCode: error.code || 1
        };
    }
}
