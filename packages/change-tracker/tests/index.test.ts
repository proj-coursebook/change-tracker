import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rm, writeFile, mkdir, chmod, access } from 'fs/promises';
import { join } from 'path';
import { ChangeTrackerImpl } from '@/index';
import { ChangeTrackerError, ChangeTrackerErrorType } from '@/types';
import type { FileDataCollection } from '@/types';

// Define a type for test file data
type TestFileData = { contents: Buffer };

describe('ChangeTrackerImpl', () => {
  let changeTracker: ChangeTrackerImpl<TestFileData>;
  let testDir: string;
  let historyPath: string;
  let mockFiles: FileDataCollection<TestFileData>;

  beforeEach(async () => {
    testDir = join(process.cwd(), '__test__', 'change-tracker');
    historyPath = join(testDir, 'history.json');

    // Create test directory
    await mkdir(testDir, { recursive: true });

    changeTracker = new ChangeTrackerImpl({
      historyPath,
    });

    mockFiles = {
      'test.txt': {
        contents: Buffer.from('test content'),
      },
    };
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('trackChanges', () => {
    it('should mark new files correctly', async () => {
      const states = await changeTracker.trackChanges(mockFiles);
      const state = states.get('test.txt');

      expect(state).toBeDefined();
      expect(state?.status).toBe('new');
      expect(state?.previousFingerprint).toBeUndefined();
    });

    it('should mark unchanged files correctly', async () => {
      // First run to establish history
      await changeTracker.trackChanges(mockFiles);

      // Second run with same content
      const states = await changeTracker.trackChanges(mockFiles);
      const state = states.get('test.txt');

      expect(state).toBeDefined();
      expect(state?.status).toBe('unchanged');
      expect(state?.previousFingerprint).toBeDefined();
    });

    it('should mark modified files correctly', async () => {
      // First run to establish history
      await changeTracker.trackChanges(mockFiles);

      // Modify file content
      mockFiles['test.txt'].contents = Buffer.from('modified content');

      // Second run with modified content
      const states = await changeTracker.trackChanges(mockFiles);
      const state = states.get('test.txt');

      expect(state).toBeDefined();
      expect(state?.status).toBe('modified');
      expect(state?.previousFingerprint).toBeDefined();
    });

    it('should handle deleted files', async () => {
      // First run to establish history
      await changeTracker.trackChanges(mockFiles);

      // Delete a file
      const newFiles: FileDataCollection<TestFileData> = {};
      const states = await changeTracker.trackChanges(newFiles);

      expect(states.has('test.txt')).toBe(false);
    });

    it('should handle multiple files', async () => {
      mockFiles['another.txt'] = {
        contents: Buffer.from('another content'),
      };

      const states = await changeTracker.trackChanges(mockFiles);

      expect(states.get('test.txt')?.status).toBe('new');
      expect(states.get('another.txt')?.status).toBe('new');
    });
  });

  describe('disabled tracking', () => {
    beforeEach(() => {
      changeTracker = new ChangeTrackerImpl({
        historyPath,
        enabled: false
      });
    });

    it('should mark all files as untracked when disabled', async () => {
      const states = await changeTracker.trackChanges(mockFiles);
      const state = states.get('test.txt');

      expect(state).toBeDefined();
      expect(state?.status).toBe('untracked');
      expect(state?.previousFingerprint).toBeUndefined();
    });

    it('should not write history file when disabled', async () => {
      await changeTracker.trackChanges(mockFiles);
      await expect(access(historyPath)).rejects.toThrow();
    });

    it('should mark multiple files as untracked when disabled', async () => {
      mockFiles['another.txt'] = {
        contents: Buffer.from('another content'),
      };

      const states = await changeTracker.trackChanges(mockFiles);

      expect(states.get('test.txt')?.status).toBe('untracked');
      expect(states.get('another.txt')?.status).toBe('untracked');
    });

    it('should maintain untracked status across multiple runs', async () => {
      await changeTracker.trackChanges(mockFiles);
      mockFiles['test.txt'].contents = Buffer.from('modified content');
      const states = await changeTracker.trackChanges(mockFiles);

      expect(states.get('test.txt')?.status).toBe('untracked');
    });
  });


  describe('getFileState', () => {
    it('should return undefined for unknown files', () => {
      const state = changeTracker.getFileState('unknown.txt');
      expect(state).toBeUndefined();
    });

    it('should return correct state for tracked files', async () => {
      await changeTracker.trackChanges(mockFiles);
      const state = changeTracker.getFileState('test.txt');

      expect(state).toBeDefined();
      expect(state?.status).toBe('new');
    });
  });

  describe('clearHistory', () => {
    it('should clear history file and states', async () => {
      // First run to establish history
      await changeTracker.trackChanges(mockFiles);

      // Clear history
      await changeTracker.clearHistory();

      // Verify history is cleared
      const states = await changeTracker.trackChanges(mockFiles);
      const state = states.get('test.txt');

      expect(state?.status).toBe('new');
      expect(state?.previousFingerprint).toBeUndefined();
    });

    it('should handle missing history file', async () => {
      await expect(changeTracker.clearHistory()).resolves.not.toThrow();
    });

    it('should throw when history path is not set', async () => {
      changeTracker = new ChangeTrackerImpl({
        historyPath: '',
      });

      await expect(changeTracker.clearHistory()).rejects.toThrow(ChangeTrackerError);
      await expect(changeTracker.clearHistory().catch(e => e.type))
        .resolves.toBe(ChangeTrackerErrorType.HISTORY_PATH_NOT_SET);
    });

    it('should throw on permission error', async () => {
      // First create history file
      await changeTracker.trackChanges(mockFiles);
      
      // Make parent directory read-only to prevent deletion
      await chmod(testDir, 0o444);

      await expect(changeTracker.clearHistory()).rejects.toThrow(ChangeTrackerError);
      await expect(changeTracker.clearHistory().catch(e => e.type))
        .resolves.toBe(ChangeTrackerErrorType.HISTORY_WRITE_ERROR);

      // Restore permissions for cleanup
      await chmod(testDir, 0o777);
    });
  });

  describe('error handling', () => {
    it('should handle corrupted history file', async () => {
      // Write invalid JSON
      await writeFile(historyPath, 'invalid json');

      // Should handle error and treat files as new
      const states = await changeTracker.trackChanges(mockFiles);
      const state = states.get('test.txt');

      expect(state?.status).toBe('new');
    });

    it('should throw when history path is not set', async () => {
      changeTracker = new ChangeTrackerImpl({
        historyPath: '',
      });

      await expect(changeTracker.trackChanges(mockFiles)).rejects.toThrow(
        ChangeTrackerError
      );
      await expect(changeTracker.trackChanges(mockFiles).catch(e => e.type))
        .resolves.toBe(ChangeTrackerErrorType.HISTORY_PATH_NOT_SET);
    });

    it('should throw when history directory is not writable', async () => {
      // Make test directory read-only
      await chmod(testDir, 0o444);

      await expect(changeTracker.trackChanges(mockFiles)).rejects.toThrow(ChangeTrackerError);
      await expect(changeTracker.trackChanges(mockFiles).catch(e => e.type))
        .resolves.toBe(ChangeTrackerErrorType.HISTORY_WRITE_ERROR);
    });

    it('should throw when history file is not writable', async () => {
      // First create history file
      await changeTracker.trackChanges(mockFiles);
      
      // Make history file read-only
      await chmod(historyPath, 0o444);

      // Try to track changes again
      await expect(changeTracker.trackChanges(mockFiles)).rejects.toThrow(ChangeTrackerError);
      await expect(changeTracker.trackChanges(mockFiles).catch(e => e.type))
        .resolves.toBe(ChangeTrackerErrorType.HISTORY_WRITE_ERROR);
    });

    it('should handle invalid file contents', async () => {
      const invalidFiles = {
        'test.txt': {
          contents: undefined as unknown as Buffer,
        },
      };

      await expect(changeTracker.trackChanges(invalidFiles as FileDataCollection<TestFileData>))
        .rejects.toThrow();
    });

    it('should throw when saving history fails due to JSON stringify error', async () => {
      // Create a circular reference that JSON.stringify can't handle
      const circularRef: any = { prop: 'value' };
      circularRef.self = circularRef;

      // Mock the createFingerprint method to return the circular reference
      const originalCreateFingerprint = (changeTracker as any).createFingerprint;
      (changeTracker as any).createFingerprint = () => circularRef;

      await expect(changeTracker.trackChanges(mockFiles)).rejects.toThrow(ChangeTrackerError);
      await expect(changeTracker.trackChanges(mockFiles).catch(e => e.type))
        .resolves.toBe(ChangeTrackerErrorType.HISTORY_WRITE_ERROR);

      // Restore original method
      (changeTracker as any).createFingerprint = originalCreateFingerprint;
    });
  });

  describe('enable', () => {
    it('should enable tracking with boolean parameter', async () => {
      changeTracker.enable(false);
      let states = await changeTracker.trackChanges(mockFiles);
      expect(states.get('test.txt')?.status).toBe('untracked');

      changeTracker.enable(true);
      states = await changeTracker.trackChanges(mockFiles);
      expect(states.get('test.txt')?.status).toBe('new');
    });

    it('should update config with ChangeTrackerConfig parameter', async () => {
      const newHistoryPath = join(testDir, 'new-history.json');
      changeTracker.enable({
        historyPath: newHistoryPath,
        enabled: true,
      });

      const states = await changeTracker.trackChanges(mockFiles);
      expect(states.get('test.txt')?.status).toBe('new');
    });

    it('should maintain existing config values when partially updating', async () => {
      const originalHistoryPath = historyPath;
      
      changeTracker.enable(false);
      
      // @ts-ignore - Accessing private config for testing
      expect(changeTracker.config.historyPath).toBe(originalHistoryPath);
      // @ts-ignore - Accessing private config for testing
      expect(changeTracker.config.enabled).toBe(false);
    });

    it('should affect tracking behavior immediately', async () => {
      // First run with tracking enabled
      await changeTracker.trackChanges(mockFiles);
      
      // Disable tracking
      changeTracker.enable(false);
      
      // Modify file
      mockFiles['test.txt'].contents = Buffer.from('modified content');
      
      // Should be untracked despite modification
      const states = await changeTracker.trackChanges(mockFiles);
      expect(states.get('test.txt')?.status).toBe('untracked');
    });
  });
});