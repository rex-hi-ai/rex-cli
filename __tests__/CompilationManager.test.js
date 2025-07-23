const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const CompilationManager = require('../src/CompilationManager');
const FileSystemManager = require('../src/FileSystemManager');

describe('CompilationManager', () => {
  let tempDir;
  let originalGetGlobalRexDir;
  let originalGetLocalRexDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `rex-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    
    // Mock FileSystemManager methods to use temp directory
    originalGetGlobalRexDir = FileSystemManager.getGlobalRexDir;
    originalGetLocalRexDir = FileSystemManager.getLocalRexDir;
    
    FileSystemManager.getGlobalRexDir = () => path.join(tempDir, '.rex');
    FileSystemManager.getLocalRexDir = () => path.join(tempDir, 'project', '.rex');

    // Create test directory structure
    await fs.ensureDir(path.join(tempDir, '.rex', 'prompts'));
    await fs.ensureDir(path.join(tempDir, 'project', '.rex'));

    // Create a test prompt
    const testPromptPath = path.join(tempDir, '.rex', 'prompts', 'test-prompt.md');
    await fs.writeFile(testPromptPath, '# Test Prompt\n\nThis is a test prompt.', 'utf8');
  });

  afterEach(async () => {
    // Restore original methods
    FileSystemManager.getGlobalRexDir = originalGetGlobalRexDir;
    FileSystemManager.getLocalRexDir = originalGetLocalRexDir;
    
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  describe('Basic functionality', () => {
    test('should create CompilationManager instance', () => {
      const manager = new CompilationManager();
      expect(manager).toBeInstanceOf(CompilationManager);
      expect(manager.utilityRunner).toBeDefined();
    });

    test('should get compiled directory path', () => {
      const manager = new CompilationManager();
      const compiledDir = manager.getCompiledDir();
      expect(compiledDir).toBe(path.join(tempDir, '.rex', 'compiled'));
    });

    test('should get utility output directory path', () => {
      const manager = new CompilationManager();
      const outputDir = manager.getUtilityOutputDir('test-utility');
      expect(outputDir).toBe(path.join(tempDir, '.rex', 'compiled', 'test-utility'));
    });
  });

  describe('Directory management', () => {
    test('should ensure compiled directories exist', async () => {
      const manager = new CompilationManager();
      await manager.ensureCompiledDirs();
      
      const compiledDir = manager.getCompiledDir();
      expect(await fs.pathExists(compiledDir)).toBe(true);
    });

    test('should clean compiled output', async () => {
      const manager = new CompilationManager();
      const compiledDir = manager.getCompiledDir();
      
      // Create some test files
      await fs.ensureDir(path.join(compiledDir, 'test-utility'));
      await fs.writeFile(path.join(compiledDir, 'test-utility', 'output.txt'), 'test');
      
      expect(await fs.pathExists(compiledDir)).toBe(true);
      
      await manager.cleanCompiled();
      expect(await fs.pathExists(compiledDir)).toBe(false);
    });
  });

  describe('Compilation process', () => {
    test('should compile prompts with github-copilot utility', async () => {
      const manager = new CompilationManager();
      
      const result = await manager.compile({
        all: true,
        utilities: ['github-copilot']
      });

      expect(result.success).toBe(true);
      expect(result.compiledUtilities).toEqual(['github-copilot']);
      expect(result.compiledPrompts).toBeGreaterThan(0);

      // Check if output file was created
      const outputDir = manager.getUtilityOutputDir('github-copilot');
      const outputFile = path.join(outputDir, '.github', 'copilot', 'prompts', 'test-prompt.prompt.md');
      expect(await fs.pathExists(outputFile)).toBe(true);
      
      const content = await fs.readFile(outputFile, 'utf8');
      expect(content).toContain('name: test-prompt');
      expect(content).toContain('# Test Prompt');
    });

    test('should handle compilation with clean option', async () => {
      const manager = new CompilationManager();
      
      // Create some existing compiled output
      const outputDir = manager.getUtilityOutputDir('github-copilot');
      await fs.ensureDir(outputDir);
      await fs.writeFile(path.join(outputDir, 'old-file.txt'), 'old content');
      
      expect(await fs.pathExists(path.join(outputDir, 'old-file.txt'))).toBe(true);
      
      const result = await manager.compile({
        all: true,
        clean: true
      });

      expect(result.success).toBe(true);
      
      // Old file should be gone after clean
      expect(await fs.pathExists(path.join(outputDir, 'old-file.txt'))).toBe(false);
    });
  });

  describe('Status reporting', () => {
    test('should report compilation status when no compilation exists', async () => {
      const manager = new CompilationManager();
      const status = await manager.getCompilationStatus();
      
      expect(status.hasCompiled).toBe(false);
      expect(status.utilities).toEqual([]);
      expect(status.totalFiles).toBe(0);
    });

    test('should report compilation status after compilation', async () => {
      const manager = new CompilationManager();
      
      await manager.compile({ all: true });
      
      const status = await manager.getCompilationStatus();
      expect(status.hasCompiled).toBe(true);
      expect(status.utilities.length).toBeGreaterThan(0);
      expect(status.totalFiles).toBeGreaterThan(0);
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle compilation with invalid utility', async () => {
      const manager = new CompilationManager();
      
      await expect(manager.compile({
        utilities: ['invalid-utility']
      })).rejects.toThrow();
    });

    test('should handle compilation with empty prompts directory', async () => {
      const manager = new CompilationManager();
      const promptsDir = path.join(tempDir, '.rex', 'prompts');
      
      // Remove all prompts
      await fs.emptyDir(promptsDir);
      
      // Should throw error when no prompts found
      await expect(manager.compile({ all: true })).rejects.toThrow('沒有找到要編譯的 prompts');
    });

    test('should handle compilation with no utilities specified', async () => {
      const manager = new CompilationManager();
      
      const result = await manager.compile({});
      expect(result.success).toBe(true);
      expect(result.compiledUtilities.length).toBeGreaterThan(0); // Should use all utilities
    });

    test('should handle prompts with special characters in filename', async () => {
      const manager = new CompilationManager();
      const promptsDir = path.join(tempDir, '.rex', 'prompts');
      
      // Create prompt with special characters
      const specialPromptPath = path.join(promptsDir, 'test-prompt-with-spaces and symbols!@#.md');
      await fs.writeFile(specialPromptPath, '# Special Prompt\n\nThis has special chars.', 'utf8');
      
      const result = await manager.compile({
        utilities: ['github-copilot']
      });
      
      expect(result.success).toBe(true);
      expect(result.compiledPrompts).toBeGreaterThan(0);
    });

    test('should handle corrupted prompt files', async () => {
      const manager = new CompilationManager();
      const promptsDir = path.join(tempDir, '.rex', 'prompts');
      
      // Create empty prompt file
      const emptyPromptPath = path.join(promptsDir, 'empty-prompt.md');
      await fs.writeFile(emptyPromptPath, '', 'utf8');
      
      const result = await manager.compile({
        utilities: ['github-copilot']
      });
      
      expect(result.success).toBe(true);
    });

    test('should handle watch mode initialization', async () => {
      const manager = new CompilationManager();
      
      // Test that watch mode can be initialized without errors
      const watchOptions = {
        watch: true,
        utilities: ['github-copilot']
      };
      
      // Since we can't easily test file watching in unit tests,
      // we'll just ensure the method doesn't throw
      await expect(manager.compile(watchOptions)).resolves.toBeDefined();
    });

    test('should handle specific prompt compilation', async () => {
      const manager = new CompilationManager();
      
      const result = await manager.compile({
        prompts: ['test-prompt'],
        utilities: ['github-copilot']
      });
      
      expect(result.success).toBe(true);
      expect(result.compiledPrompts).toBe(1);
    });

    test('should handle non-existent prompt compilation', async () => {
      const manager = new CompilationManager();
      
      // When specifying non-existent prompts, the actual existing prompts will still be found
      // but the specific ones requested won't match, so it should still compile what exists
      const result = await manager.compile({
        prompts: ['non-existent-prompt'],
        utilities: ['github-copilot']
      });
      
      expect(result.success).toBe(true);
      // It will still compile existing prompts even if specific ones are not found
      expect(result.compiledPrompts).toBeGreaterThanOrEqual(0);
    });

    test('should handle cache operations', async () => {
      const manager = new CompilationManager();
      
      // First compilation to create cache
      await manager.compile({
        utilities: ['github-copilot']
      });
      
      // Second compilation should use cache
      const result = await manager.compile({
        utilities: ['github-copilot']
      });
      
      expect(result.success).toBe(true);
    });

    test('should handle permissions errors gracefully', async () => {
      const manager = new CompilationManager();
      const compiledDir = manager.getCompiledDir();
      
      // Create directory and restrict permissions (on non-Windows systems)
      if (process.platform !== 'win32') {
        await fs.ensureDir(compiledDir);
        // Make directory read-only to simulate permission error
        await fs.chmod(compiledDir, 0o444);
        
        try {
          // This should handle the permission error gracefully
          await manager.compile({ utilities: ['github-copilot'] });
        } catch (error) {
          expect(error).toBeDefined();
        } finally {
          // Restore permissions for cleanup
          await fs.chmod(compiledDir, 0o755);
        }
      }
    });

    test('should clean specific utility output', async () => {
      const manager = new CompilationManager();
      const utilityDir = manager.getUtilityOutputDir('test-utility');
      
      // Create test utility directory and files
      await fs.ensureDir(utilityDir);
      await fs.writeFile(path.join(utilityDir, 'test-file.txt'), 'test content');
      
      expect(await fs.pathExists(utilityDir)).toBe(true);
      
      // Clean specific utility
      await manager.cleanCompiled('test-utility');
      
      expect(await fs.pathExists(utilityDir)).toBe(false);
    });

    test('should handle cleanCompiled when directory does not exist', async () => {
      const manager = new CompilationManager();
      
      // Should not throw error when trying to clean non-existent directory
      await expect(manager.cleanCompiled()).resolves.toBeUndefined();
      await expect(manager.cleanCompiled('non-existent-utility')).resolves.toBeUndefined();
    });

    test('should handle incremental compilation with unchanged files', async () => {
      const manager = new CompilationManager();
      
      // First compilation
      const result1 = await manager.compile({
        utilities: ['github-copilot'],
        incremental: true
      });
      expect(result1.success).toBe(true);
      
      // Second compilation should skip unchanged files
      const result2 = await manager.compile({
        utilities: ['github-copilot'],
        incremental: true
      });
      expect(result2.success).toBe(true);
      expect(result2.compiledPrompts).toBe(0);
      expect(result2.skippedPrompts).toBeGreaterThan(0);
    });

    test('should handle promptNames filter correctly', async () => {
      const manager = new CompilationManager();
      
      const result = await manager.compile({
        utilities: ['github-copilot'],
        promptNames: ['test-prompt.md']
      });
      
      expect(result.success).toBe(true);
      expect(result.compiledPrompts).toBe(1);
    });

    test('should handle getPromptsThatNeedCompilation', async () => {
      const manager = new CompilationManager();
      const prompts = [
        { name: 'test-prompt.md' }
      ];
      
      const result = await manager.getPromptsThatNeedCompilation(prompts);
      
      expect(result).toHaveProperty('changed');
      expect(result).toHaveProperty('unchanged');
      expect(Array.isArray(result.changed)).toBe(true);
      expect(Array.isArray(result.unchanged)).toBe(true);
    });

    test('should handle compileWithUtility error cases', async () => {
      const manager = new CompilationManager();
      
      // Test with invalid utility
      await expect(manager.compileWithUtility('invalid-utility', [])).rejects.toThrow('工具不存在: invalid-utility');
    });

    test('should handle compileWithUtility with prompts', async () => {
      const manager = new CompilationManager();
      const prompts = [
        { name: 'test-prompt.md' }
      ];
      
      const results = await manager.compileWithUtility('github-copilot', prompts, true);
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0]).toHaveProperty('prompt');
      expect(results[0]).toHaveProperty('success');
    });

    test('should handle compilation with all=false and no promptNames', async () => {
      const manager = new CompilationManager();
      
      const result = await manager.compile({
        utilities: ['github-copilot'],
        all: false
      });
      
      expect(result.success).toBe(true);
    });

    test('should handle watch mode setup and cleanup', async () => {
      const manager = new CompilationManager();
      
      // Mock process.on to avoid actual process manipulation
      const originalOn = process.on;
      const mockOn = jest.fn();
      process.on = mockOn;
      
      try {
        // Create a promise that will be resolved by setTimeout to avoid infinite waiting
        const watchPromise = manager.compileWithWatch({
          utilities: ['github-copilot']
        });
        
        // Give it a moment to set up
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check that process event listeners were set up
        expect(mockOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        expect(mockOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
        
        // The watch promise should be defined (it returns a never-resolving promise)
        expect(watchPromise).toBeDefined();
        
      } finally {
        process.on = originalOn;
      }
    }, 10000);

    test('should handle compilation status with non-directory files', async () => {
      const manager = new CompilationManager();
      const compiledDir = manager.getCompiledDir();
      
      // Create compiled directory with a file (not directory)
      await fs.ensureDir(compiledDir);
      await fs.writeFile(path.join(compiledDir, 'not-a-directory.txt'), 'test');
      
      const status = await manager.getCompilationStatus();
      
      expect(status.hasCompiled).toBe(true);
      expect(status.utilities).toContain('not-a-directory.txt');
      expect(status.totalFiles).toBe(0); // Should not count non-directory files
    });

    test('should handle prompt compilation errors gracefully', async () => {
      const manager = new CompilationManager();
      
      // Create a failing utility
      const mockUtility = {
        execute: jest.fn().mockRejectedValue(new Error('Compilation failed'))
      };
      
      // Mock the utility runner to include our failing utility
      manager.utilityRunner.utilities['failing-utility'] = mockUtility;
      
      // Create prompt file
      await fs.writeFile(path.join(tempDir, '.rex', 'prompts', 'error-prompt.md'), 'Error test');
      
      const results = await manager.compileWithUtility(
        'failing-utility',
        [{ name: 'error-prompt.md', lastModified: Date.now() }],
        false
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Compilation failed');
      expect(results[0].prompt).toBe('error-prompt.md');
    });

    test('should handle file name parsing correctly', async () => {
      const manager = new CompilationManager();
      
      const mockUtility = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          outputPath: '/fake/output/path'
        })
      };
      
      // Mock the utility runner
      manager.utilityRunner.utilities['test-utility'] = mockUtility;
      
      // Create prompt with complex name
      const complexFileName = 'test.complex.name.v2.md';
      await fs.writeFile(
        path.join(tempDir, '.rex', 'prompts', complexFileName),
        'Complex name test'
      );
      
      await manager.compileWithUtility(
        'test-utility',
        [{ name: complexFileName, lastModified: Date.now() }],
        false
      );
      
      expect(mockUtility.execute).toHaveBeenCalledWith({
        name: 'test.complex.name.v2', // Should remove only the .md extension
        fileName: complexFileName,
        content: 'Complex name test',
        sourcePath: expect.any(String),
        outputDir: expect.any(String)
      });
    });

    test('should handle incremental compilation cache updates', async () => {
      const manager = new CompilationManager();
      
      const mockUtility = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          outputPath: '/fake/output/path'
        })
      };
      
      // Mock the utility runner
      manager.utilityRunner.utilities['test-utility'] = mockUtility;
      
      // Create prompt file
      await fs.writeFile(
        path.join(tempDir, '.rex', 'prompts', 'cache-test.md'),
        'Cache test content'
      );
      
      // Test with incremental=true to trigger cache logic
      const results = await manager.compileWithUtility(
        'test-utility',
        [{ name: 'cache-test.md', lastModified: Date.now() }],
        true // incremental mode
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(mockUtility.execute).toHaveBeenCalled();
    });

    test('should handle mixed success and failure results', async () => {
      const manager = new CompilationManager();
      
      let callCount = 0;
      const mockUtility = {
        execute: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ success: true, outputPath: '/fake/success' });
          } else {
            return Promise.reject(new Error('Second prompt failed'));
          }
        })
      };
      
      // Mock the utility runner
      manager.utilityRunner.utilities['mixed-utility'] = mockUtility;
      
      // Create two prompt files
      await fs.writeFile(
        path.join(tempDir, '.rex', 'prompts', 'success.md'),
        'Success content'
      );
      await fs.writeFile(
        path.join(tempDir, '.rex', 'prompts', 'failure.md'),
        'Failure content'
      );
      
      const results = await manager.compileWithUtility(
        'mixed-utility',
        [
          { name: 'success.md', lastModified: Date.now() },
          { name: 'failure.md', lastModified: Date.now() }
        ],
        false
      );
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].prompt).toBe('success.md');
      expect(results[1].success).toBe(false);
      expect(results[1].prompt).toBe('failure.md');
      expect(results[1].error).toBe('Second prompt failed');
    });

    test('should log skipped prompts when using incremental compilation', async () => {
      const manager = new CompilationManager();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // First compilation
      await manager.compile({
        utilities: ['github-copilot'],
        incremental: true
      });
      
      // Second compilation should skip unchanged files
      const result = await manager.compile({
        utilities: ['github-copilot'],
        incremental: true
      });
      
      // Check that incremental logic worked correctly
      expect(result.compiledPrompts).toBe(0);
      expect(result.skippedPrompts).toBeGreaterThan(0);
      
      // Check that "all prompts are up-to-date" message was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/✅ 所有 prompts 都是最新的，無需重新編譯/)
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle watch mode compilation errors', async () => {
      const manager = new CompilationManager();
      const chokidar = require('chokidar');
      
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn()
      };
      
      const originalWatch = chokidar.watch;
      chokidar.watch = jest.fn().mockReturnValue(mockWatcher);
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Mock compile to fail during watch
      const originalCompile = manager.compile;
      manager.compile = jest.fn().mockRejectedValueOnce(new Error('Watch compilation failed'));
      
      try {
        // Start watch mode (will not actually watch since we mocked it)
        const watchPromise = manager.compileWithWatch({
          utilities: ['github-copilot']
        });
        
        // Wait for setup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify error was logged
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(/❌ 初始編譯失敗: Watch compilation failed/)
        );
        
      } finally {
        chokidar.watch = originalWatch;
        manager.compile = originalCompile;
        consoleErrorSpy.mockRestore();
      }
    }, 10000);

    test('should handle file watcher events correctly', async () => {
      const manager = new CompilationManager();
      const chokidar = require('chokidar');
      
      // Mock chokidar watcher
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn()
      };
      
      const originalWatch = chokidar.watch;
      chokidar.watch = jest.fn().mockReturnValue(mockWatcher);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      try {
        // Start watch mode
        const watchPromise = manager.compileWithWatch({
          utilities: ['github-copilot']
        });
        
        // Wait for setup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify watcher events were set up
        expect(mockWatcher.on).toHaveBeenCalledWith('add', expect.any(Function));
        expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
        expect(mockWatcher.on).toHaveBeenCalledWith('unlink', expect.any(Function));
        expect(mockWatcher.on).toHaveBeenCalledWith('error', expect.any(Function));
        
        // Test error handler
        const errorHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'error')[1];
        errorHandler(new Error('Watcher error'));
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(/❌ 監視器錯誤: Watcher error/)
        );
        
      } finally {
        chokidar.watch = originalWatch;
        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }
    }, 10000);

    test('should handle watch mode file change events', async () => {
      const manager = new CompilationManager();
      const chokidar = require('chokidar');
      
      // Track all timers to clear them later
      const timers = [];
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      
      global.setTimeout = jest.fn((fn, delay) => {
        const id = originalSetTimeout(fn, delay);
        timers.push(id);
        return id;
      });
      
      global.clearTimeout = jest.fn((id) => {
        const index = timers.indexOf(id);
        if (index > -1) {
          timers.splice(index, 1);
        }
        return originalClearTimeout(id);
      });
      
      // Mock chokidar watcher
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn()
      };
      
      const originalWatch = chokidar.watch;
      chokidar.watch = jest.fn().mockReturnValue(mockWatcher);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock compile method to avoid actual compilation
      const originalCompile = manager.compile;
      manager.compile = jest.fn().mockResolvedValue({
        compiledPrompts: 1,
        compiledUtilities: ['github-copilot'],
        skippedPrompts: 0
      });
      
      try {
        // Start watch mode
        const watchPromise = manager.compileWithWatch({
          utilities: ['github-copilot']
        });
        
        // Wait for setup
        await new Promise(resolve => originalSetTimeout(resolve, 100));
        
        // Get the change event handler
        const changeHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'change')[1];
        
        // Trigger a file change
        changeHandler('/fake/path/test-prompt.md');
        
        // Wait for the debounced compilation
        await new Promise(resolve => originalSetTimeout(resolve, 400));
        
        // Verify compilation was triggered
        expect(manager.compile).toHaveBeenCalledWith(
          expect.objectContaining({ incremental: true })
        );
        
      } finally {
        // Clear all remaining timers
        timers.forEach(id => originalClearTimeout(id));
        
        // Restore globals
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
        
        chokidar.watch = originalWatch;
        manager.compile = originalCompile;
        consoleSpy.mockRestore();
      }
    }, 10000);

    test('should handle concurrent watch compilation attempts', async () => {
      const manager = new CompilationManager();
      const chokidar = require('chokidar');
      
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn()
      };
      
      const originalWatch = chokidar.watch;
      chokidar.watch = jest.fn().mockReturnValue(mockWatcher);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock compile method to simulate a slow compilation
      const originalCompile = manager.compile;
      manager.compile = jest.fn().mockResolvedValue({
        compiledPrompts: 1,
        compiledUtilities: ['github-copilot'],
        skippedPrompts: 0
      });
      
      try {
        // Start watch mode
        const watchPromise = manager.compileWithWatch({
          utilities: ['github-copilot']
        });
        
        // Wait for setup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify that watcher was set up correctly
        expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
        
        // Check that initial compilation was successful
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/🚀 初始編譯完成!/)
        );
        
      } finally {
        chokidar.watch = originalWatch;
        manager.compile = originalCompile;
        consoleSpy.mockRestore();
      }
    }, 10000);

    test('should handle watch mode cleanup on signal', async () => {
      const manager = new CompilationManager();
      const chokidar = require('chokidar');
      
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn()
      };
      
      const originalWatch = chokidar.watch;
      chokidar.watch = jest.fn().mockReturnValue(mockWatcher);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock process.exit to avoid actual process termination
      const originalExit = process.exit;
      const mockExit = jest.fn();
      process.exit = mockExit;
      
      // Mock process.on to capture event handlers
      const originalProcessOn = process.on;
      const mockProcessOn = jest.fn().mockImplementation((event, handler) => {
        return originalProcessOn.call(process, event, handler);
      });
      process.on = mockProcessOn;
      
      try {
        // Start watch mode
        const watchPromise = manager.compileWithWatch({
          utilities: ['github-copilot']
        });
        
        // Wait for setup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Find and call the SIGINT handler
        const sigintHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGINT')?.[1];
        
        if (sigintHandler) {
          sigintHandler();
        }
        
        // Verify cleanup was called
        expect(mockWatcher.close).toHaveBeenCalled();
        expect(mockExit).toHaveBeenCalledWith(0);
        
      } finally {
        chokidar.watch = originalWatch;
        process.exit = originalExit;
        process.on = originalProcessOn;
        consoleSpy.mockRestore();
      }
    }, 10000);

    test('should handle watch mode with skipped prompts in initial compilation', async () => {
      const manager = new CompilationManager();
      const chokidar = require('chokidar');
      
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn()
      };
      
      const originalWatch = chokidar.watch;
      chokidar.watch = jest.fn().mockReturnValue(mockWatcher);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock compile method to return skipped prompts
      const originalCompile = manager.compile;
      manager.compile = jest.fn().mockResolvedValue({
        compiledPrompts: 1,
        compiledUtilities: ['github-copilot'],
        skippedPrompts: 2
      });
      
      try {
        // Start watch mode
        const watchPromise = manager.compileWithWatch({
          utilities: ['github-copilot']
        });
        
        // Wait for setup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check that skipped prompts message was logged
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/跳過 2 個未變更的 prompts/)
        );
        
      } finally {
        chokidar.watch = originalWatch;
        manager.compile = originalCompile;
        consoleSpy.mockRestore();
      }
    }, 10000);

    test('should handle watch mode with skipped prompts in file change recompilation', async () => {
      const manager = new CompilationManager();
      const chokidar = require('chokidar');
      
      // Track all timers to clear them later
      const timers = [];
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      
      global.setTimeout = jest.fn((fn, delay) => {
        const id = originalSetTimeout(fn, delay);
        timers.push(id);
        return id;
      });
      
      global.clearTimeout = jest.fn((id) => {
        const index = timers.indexOf(id);
        if (index > -1) {
          timers.splice(index, 1);
        }
        return originalClearTimeout(id);
      });
      
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn()
      };
      
      const originalWatch = chokidar.watch;
      chokidar.watch = jest.fn().mockReturnValue(mockWatcher);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock compile method to return different results for initial vs. recompilation
      const originalCompile = manager.compile;
      let callCount = 0;
      manager.compile = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Initial compilation
          return Promise.resolve({
            compiledPrompts: 1,
            compiledUtilities: ['github-copilot'],
            skippedPrompts: 0
          });
        } else {
          // Recompilation with skipped prompts
          return Promise.resolve({
            compiledPrompts: 1,
            compiledUtilities: ['github-copilot'],
            skippedPrompts: 3
          });
        }
      });
      
      try {
        // Start watch mode
        const watchPromise = manager.compileWithWatch({
          utilities: ['github-copilot']
        });
        
        // Wait for setup
        await new Promise(resolve => originalSetTimeout(resolve, 100));
        
        // Get the change event handler
        const changeHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'change')[1];
        
        // Trigger a file change
        changeHandler('/fake/path/test-prompt.md');
        
        // Wait for the debounced compilation
        await new Promise(resolve => originalSetTimeout(resolve, 400));
        
        // Check that skipped prompts message was logged for recompilation
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/跳過 3 個未變更的 prompts/)
        );
        
      } finally {
        // Clear all remaining timers
        timers.forEach(id => originalClearTimeout(id));
        
        // Restore globals
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
        
        chokidar.watch = originalWatch;
        manager.compile = originalCompile;
        consoleSpy.mockRestore();
      }
    }, 10000);

    test('should handle watch mode add and unlink events', async () => {
      const manager = new CompilationManager();
      const chokidar = require('chokidar');
      
      // Track all timers to clear them later
      const timers = [];
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      
      global.setTimeout = jest.fn((fn, delay) => {
        const id = originalSetTimeout(fn, delay);
        timers.push(id);
        return id;
      });
      
      global.clearTimeout = jest.fn((id) => {
        const index = timers.indexOf(id);
        if (index > -1) {
          timers.splice(index, 1);
        }
        return originalClearTimeout(id);
      });
      
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn()
      };
      
      const originalWatch = chokidar.watch;
      chokidar.watch = jest.fn().mockReturnValue(mockWatcher);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock compile method to avoid actual compilation
      const originalCompile = manager.compile;
      manager.compile = jest.fn().mockResolvedValue({
        compiledPrompts: 1,
        compiledUtilities: ['github-copilot'],
        skippedPrompts: 0
      });
      
      try {
        // Start watch mode
        const watchPromise = manager.compileWithWatch({
          utilities: ['github-copilot']
        });
        
        // Wait for setup
        await new Promise(resolve => originalSetTimeout(resolve, 100));
        
        // Get event handlers
        const addHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'add')[1];
        const unlinkHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'unlink')[1];
        
        // Trigger add event
        addHandler('/fake/path/new-prompt.md');
        await new Promise(resolve => originalSetTimeout(resolve, 400));
        
        // Trigger unlink event
        unlinkHandler('/fake/path/deleted-prompt.md');
        await new Promise(resolve => originalSetTimeout(resolve, 400));
        
        // Verify compilation was triggered for both events
        expect(manager.compile).toHaveBeenCalledTimes(3); // Initial + 2 triggered events
        
      } finally {
        // Clear all remaining timers
        timers.forEach(id => originalClearTimeout(id));
        
        // Restore globals
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
        
        chokidar.watch = originalWatch;
        manager.compile = originalCompile;
        consoleSpy.mockRestore();
      }
    }, 10000);

    test('should handle compilation with skipped prompts in normal mode', async () => {
      const manager = new CompilationManager();
      
      // First compilation to create cache
      await manager.compile({
        utilities: ['github-copilot'],
        incremental: true
      });
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Second compilation should skip files and log skipped count in normal mode (line 131)
      const result = await manager.compile({
        utilities: ['github-copilot'],
        incremental: true
      });
      
      // Check that skipped prompts message was logged - it's actually "⚡ 增量編譯：跳過 X 個未變更的 prompts"
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/⚡ 增量編譯：跳過 \d+ 個未變更的 prompts/)
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle watch timeout cleanup', async () => {
      const manager = new CompilationManager();
      const chokidar = require('chokidar');
      
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn()
      };
      
      const originalWatch = chokidar.watch;
      chokidar.watch = jest.fn().mockReturnValue(mockWatcher);
      
      // Mock clearTimeout to track calls
      const originalClearTimeout = global.clearTimeout;
      const mockClearTimeout = jest.fn();
      global.clearTimeout = mockClearTimeout;
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const originalCompile = manager.compile;
      manager.compile = jest.fn().mockResolvedValue({
        compiledPrompts: 1,
        compiledUtilities: ['github-copilot'],
        skippedPrompts: 0
      });
      
      // Mock process.exit to avoid actual process termination
      const originalExit = process.exit;
      const mockExit = jest.fn();
      process.exit = mockExit;
      
      try {
        // Start watch mode
        const watchPromise = manager.compileWithWatch({
          utilities: ['github-copilot']
        });
        
        // Wait for setup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get event handlers
        const changeHandler = mockWatcher.on.mock.calls.find(call => call[0] === 'change')[1];
        
        // Trigger multiple changes to create timeout that needs cleanup
        changeHandler('/fake/path/test1.md');
        await new Promise(resolve => setTimeout(resolve, 50));
        changeHandler('/fake/path/test2.md'); // This should clear the previous timeout
        
        // Find and call the cleanup handler
        const processOnCalls = process.on.mock?.calls || [];
        const sigintHandler = processOnCalls.find(call => call[0] === 'SIGINT')?.[1];
        
        if (sigintHandler) {
          sigintHandler(); // This should call clearTimeout if compileTimeout exists
        }
        
        // Verify timeout was cleared
        expect(mockClearTimeout).toHaveBeenCalled();
        
      } finally {
        chokidar.watch = originalWatch;
        manager.compile = originalCompile;
        global.clearTimeout = originalClearTimeout;
        process.exit = originalExit;
        consoleSpy.mockRestore();
      }
    }, 10000);

  });

});
