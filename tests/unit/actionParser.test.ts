import { parseActionsFromCodexResponse, parseActionsAlternateFormat, parseActions } from '../../src/agent/actionParser';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Action Parser', () => {
  describe('parseActionsFromCodexResponse', () => {
    it('should extract valid actions from mcp_action blocks', () => {
      const responseText = `
      I can help you with that. Let me run the following command:
      
      \`\`\`mcp_action
      {
        "type": "shell/runCommand",
        "details": {
          "command": "ls -la",
          "cwd": "/tmp"
        }
      }
      \`\`\`
      
      This will list all files in the directory.
      
      Let me also check the file:
      
      \`\`\`mcp_action
      {
        "type": "file/read",
        "details": {
          "filePath": "/etc/hosts"
        }
      }
      \`\`\`
      `;
      
      const actions = parseActionsFromCodexResponse(responseText);
      
      // Should extract both actions
      expect(actions).toHaveLength(2);
      
      // Verify first action
      expect(actions[0]).toEqual({
        type: 'shell/runCommand',
        details: {
          command: 'ls -la',
          cwd: '/tmp'
        }
      });
      
      // Verify second action
      expect(actions[1]).toEqual({
        type: 'file/read',
        details: {
          filePath: '/etc/hosts'
        }
      });
    });
    
    it('should handle malformed JSON in action blocks', () => {
      const responseText = `
      Let me try to run this:
      
      \`\`\`mcp_action
      {
        "type": "shell/runCommand",
        "details": {
          "command": "ls -la"
          "cwd": "/tmp"  // Missing comma before this line
        }
      }
      \`\`\`
      `;
      
      const actions = parseActionsFromCodexResponse(responseText);
      
      // Should not extract any actions due to JSON error
      expect(actions).toHaveLength(0);
    });
    
    it('should validate actions against schema', () => {
      const responseText = `
      Let me try these actions:
      
      \`\`\`mcp_action
      {
        "type": "shell/runCommand",
        "details": {
          "command": "ls -la",
          "cwd": "/tmp"
        }
      }
      \`\`\`
      
      \`\`\`mcp_action
      {
        "type": "invalid/action",
        "details": {
          "foo": "bar"
        }
      }
      \`\`\`
      
      \`\`\`mcp_action
      {
        "type": "shell/runCommand",
        "details": 12345
      }
      \`\`\`
      `;
      
      const actions = parseActionsFromCodexResponse(responseText);
      
      // Should only extract the valid action
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('shell/runCommand');
    });
    
    it('should handle empty response text', () => {
      const actions = parseActionsFromCodexResponse('');
      expect(actions).toEqual([]);
    });
    
    it('should handle response with no action blocks', () => {
      const responseText = 'This is a response with no actions.';
      const actions = parseActionsFromCodexResponse(responseText);
      expect(actions).toEqual([]);
    });
  });
  
  describe('parseActionsAlternateFormat', () => {
    it('should extract actions from alternate format', () => {
      const responseText = `
      Let me try this format:
      
      <action>
      {
        "type": "shell/runCommand",
        "details": {
          "command": "ls -la",
          "cwd": "/tmp"
        }
      }
      </action>
      `;
      
      const actions = parseActionsAlternateFormat(responseText);
      
      // Should extract the action
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: 'shell/runCommand',
        details: {
          command: 'ls -la',
          cwd: '/tmp'
        }
      });
    });
    
    it('should ignore invalid actions in alternate format', () => {
      const responseText = `
      <action>
      {
        "type": "invalid/type",
        "details": {}
      }
      </action>
      
      <action>
      Not valid JSON
      </action>
      `;
      
      const actions = parseActionsAlternateFormat(responseText);
      
      // Should not extract any actions
      expect(actions).toHaveLength(0);
    });
  });
  
  describe('parseActions', () => {
    it('should try primary format first, then alternate if needed', () => {
      // Spy on both parsers
      const spyPrimary = jest.spyOn(require('../../src/agent/actionParser'), 'parseActionsFromCodexResponse');
      const spyAlternate = jest.spyOn(require('../../src/agent/actionParser'), 'parseActionsAlternateFormat');
      
      // Case 1: Primary format finds actions
      spyPrimary.mockReturnValueOnce([{ type: 'shell/runCommand', details: {} }]);
      
      let actions = parseActions('some text');
      
      // Should return actions from primary format and not call alternate
      expect(actions).toHaveLength(1);
      expect(spyPrimary).toHaveBeenCalledTimes(1);
      expect(spyAlternate).not.toHaveBeenCalled();
      
      // Reset mocks
      jest.clearAllMocks();
      
      // Case 2: Primary format finds no actions, alternate does
      spyPrimary.mockReturnValueOnce([]);
      spyAlternate.mockReturnValueOnce([{ type: 'file/read', details: {} }]);
      
      actions = parseActions('some text');
      
      // Should call both parsers and return actions from alternate
      expect(actions).toHaveLength(1);
      expect(spyPrimary).toHaveBeenCalledTimes(1);
      expect(spyAlternate).toHaveBeenCalledTimes(1);
      expect(actions[0].type).toBe('file/read');
      
      // Restore original implementations
      spyPrimary.mockRestore();
      spyAlternate.mockRestore();
    });
  });
});
