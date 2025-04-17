import fs from 'fs';
import path from 'path';
import os from 'os';
import { createLogger } from './logger';
import { AppConfig } from '../types/agent';

const logger = createLogger('config');

// Default configuration
const DEFAULT_CONFIG: AppConfig = {
    mcp: {
        port: 3000
    },
    agent: {
        modelName: 'gpt-4-turbo',
        temperature: 0.7,
        maxTokens: 4000
    }
};

// Config file paths
const CONFIG_FILE_PATHS = [
    // Local project config (highest priority)
    path.join(process.cwd(), '.openai-codex-mcp.json'),
    // User home directory config
    path.join(os.homedir(), '.openai-codex-mcp', 'config.json')
];

/**
 * Loads configuration from environment variables, config files, and merges with defaults
 * @param overrides Any programmatic config overrides to apply
 * @returns Merged configuration object
 */
export function getConfig(overrides: Partial<AppConfig> = {}): AppConfig {
    // Start with default config
    const config: AppConfig = { ...DEFAULT_CONFIG };

    // Try to load from config files in order of priority
    for (const configPath of CONFIG_FILE_PATHS) {
        try {
            if (fs.existsSync(configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                logger.debug(`Loaded config from ${configPath}`);
                
                // Deep merge the configurations
                mergeConfigs(config, fileConfig);
            }
        } catch (error) {
            logger.warn(`Error loading config from ${configPath}:`, error);
        }
    }

    // Apply environment variables
    if (process.env.OPENAI_API_KEY) {
        config.openaiApiKey = process.env.OPENAI_API_KEY;
    }
    
    if (process.env.MCP_PORT) {
        if (!config.mcp) config.mcp = {};
        config.mcp.port = parseInt(process.env.MCP_PORT, 10);
    }
    
    if (process.env.CODEX_MODEL) {
        if (!config.agent) config.agent = {};
        config.agent.modelName = process.env.CODEX_MODEL;
    }
    
    if (process.env.CODEX_TEMPERATURE) {
        if (!config.agent) config.agent = {};
        const temp = parseFloat(process.env.CODEX_TEMPERATURE);
        if (!isNaN(temp)) {
            config.agent.temperature = temp;
        }
    }
    
    if (process.env.CODEX_MAX_TOKENS) {
        if (!config.agent) config.agent = {};
        const tokens = parseInt(process.env.CODEX_MAX_TOKENS, 10);
        if (!isNaN(tokens)) {
            config.agent.maxTokens = tokens;
        }
    }

    // Apply programmatic overrides (highest priority)
    mergeConfigs(config, overrides);

    return config;
}

/**
 * Helper function to deep merge configuration objects
 */
function mergeConfigs(target: any, source: any) {
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && key in target) {
            mergeConfigs(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
}

/**
 * Saves the configuration to a file
 * @param config Configuration to save
 * @param configPath Path to save the config to, defaults to user home config
 */
export async function saveConfig(
    config: Partial<AppConfig>, 
    configPath = path.join(os.homedir(), '.openai-codex-mcp', 'config.json')
): Promise<void> {
    try {
        const dirPath = path.dirname(configPath);
        await fs.promises.mkdir(dirPath, { recursive: true });
        
        let existingConfig = {};
        try {
            if (fs.existsSync(configPath)) {
                existingConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'));
            }
        } catch (error) {
            logger.warn(`Error reading existing config from ${configPath}:`, error);
        }
        
        // Merge with existing config
        const newConfig = { ...existingConfig };
        mergeConfigs(newConfig, config);
        
        await fs.promises.writeFile(configPath, JSON.stringify(newConfig, null, 2));
        logger.info(`Config saved to ${configPath}`);
    } catch (error) {
        logger.error(`Failed to save config to ${configPath}:`, error);
        throw error;
    }
}
