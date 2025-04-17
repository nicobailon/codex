import React from 'react';
import { Command } from 'commander';
import { startMcpServer } from './mcp-server';
import { createLogger } from '../utils/logger';
import { getConfig, saveConfig } from '../utils/config';
import { listPermissions, clearPermission } from '../permissions';
import path from 'path';
import os from 'os';

// Create logger for CLI
const logger = createLogger('cli');

// Define package information (can be imported from package.json in a real implementation)
const packageJson = { name: 'openai-codex-mcp', version: '1.0.0' };

// Create command-line program
const program = new Command();
program
    .name(packageJson.name)
    .description('CLI for OpenAI Codex and MCP Server')
    .version(packageJson.version);

// --- Define Original CLI Commands (Example) ---
program
    .command('generate <prompt>')
    .description('Generate code using the original CLI logic')
    .option('-o, --output <file>', 'Output file')
    .option('-m, --model <name>', 'Model name to use')
    .action((prompt, options) => {
        logger.info('Running original generate command...');
        // TODO: Implement original CLI logic
        console.log(`Generate command (stub): Will generate code for prompt: ${prompt}`);
        if (options.output) {
            console.log(`Output will be saved to: ${options.output}`);
        }
        if (options.model) {
            console.log(`Using model: ${options.model}`);
        }
    });

// --- Define MCP Server Subcommand ---
const mcpCommand = program.command('mcp')
    .description('Manage the MCP server');

// MCP serve command
mcpCommand
    .command('serve')
    .description('Start the Model Context Protocol (MCP) server')
    .option('-p, --port <number>', 'Port number to run the server on', (value) => parseInt(value, 10))
    .option('-k, --api-key <key>', 'OpenAI API key')
    .option('-m, --model <name>', 'Model name to use')
    .option('-t, --temperature <number>', 'Temperature for model generation', parseFloat)
    .action(async (options) => {
        // Prepare configuration overrides
        const configOverrides: any = {};
        
        if (options.apiKey) {
            configOverrides.openaiApiKey = options.apiKey;
        }
        
        if (options.model) {
            if (!configOverrides.agent) configOverrides.agent = {};
            configOverrides.agent.modelName = options.model;
        }
        
        if (options.temperature !== undefined) {
            if (!configOverrides.agent) configOverrides.agent = {};
            configOverrides.agent.temperature = options.temperature;
        }

        // Get port from options, env var, or default
        const port = process.env.MCP_PORT 
            ? parseInt(process.env.MCP_PORT, 10) 
            : (options.port || 3000);
        
        // Update config if needed
        if (Object.keys(configOverrides).length > 0) {
            const config = getConfig();
            console.log('Using configuration:');
            console.log(` - Model: ${configOverrides.agent?.modelName || config.agent?.modelName || 'default'}`);
            console.log(` - API Key: ${configOverrides.openaiApiKey || config.openaiApiKey ? 'Configured' : 'Not configured'}`);
            console.log(` - Port: ${port}`);
        }
        
        // Start the server
        await startMcpServer(port, configOverrides);
    });

// MCP config command
mcpCommand
    .command('config')
    .description('Configure the MCP server')
    .option('-k, --api-key <key>', 'Set OpenAI API key')
    .option('-m, --model <name>', 'Set default model name')
    .option('-t, --temperature <number>', 'Set temperature for generation', parseFloat)
    .option('-s, --show', 'Show current configuration')
    .action(async (options) => {
        // Get current config
        const config = getConfig();
        
        // Show current config if requested
        if (options.show || (!options.apiKey && !options.model && !options.temperature)) {
            console.log('Current configuration:');
            console.log(` - API Key: ${config.openaiApiKey ? 'Configured' : 'Not configured'}`);
            console.log(` - Model: ${config.agent?.modelName || 'default'}`);
            console.log(` - Temperature: ${config.agent?.temperature || 'default'}`);
            console.log(` - Configuration file: ${path.join(os.homedir(), '.openai-codex-mcp', 'config.json')}`);
            return;
        }
        
        // Update configuration
        const configUpdates: any = {};
        let changed = false;
        
        if (options.apiKey) {
            configUpdates.openaiApiKey = options.apiKey;
            changed = true;
        }
        
        if (options.model) {
            if (!configUpdates.agent) configUpdates.agent = {};
            configUpdates.agent.modelName = options.model;
            changed = true;
        }
        
        if (options.temperature !== undefined) {
            if (!configUpdates.agent) configUpdates.agent = {};
            configUpdates.agent.temperature = options.temperature;
            changed = true;
        }
        
        if (changed) {
            await saveConfig(configUpdates);
            console.log('Configuration updated successfully.');
        }
    });

// MCP permissions command
mcpCommand
    .command('permissions')
    .description('Manage saved permissions')
    .option('-l, --list', 'List all saved permissions')
    .option('-c, --clear <index>', 'Clear a specific permission by index')
    .action(async (options) => {
        if (options.list || (!options.clear)) {
            // List permissions
            const permissions = await listPermissions();
            
            if (permissions.length === 0) {
                console.log('No saved permissions found.');
                return;
            }
            
            console.log('Saved permissions:');
            permissions.forEach((perm, index) => {
                console.log(`${index + 1}. Type: ${perm.actionType}`);
                console.log(`   Details: ${perm.details}`);
            });
            return;
        }
        
        if (options.clear) {
            // Clear specific permission
            const permissions = await listPermissions();
            const index = parseInt(options.clear, 10) - 1;
            
            if (isNaN(index) || index < 0 || index >= permissions.length) {
                console.error('Invalid permission index.');
                return;
            }
            
            const perm = permissions[index];
            const cleared = await clearPermission(perm.actionType, JSON.parse(perm.details));
            
            if (cleared) {
                console.log(`Permission cleared: ${perm.actionType}`);
            } else {
                console.error('Failed to clear permission.');
            }
        }
    });

// --- Parse Arguments ---
program.parse(process.argv);