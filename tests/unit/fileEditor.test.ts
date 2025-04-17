import { applyEditLocally, readFileLocally, writeFileLocally } from '../../src/services/fileEditor';
import { promises as fs } from 'fs';
import path from 'path';

// Mock the fs promises module
jest.mock('fs', () => {
  return {
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      access: jest.fn()
    }
  };
});

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('File Editor Service', () => {
  // Get mocked fs.promises for assertions
  const mockedFs = fs as jest.Mocked<typeof fs>;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('readFileLocally', () => {
    it('should read file successfully', async () => {
      // Mock successful file read
      const testContent = 'Test file content';
      mockedFs.readFile.mockResolvedValueOnce(testContent);
      
      const filePath = '/path/to/file.txt';
      const result = await readFileLocally(filePath);
      
      // Verify readFile was called with correct parameters
      expect(mockedFs.readFile).toHaveBeenCalledWith(expect.stringContaining('file.txt'), 'utf-8');
      
      // Verify result
      expect(result).toEqual({
        success: true,
        message: 'File read successfully',
        content: testContent
      });
    });
    
    it('should handle file read errors', async () => {
      // Mock read error
      const error = new Error('File not found');
      mockedFs.readFile.mockRejectedValueOnce(error);
      
      const filePath = '/path/to/nonexistent.txt';
      const result = await readFileLocally(filePath);
      
      // Verify result includes error message
      expect(result).toEqual({
        success: false,
        message: 'File read failed: File not found'
      });
    });
  });
  
  describe('writeFileLocally', () => {
    it('should write file successfully', async () => {
      const filePath = '/path/to/file.txt';
      const content = 'New file content';
      
      const result = await writeFileLocally(filePath, content);
      
      // Verify mkdir was called to ensure directory exists
      expect(mockedFs.mkdir).toHaveBeenCalledWith(path.dirname(filePath), { recursive: true });
      
      // Verify writeFile was called with correct parameters
      expect(mockedFs.writeFile).toHaveBeenCalledWith(expect.stringContaining('file.txt'), content, 'utf-8');
      
      // Verify result
      expect(result).toEqual({
        success: true,
        message: 'File written successfully'
      });
    });
    
    it('should handle file write errors', async () => {
      // Mock write error
      const error = new Error('Write permission denied');
      mockedFs.writeFile.mockRejectedValueOnce(error);
      
      const filePath = '/path/to/readonly.txt';
      const content = 'Cannot write this';
      
      const result = await writeFileLocally(filePath, content);
      
      // Verify result includes error message
      expect(result).toEqual({
        success: false,
        message: 'File write failed: Write permission denied'
      });
    });
  });
  
  describe('applyEditLocally', () => {
    it('should apply a single-line edit to an existing file', async () => {
      // Mock existing file content
      const originalContent = 'Line 1\nLine 2\nLine 3';
      mockedFs.readFile.mockResolvedValueOnce(originalContent);
      
      // File exists
      mockedFs.access.mockResolvedValueOnce(undefined);
      
      const filePath = '/path/to/file.txt';
      const edits = [
        {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 6 }
          },
          newText: 'Modified Line 2'
        }
      ];
      
      const result = await applyEditLocally(filePath, edits);
      
      // Expected content after edit
      const expectedContent = 'Line 1\nModified Line 2\nLine 3';
      
      // Verify writeFile was called with modified content
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('file.txt'),
        expectedContent,
        'utf-8'
      );
      
      // Verify result
      expect(result).toEqual({
        success: true,
        message: 'Successfully applied 1 edit(s) to file'
      });
    });
    
    it('should apply multiple single-line edits in reverse order', async () => {
      // Mock existing file content
      const originalContent = 'Line 1\nLine 2\nLine 3';
      mockedFs.readFile.mockResolvedValueOnce(originalContent);
      
      // File exists
      mockedFs.access.mockResolvedValueOnce(undefined);
      
      const filePath = '/path/to/file.txt';
      const edits = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 6 }
          },
          newText: 'Modified Line 1'
        },
        {
          range: {
            start: { line: 2, character: 0 },
            end: { line: 2, character: 6 }
          },
          newText: 'Modified Line 3'
        }
      ];
      
      const result = await applyEditLocally(filePath, edits);
      
      // Expected content after both edits
      const expectedContent = 'Modified Line 1\nLine 2\nModified Line 3';
      
      // Verify writeFile was called with content containing both edits
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('file.txt'),
        expectedContent,
        'utf-8'
      );
      
      // Verify result
      expect(result).toEqual({
        success: true,
        message: 'Successfully applied 2 edit(s) to file'
      });
    });
    
    it('should create a new file if it does not exist', async () => {
      // Mock file not found
      mockedFs.access.mockRejectedValueOnce(new Error('File not found'));
      
      const filePath = '/path/to/newfile.txt';
      const edits = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
          },
          newText: 'New file content'
        }
      ];
      
      await applyEditLocally(filePath, edits);
      
      // Verify mkdir was called to create directory
      expect(mockedFs.mkdir).toHaveBeenCalledWith(path.dirname(filePath), { recursive: true });
      
      // Verify empty file was created
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('newfile.txt'),
        '',
        'utf-8'
      );
      
      // Verify file was then read for editing
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('newfile.txt'),
        'utf-8'
      );
    });
    
    it('should handle file edit errors', async () => {
      // Mock read error
      mockedFs.readFile.mockRejectedValueOnce(new Error('Read error'));
      
      const filePath = '/path/to/file.txt';
      const edits = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 6 }
          },
          newText: 'Modified Line'
        }
      ];
      
      const result = await applyEditLocally(filePath, edits);
      
      // Verify result includes error message
      expect(result).toEqual({
        success: false,
        message: 'File editing failed: Read error'
      });
    });
  });
});
