import { generateKey, loadPermissions, checkPermission, savePermission, clearPermission, listPermissions } from '../../src/permissions';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock the fs promises module
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      mkdir: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn(),
      writeFile: jest.fn().mockResolvedValue(undefined),
    },
  };
});

// Mock logger to avoid polluting test output
jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Permissions Module', () => {
  // Get mocked fs.promises for assertions
  const mockedFs = fs.promises as jest.Mocked<typeof fs.promises>;

  // Define test constants
  const PERMISSIONS_DIR = path.join(os.homedir(), '.openai-codex-mcp');
  const PERMISSIONS_FILE = path.join(PERMISSIONS_DIR, 'permissions.json');
  
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('generateKey', () => {
    it('should generate a unique key for an action', () => {
      const actionType = 'shell/runCommand';
      const details = { command: 'ls -la', cwd: '/tmp' };
      
      const key = generateKey(actionType, details);
      
      // Key should be in format "actionType::base64"
      expect(key).toContain('shell/runCommand::');
      
      // Should be deterministic - same inputs yield same key
      const key2 = generateKey(actionType, details);
      expect(key).toEqual(key2);
      
      // Different details should yield different keys
      const key3 = generateKey(actionType, { command: 'pwd', cwd: '/tmp' });
      expect(key).not.toEqual(key3);
    });
    
    it('should handle string details', () => {
      const actionType = 'test';
      const details = 'test-details';
      
      const key = generateKey(actionType, details);
      
      expect(key).toContain('test::');
      
      // Should be Base64 encoded
      const [, encodedDetails] = key.split('::');
      const decodedDetails = Buffer.from(encodedDetails, 'base64').toString('utf-8');
      expect(decodedDetails).toEqual(details);
    });
  });
  
  describe('loadPermissions', () => {
    it('should return empty object when file does not exist', async () => {
      // Simulate file not found error
      mockedFs.readFile.mockRejectedValueOnce({ code: 'ENOENT' });
      
      const permissions = await loadPermissions();
      
      expect(permissions).toEqual({});
      expect(mockedFs.mkdir).toHaveBeenCalledWith(PERMISSIONS_DIR, { recursive: true });
      expect(mockedFs.readFile).toHaveBeenCalledWith(PERMISSIONS_FILE, 'utf-8');
    });
    
    it('should return empty object when file read fails', async () => {
      // Simulate generic error
      mockedFs.readFile.mockRejectedValueOnce(new Error('Read failed'));
      
      const permissions = await loadPermissions();
      
      expect(permissions).toEqual({});
    });
    
    it('should parse permissions from file when it exists', async () => {
      // Simulate file with permissions
      const mockPermissions = {
        'test::MTIzNDU=': true,
        'shell/runCommand::eyJjb21tYW5kIjoibHMiLCJjd2QiOiIvdG1wIn0=': true,
      };
      mockedFs.readFile.mockResolvedValueOnce(JSON.stringify(mockPermissions));
      
      const permissions = await loadPermissions();
      
      expect(permissions).toEqual(mockPermissions);
    });
  });
  
  describe('checkPermission', () => {
    it('should return false when permission does not exist', async () => {
      // Simulate empty permissions file
      mockedFs.readFile.mockResolvedValueOnce('{}');
      
      const actionType = 'test';
      const details = { test: 'value' };
      
      const hasPermission = await checkPermission(actionType, details);
      
      expect(hasPermission).toBe(false);
    });
    
    it('should return true when permission exists', async () => {
      // Create a key for the test
      const actionType = 'test';
      const details = { test: 'value' };
      const key = generateKey(actionType, details);
      
      // Simulate permissions file with the key
      const mockPermissions = { [key]: true };
      mockedFs.readFile.mockResolvedValueOnce(JSON.stringify(mockPermissions));
      
      const hasPermission = await checkPermission(actionType, details);
      
      expect(hasPermission).toBe(true);
    });
  });
  
  describe('savePermission', () => {
    it('should save a new permission', async () => {
      // Simulate empty permissions file
      mockedFs.readFile.mockResolvedValueOnce('{}');
      
      const actionType = 'test';
      const details = { test: 'value' };
      const key = generateKey(actionType, details);
      
      await savePermission(actionType, details);
      
      // Check that writeFile was called with the correct parameters
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        PERMISSIONS_FILE,
        JSON.stringify({ [key]: true }, null, 2)
      );
    });
    
    it('should not overwrite existing permission', async () => {
      // Generate key for the test
      const actionType = 'test';
      const details = { test: 'value' };
      const key = generateKey(actionType, details);
      
      // Simulate permissions file with existing permission
      const mockPermissions = { [key]: true };
      mockedFs.readFile.mockResolvedValueOnce(JSON.stringify(mockPermissions));
      
      await savePermission(actionType, details);
      
      // Check that writeFile was not called since permission already exists
      expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });
    
    it('should handle write errors gracefully', async () => {
      // Simulate empty permissions file
      mockedFs.readFile.mockResolvedValueOnce('{}');
      
      // Simulate write error
      mockedFs.writeFile.mockRejectedValueOnce(new Error('Write failed'));
      
      const actionType = 'test';
      const details = { test: 'value' };
      
      // Should not throw
      await expect(savePermission(actionType, details)).resolves.not.toThrow();
    });
  });
  
  describe('clearPermission', () => {
    it('should clear an existing permission', async () => {
      // Generate key for the test
      const actionType = 'test';
      const details = { test: 'value' };
      const key = generateKey(actionType, details);
      
      // Create permissions with the key and another permission
      const mockPermissions = { 
        [key]: true,
        'other::test': true 
      };
      mockedFs.readFile.mockResolvedValueOnce(JSON.stringify(mockPermissions));
      
      const result = await clearPermission(actionType, details);
      
      // Should return true if permission was cleared
      expect(result).toBe(true);
      
      // Check that writeFile was called with the permission removed
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        PERMISSIONS_FILE,
        JSON.stringify({ 'other::test': true }, null, 2)
      );
    });
    
    it('should return false if permission does not exist', async () => {
      // Simulate permissions file without the target permission
      mockedFs.readFile.mockResolvedValueOnce(JSON.stringify({
        'other::test': true
      }));
      
      const actionType = 'test';
      const details = { test: 'value' };
      
      const result = await clearPermission(actionType, details);
      
      // Should return false if permission was not found
      expect(result).toBe(false);
      
      // Check that writeFile was not called
      expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });
    
    it('should handle write errors gracefully', async () => {
      // Generate key for the test
      const actionType = 'test';
      const details = { test: 'value' };
      const key = generateKey(actionType, details);
      
      // Simulate permissions file with the key
      mockedFs.readFile.mockResolvedValueOnce(JSON.stringify({
        [key]: true
      }));
      
      // Simulate write error
      mockedFs.writeFile.mockRejectedValueOnce(new Error('Write failed'));
      
      // Should not throw but return false
      const result = await clearPermission(actionType, details);
      expect(result).toBe(false);
    });
  });
  
  describe('listPermissions', () => {
    it('should return empty array when no permissions exist', async () => {
      // Simulate empty permissions file
      mockedFs.readFile.mockResolvedValueOnce('{}');
      
      const permissions = await listPermissions();
      
      expect(permissions).toEqual([]);
    });
    
    it('should decode and return all permissions', async () => {
      // Encoded details for testing
      const encodedDetails1 = Buffer.from(JSON.stringify({ command: 'ls', cwd: '/tmp' })).toString('base64');
      const encodedDetails2 = Buffer.from('test details').toString('base64');
      
      // Simulate permissions file with encoded details
      mockedFs.readFile.mockResolvedValueOnce(JSON.stringify({
        [`shell/runCommand::${encodedDetails1}`]: true,
        [`file/read::${encodedDetails2}`]: true
      }));
      
      const permissions = await listPermissions();
      
      // Should return array of decoded permission objects
      expect(permissions).toHaveLength(2);
      expect(permissions).toEqual([
        {
          actionType: 'shell/runCommand',
          details: '{"command":"ls","cwd":"/tmp"}'
        },
        {
          actionType: 'file/read',
          details: 'test details'
        }
      ]);
    });
    
    it('should handle file read errors', async () => {
      // Simulate read error
      mockedFs.readFile.mockRejectedValueOnce(new Error('Read failed'));
      
      const permissions = await listPermissions();
      
      // Should return empty array on error
      expect(permissions).toEqual([]);
    });
  });
});
