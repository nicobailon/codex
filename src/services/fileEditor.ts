import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger';
import { ActionResult, TextEditSchema } from '../types/agent';
import { z } from 'zod';

const logger = createLogger('file-editor');

// TextEdit type from the TextEditSchema
type TextEdit = z.infer<typeof TextEditSchema>;

/**
 * Verifies that the file path is within a safe boundary
 * @param filePath The requested file path
 * @returns The verified absolute file path
 */
function verifyFilePath(filePath: string): string {
    // Make sure the path is absolute
    const resolvedPath = path.resolve(filePath);
    
    // TODO: Implement additional security checks if needed
    // e.g., ensure it's within the project directory or approved directories
    
    return resolvedPath;
}

/**
 * Check if a file exists
 * @param filePath Path to the file
 * @returns True if the file exists, false otherwise
 */
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Applies a list of edits to a file
 * @param filePath The path to the file to edit
 * @param edits List of text edits to apply
 * @returns Promise with the operation result
 */
export async function applyEditLocally(filePath: string, edits: TextEdit[]): Promise<ActionResult> {
    logger.info(`Applying ${edits.length} edit(s) to file: ${filePath}`);
    
    // Security: verify the file path
    const absolutePath = verifyFilePath(filePath);
    
    try {
        // Check if file exists
        const exists = await fileExists(absolutePath);
        
        // For new files, create directories if they don't exist
        if (!exists) {
            logger.info(`File ${absolutePath} does not exist. Creating...`);
            const directory = path.dirname(absolutePath);
            await fs.mkdir(directory, { recursive: true });
            
            // Create empty file if it doesn't exist
            await fs.writeFile(absolutePath, '', 'utf-8');
        }
        
        // Read the current file content
        let content = await fs.readFile(absolutePath, 'utf-8');
        
        // Split into lines for easier processing
        const lines = content.split(/\r?\n/);
        
        // Apply edits in reverse order (from bottom to top) to avoid position changes affecting other edits
        const sortedEdits = [...edits].sort((a, b) => {
            // Sort by line first (descending)
            if (b.range.start.line !== a.range.start.line) {
                return b.range.start.line - a.range.start.line;
            }
            // Then by character position (descending)
            return b.range.start.character - a.range.start.character;
        });
        
        for (const edit of sortedEdits) {
            const { start, end } = edit.range;
            
            // Handle single-line edits (most common case)
            if (start.line === end.line) {
                // Ensure the line exists
                while (lines.length <= start.line) {
                    lines.push('');
                }
                
                const line = lines[start.line];
                lines[start.line] = 
                    line.substring(0, start.character) + 
                    edit.newText + 
                    line.substring(end.character);
            } 
            // Handle multi-line edits
            else {
                // Ensure all necessary lines exist
                while (lines.length <= end.line) {
                    lines.push('');
                }
                
                // Extract the parts we're keeping
                const startLinePrefix = lines[start.line].substring(0, start.character);
                const endLineSuffix = lines[end.line].substring(end.character);
                
                // If newText has newlines, split it
                const newTextLines = edit.newText.split(/\r?\n/);
                
                // Create the new first line 
                const newFirstLine = startLinePrefix + newTextLines[0];
                
                // Create the new last line
                const newLastLine = (newTextLines.length > 1 ? newTextLines[newTextLines.length - 1] : '') + endLineSuffix;
                
                // Build the new lines array
                const newLines = [
                    ...lines.slice(0, start.line),
                    newFirstLine,
                    ...newTextLines.slice(1, -1), // Middle lines from newText (if any)
                    newLastLine,
                    ...lines.slice(end.line + 1)
                ];
                
                // Update lines
                lines.length = 0;
                lines.push(...newLines);
            }
        }
        
        // Join lines back together
        content = lines.join('\n');
        
        // Write the modified content back to the file
        await fs.writeFile(absolutePath, content, 'utf-8');
        
        logger.info(`Successfully applied edits to ${absolutePath}`);
        return {
            success: true,
            message: `Successfully applied ${edits.length} edit(s) to file`
        };
    } catch (error: any) {
        logger.error({ err: error }, `Failed to apply edits to file: ${absolutePath}`);
        return {
            success: false,
            message: `File editing failed: ${error.message}`
        };
    }
}

/**
 * Reads a file's content
 * @param filePath Path to the file to read
 * @returns Promise with the operation result including file content
 */
export async function readFileLocally(filePath: string): Promise<ActionResult & { content?: string }> {
    logger.info(`Reading file: ${filePath}`);
    
    // Security: verify the file path
    const absolutePath = verifyFilePath(filePath);
    
    try {
        const content = await fs.readFile(absolutePath, 'utf-8');
        
        logger.debug(`Successfully read file: ${absolutePath}`);
        return {
            success: true,
            message: 'File read successfully',
            content
        };
    } catch (error: any) {
        logger.error({ err: error }, `Failed to read file: ${absolutePath}`);
        return {
            success: false,
            message: `File read failed: ${error.message}`
        };
    }
}

/**
 * Writes content to a file, creating it if it doesn't exist
 * @param filePath Path to the file to write
 * @param content Content to write to the file
 * @returns Promise with the operation result
 */
export async function writeFileLocally(filePath: string, content: string): Promise<ActionResult> {
    logger.info(`Writing to file: ${filePath}`);
    
    // Security: verify the file path
    const absolutePath = verifyFilePath(filePath);
    
    try {
        // Create directory if it doesn't exist
        const directory = path.dirname(absolutePath);
        await fs.mkdir(directory, { recursive: true });
        
        // Write the content
        await fs.writeFile(absolutePath, content, 'utf-8');
        
        logger.info(`Successfully wrote to file: ${absolutePath}`);
        return {
            success: true,
            message: 'File written successfully'
        };
    } catch (error: any) {
        logger.error({ err: error }, `Failed to write to file: ${absolutePath}`);
        return {
            success: false,
            message: `File write failed: ${error.message}`
        };
    }
}
