import { McpServer } from '@modelcontextprotocol/sdk/server';
import { McpClient } from '@modelcontextprotocol/sdk/client';
import { startMcpServer } from '../../src/entrypoints/mcp-server';
import { registerMethodHandlers } from '../../src/mcp-handlers';
import { savePermission, clearPermission } from '../../src/permissions';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Helper to create a temporary test file
async function createTempFile(content: string): Promise<string> {
  const tempDir = path.join(os.tmpdir(), 'codex-mcp-test');
  await fs.mkdir(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `test-${Date.now()}.txt`);
  await fs.writeFile(filePath, content);
  return filePath;
}

// Mock the Ink render function to simulate user input
jest.mock('ink', () => {
  const original = jest.requireActual('ink');
  return {
    ...original,
    render: jest.fn().mockImplementation(() => {
      // Automatically approve all actions in tests
      setTimeout(() => {
        const onDecide = original.render.mock.calls[original.render.mock.calls.length - 1][0].props.onDecide;
        if (onDecide) {
          onDecide(true, false); // Approve without remembering
        }
      }, 100);
      
      return {
        unmount: jest.fn(),
        clear: jest.fn(),
      };
    }),
  };
});

describe('MCP Server with Action Approval', () => {
  let server: McpServer;
  let client: McpClient;
  const TEST_PORT = 9999;
  const TEST_API_KEY = 'test-api-key-123';
  
  beforeAll(async () => {
    // Start the server with test config
    server = await startMcpServer(TEST_PORT, {
      openaiApiKey: TEST_API_KEY,
      agent: {
        modelName: 'test-model',
      },
    });
  });
  
  beforeEach(async () => {
    // Create a client for each test
    client = new McpClient({
      url: `ws://localhost:${TEST_PORT}`,
    });
    await client.connect();
    
    // Set a basic context
    await client.sendNotification('context/setContext', {
      conversationId: 'test-conversation',
      messages: [
        { role: 'user', text: 'Hello' },
        { role: 'assistant', text: 'Hi there!' },
      ],
    });
  });
  
  afterEach(async () => {
    // Disconnect client after each test
    await client.disconnect();
  });
  
  afterAll(async () => {
    // Clean up - stop the server
    await server.stop();
  });
  
  it('should handle shell/runCommand with approval', async () => {
    // Send a shell command request directly to the server
    const response = await client.sendRequest('shell/runCommand', {
      command: 'echo "Hello from test"',
      cwd: process.cwd(),
    });
    
    // Verify response
    expect(response).toHaveProperty('approved', true);
    expect(response).toHaveProperty('stdout', 'Hello from test\n');
  });
  
  it('should handle file/read with approval', async () => {
    // Create a test file
    const testContent = 'This is a test file content';
    const filePath = await createTempFile(testContent);
    
    try {
      // Send a file read request
      const response = await client.sendRequest('file/read', {
        filePath,
      });
      
      // Verify response
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('content', testContent);
    } finally {
      // Clean up - remove test file
      await fs.unlink(filePath);
    }
  });
  
  it('should handle file/write with approval', async () => {
    // Create a temporary path
    const tempDir = path.join(os.tmpdir(), 'codex-mcp-test');
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, `write-test-${Date.now()}.txt`);
    const testContent = 'This is content written by the test';
    
    try {
      // Send a file write request
      const response = await client.sendRequest('file/write', {
        filePath,
        content: testContent,
      });
      
      // Verify response
      expect(response).toHaveProperty('success', true);
      
      // Verify file was actually written
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(fileContent).toBe(testContent);
    } finally {
      // Clean up - remove test file
      try {
        await fs.unlink(filePath);
      } catch (e) {
        // Ignore if file doesn't exist
      }
    }
  });
  
  it('should handle chat/request with agent actions', async () => {
    // Send a chat request that triggers the simulated agent
    const chatResponse = await client.sendRequest('chat/request', {
      message: {
        role: 'user',
        text: 'list files',
      },
    });
    
    // Verify the chat request was acknowledged (not checking notifications)
    expect(chatResponse).toEqual({});
    
    // The actual response and actions would be sent as notifications
    // This would need to be tested with a mock client that captures notifications
    // For now, we just verify that the request doesn't throw an error
  });
  
  it('should auto-approve actions with saved permissions', async () => {
    // Create a test permission for shell command
    const command = 'echo "Auto-approved"';
    await savePermission('shell/runCommand', { command, cwd: process.cwd() });
    
    try {
      // This should not trigger Ink prompt because permission is saved
      const response = await client.sendRequest('shell/runCommand', {
        command,
        cwd: process.cwd(),
      });
      
      // Verify response
      expect(response).toHaveProperty('approved', true);
      expect(response).toHaveProperty('stdout', 'Auto-approved\n');
      
      // Check that it didn't try to render Ink prompt
      expect(require('ink').render).not.toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            actionDetails: expect.stringContaining(command),
          }),
        })
      );
    } finally {
      // Clean up - remove permission
      await clearPermission('shell/runCommand', { command, cwd: process.cwd() });
    }
  });
});
