import { describe, it, expect, vi } from 'vitest';
import { startMcpServer } from '../../src/entrypoints/mcp-server';

// Mock the WebSocket server and logger
vi.mock('@modelcontextprotocol/sdk/server', () => ({
    McpServer: vi.fn().mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        onConnection: vi.fn()
    })),
    WebSocketServerTransport: vi.fn()
}));

vi.mock('../../src/utils/logger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        error: vi.fn()
    })
}));

describe('MCP Server', () => {
    it('should start server on specified port', async () => {
        // Test starting the server
        await expect(startMcpServer(3000)).resolves.not.toThrow();
    });
});