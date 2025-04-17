import { promises as fs } from 'fs';
import path from 'path';
import os from 'os'; // To store outside project dir
import { createLogger } from './utils/logger';

const logger = createLogger('permissions');

// Store permissions in user's home directory for persistence across projects
const PERMISSIONS_DIR = path.join(os.homedir(), '.openai-codex-mcp');
const PERMISSIONS_FILE = path.join(PERMISSIONS_DIR, 'permissions.json');

interface PermissionsStore {
    [key: string]: boolean; // Key format: "actionType::detailsHashOrIdentifier"
}

/**
 * Generates a unique key for an action to use in the permissions store
 * @param actionType The type of action (e.g., 'shell/runCommand')
 * @param details The details of the action (e.g., command string or file edit details)
 * @returns A unique string key
 */
export const generateKey = (actionType: string, details: any): string => {
    const detailsString = typeof details === 'string' ? details : JSON.stringify(details);
    // Basic hash - convert to Base64 for readability in permissions file
    const simpleHash = Buffer.from(detailsString).toString('base64');
    return `${actionType}::${simpleHash}`;
};

/**
 * Loads the permissions store from disk
 * @returns The permissions store object
 */
export async function loadPermissions(): Promise<PermissionsStore> {
    try {
        await fs.mkdir(PERMISSIONS_DIR, { recursive: true }); // Ensure directory exists
        const data = await fs.readFile(PERMISSIONS_FILE, 'utf-8');
        return JSON.parse(data) as PermissionsStore;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return {}; // File doesn't exist, return empty store
        }
        logger.error('Failed to load permissions file:', error);
        return {}; // Return empty on other errors
    }
}

/**
 * Checks if an action has been previously approved
 * @param actionType The type of action (e.g., 'shell/runCommand')
 * @param details The details of the action (e.g., command string or file edit details)
 * @returns True if the action has been approved, false otherwise
 */
export async function checkPermission(actionType: string, details: any): Promise<boolean> {
    const key = generateKey(actionType, details);
    const permissions = await loadPermissions();
    const hasPermission = permissions[key] === true;
    if (hasPermission) {
        logger.debug(`Permission cache hit for action: ${key}`);
    }
    return hasPermission;
}

/**
 * Saves a permission for future reference
 * @param actionType The type of action (e.g., 'shell/runCommand')
 * @param details The details of the action (e.g., command string or file edit details)
 */
export async function savePermission(actionType: string, details: any): Promise<void> {
    const key = generateKey(actionType, details);
    const permissions = await loadPermissions();
    if (permissions[key] !== true) {
        permissions[key] = true;
        try {
            await fs.writeFile(PERMISSIONS_FILE, JSON.stringify(permissions, null, 2));
            logger.info(`Permission saved for action: ${key}`);
        } catch (error) {
            logger.error('Failed to save permissions file:', error);
        }
    }
}

/**
 * Clears a specific permission from the store
 * @param actionType The type of action (e.g., 'shell/runCommand')
 * @param details The details of the action (e.g., command string or file edit details)
 * @returns True if the permission was removed, false if it wasn't found
 */
export async function clearPermission(actionType: string, details: any): Promise<boolean> {
    const key = generateKey(actionType, details);
    const permissions = await loadPermissions();
    if (permissions[key] === true) {
        delete permissions[key];
        try {
            await fs.writeFile(PERMISSIONS_FILE, JSON.stringify(permissions, null, 2));
            logger.info(`Permission cleared for action: ${key}`);
            return true;
        } catch (error) {
            logger.error('Failed to save permissions file after clearing:', error);
        }
    }
    return false;
}

/**
 * Lists all saved permissions
 * @returns Array of permission entries with actionType and details
 */
export async function listPermissions(): Promise<{actionType: string, details: string}[]> {
    const permissions = await loadPermissions();
    return Object.keys(permissions).map(key => {
        const [actionType, encodedDetails] = key.split('::');
        const details = Buffer.from(encodedDetails, 'base64').toString('utf-8');
        return { actionType, details };
    });
}
