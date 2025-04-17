#\!/usr/bin/env node
/**
 * Development script to run the MCP server directly without building
 * 
 * Usage:
 *   node dev-server.js [--port 3001] [--api-key sk-xxx] [--model model-name]
 */

// Register TypeScript/JSX with ts-node
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    jsx: 'react',
  }
});

// Import server entrypoint
const { startMcpServer } = require('./src/entrypoints/mcp-server');

// Parse arguments
const args = process.argv.slice(2);
const options = {};

// Helper to get argument value
function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index \!== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return null;
}

// Parse port
const portArg = getArgValue('--port') || getArgValue('-p');
if (portArg) {
  options.port = parseInt(portArg, 10);
}

// Parse API key
const apiKeyArg = getArgValue('--api-key') || getArgValue('-k');
if (apiKeyArg) {
  options.apiKey = apiKeyArg;
}

// Parse model
const modelArg = getArgValue('--model') || getArgValue('-m');
if (modelArg) {
  options.model = modelArg;
}

// Default port
const port = options.port || 3000;

// Prepare config overrides
const configOverrides = {};

if (options.apiKey) {
  configOverrides.openaiApiKey = options.apiKey;
}

if (options.model) {
  configOverrides.agent = configOverrides.agent || {};
  configOverrides.agent.modelName = options.model;
}

// Print startup info
console.log(`Starting MCP server on port ${port}...`);
if (options.apiKey) {
  console.log('Using provided API key');
}
if (options.model) {
  console.log(`Using model: ${options.model}`);
}

// Start the server
startMcpServer(port, configOverrides).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
