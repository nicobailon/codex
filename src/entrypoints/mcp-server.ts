import { McpServer, WebSocketServerTransport } from '@modelcontextprotocol/sdk/server';
import { Logger } from 'pino';
import { registerMethodHandlers } from '../mcp-handlers';
import { createLogger } from '../utils/logger';
import { getConfig } from '../utils/config';
import { AppConfig } from '../types/agent';

const logger = createLogger('mcp-server');
const serverName = 'openai-codex-mcp';
const serverVersion = '1.0.0';

/**
 * Starts the MCP server on the specified port
 * @param port The port to listen on
 * @param configOverrides Any configuration overrides to apply
 */
export async function startMcpServer(port: number, configOverrides: Partial<AppConfig> = {}) {
    logger.info(`Starting MCP server ${serverName} v${serverVersion} on port ${port}...`);
    
    // Get configuration with any overrides
    const config = getConfig(configOverrides);
    
    // Create WebSocket transport
    const transport = new WebSocketServerTransport({ port });
    
    // Create MCP server
    const server = new McpServer({
        serverInfo: {
            name: serverName,
            version: serverVersion,
            capabilities: {
                supportedMethods: [
                    'initialize',
                    'context/setContext',
                    'chat/request',
                    'shell/runCommand',
                    'workspace/applyEdit',
                    'file/read',
                    'file/write'
                ]
            }
        },
        transport,
        log: logger,
    });

    // Handle new client connections
    server.onConnection((connection) => {
        logger.info(`MCP client connected: ${connection.connectionId}`);
        
        // Register handlers specific to this connection
        registerMethodHandlers(connection, config);

        connection.onDisconnect(() => {
            logger.info(`MCP client disconnected: ${connection.connectionId}`);
        });
    });

    // Handle graceful shutdown
    const shutdown = async () => {
        logger.info('Shutting down MCP server...');
        await server.stop();
        logger.info('Server stopped.');
        process.exit(0);
    };
    process.on('SIGINT', shutdown); // Ctrl+C
    process.on('SIGTERM', shutdown); // Kill command

    try {
        await server.start();
        logger.info(`MCP server running and listening on ws://localhost:${port}`);
        logger.info(`OpenAI API Key is ${config.openaiApiKey ? 'configured' : 'NOT configured'}`);
        
        return server; // Return server instance for testing
    } catch (error) {
        logger.error("Failed to start MCP server:", error);
        process.exit(1);
    }
}