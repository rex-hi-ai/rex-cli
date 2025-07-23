const DeploymentManager = require('../src/DeploymentManager');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

jest.mock('fs-extra');
jest.mock('os');
jest.mock('../src/ConfigurationManager');
jest.mock('../src/SmartDetectionManager');
jest.mock('../src/CacheManager');
jest.mock('../src/PromptMetadataParser');

describe('DeploymentManager', () => {
  let deploymentManager;
  const mockHomeDir = '/home/user';
  const mockCompiledDir = '/home/user/.rex/compiled';

  beforeEach(() => {
    jest.clearAllMocks();
    os.homedir.mockReturnValue(mockHomeDir);
    deploymentManager = new DeploymentManager();
  });

  describe('constructor', () => {
    it('should initialize with correct paths', () => {
      expect(deploymentManager.homeDir).toBe(mockHomeDir);
      expect(deploymentManager.compiledDir).toBe(mockCompiledDir);
    });
  });

  describe('deploy', () => {
    it('should throw error if utility is not specified', async () => {
      await expect(deploymentManager.deploy({}))
        .rejects.toThrow('Utility must be specified using --utility flag');
    });

    it('should throw error if utility directory does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      await expect(deploymentManager.deploy({ utility: 'github-copilot' }))
        .rejects.toThrow('No compiled files found for utility: github-copilot. Run \'rex-cli utility compile\' first.');
    });

    it('should throw error if no compiled files found', async () => {
      fs.pathExists.mockResolvedValue(true);
      deploymentManager.getCompiledFiles = jest.fn().mockResolvedValue([]);

      await expect(deploymentManager.deploy({ utility: 'github-copilot' }))
        .rejects.toThrow('No matching compiled prompts found');
    });


    it('should return dry run result in dry run mode', async () => {
      fs.pathExists.mockResolvedValue(true);
      const mockFiles = [
        {
          absolutePath: '/home/user/.rex/compiled/github-copilot/.github/copilot/prompts/test.prompt.md',
          relativePath: '.github/copilot/prompts/test.prompt.md',
          promptName: 'test',
          fileName: 'test.prompt.md'
        }
      ];
      deploymentManager.getCompiledFiles = jest.fn().mockResolvedValue(mockFiles);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = await deploymentManager.deploy({ 
        utility: 'github-copilot', 
        dryRun: true 
      });

      expect(result.dryRun).toBe(true);
      expect(result.files).toEqual(mockFiles);
      expect(consoleSpy).toHaveBeenCalledWith('\n🔍 Dry run mode - no files will be written');
      
      consoleSpy.mockRestore();
    });

    it('should show filter information in dry run mode when filters are applied', async () => {
      fs.pathExists.mockResolvedValue(true);
      const mockFiles = [
        {
          absolutePath: '/home/user/.rex/compiled/github-copilot/.github/copilot/prompts/test.prompt.md',
          relativePath: '.github/copilot/prompts/test.prompt.md',
          promptName: 'test',
          fileName: 'test.prompt.md'
        }
      ];
      deploymentManager.getCompiledFiles = jest.fn().mockResolvedValue(mockFiles);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = await deploymentManager.deploy({ 
        utility: 'github-copilot', 
        dryRun: true,
        tags: ['javascript', 'web'],
        category: 'frontend',
        excludeTags: ['deprecated'] 
      });

      expect(result.dryRun).toBe(true);
      expect(result.appliedFilters).toEqual({
        tags: ['javascript', 'web'],
        category: 'frontend',
        excludeTags: ['deprecated']
      });
      expect(consoleSpy).toHaveBeenCalledWith('\n🔍 Dry run mode - no files will be written');
      expect(consoleSpy).toHaveBeenCalledWith('\n📋 Applied filters:');
      expect(consoleSpy).toHaveBeenCalledWith('   Tags: [javascript, web]');
      expect(consoleSpy).toHaveBeenCalledWith('   Category: frontend');
      expect(consoleSpy).toHaveBeenCalledWith('   Exclude tags: [deprecated]');
      expect(consoleSpy).toHaveBeenCalledWith('\nFiles that would be deployed (1 files):');
      
      consoleSpy.mockRestore();
    });

    it('should deploy files successfully', async () => {
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath === path.join(mockCompiledDir, 'github-copilot')) return true;
        return false; // File doesn't exist
      });
      
      const mockFiles = [
        {
          absolutePath: '/home/user/.rex/compiled/github-copilot/.github/copilot/prompts/test.prompt.md',
          relativePath: '.github/copilot/prompts/test.prompt.md',
          promptName: 'test',
          fileName: 'test.prompt.md'
        }
      ];
      deploymentManager.getCompiledFiles = jest.fn().mockResolvedValue(mockFiles);
      fs.ensureDir.mockResolvedValue();
      fs.copy.mockResolvedValue();

      const result = await deploymentManager.deploy({ 
        utility: 'github-copilot' 
      });

      expect(result.deployed).toBe(1);
      expect(result.overwritten).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.deployedFiles).toHaveLength(1);
      expect(fs.copy).toHaveBeenCalledWith(
        mockFiles[0].absolutePath,
        expect.stringContaining('.github/copilot/prompts/test.prompt.md')
      );
    });

    it('should skip existing files without force flag', async () => {
      fs.pathExists.mockImplementation((filePath) => {
        return true; // All paths exist
      });
      
      const mockFiles = [
        {
          absolutePath: '/home/user/.rex/compiled/github-copilot/.github/copilot/prompts/test.prompt.md',
          relativePath: '.github/copilot/prompts/test.prompt.md',
          promptName: 'test',
          fileName: 'test.prompt.md'
        }
      ];
      deploymentManager.getCompiledFiles = jest.fn().mockResolvedValue(mockFiles);

      const result = await deploymentManager.deploy({ 
        utility: 'github-copilot' 
      });

      expect(result.deployed).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.skippedFiles[0].reason).toContain('use --force to overwrite');
      expect(fs.copy).not.toHaveBeenCalled();
    });

    it('should overwrite existing files with force flag', async () => {
      fs.pathExists.mockImplementation((filePath) => {
        return true; // All paths exist
      });
      
      const mockFiles = [
        {
          absolutePath: '/home/user/.rex/compiled/github-copilot/.github/copilot/prompts/test.prompt.md',
          relativePath: '.github/copilot/prompts/test.prompt.md',
          promptName: 'test',
          fileName: 'test.prompt.md'
        }
      ];
      deploymentManager.getCompiledFiles = jest.fn().mockResolvedValue(mockFiles);
      fs.ensureDir.mockResolvedValue();
      fs.copy.mockResolvedValue();

      const result = await deploymentManager.deploy({ 
        utility: 'github-copilot',
        force: true 
      });

      expect(result.deployed).toBe(0);
      expect(result.overwritten).toBe(1);
      expect(result.skipped).toBe(0);
      expect(fs.copy).toHaveBeenCalled();
    });
  });

  describe('getCompiledFiles', () => {
    it('should scan directory and return .md files', async () => {
      const mockRootEntries = [
        { name: 'prompts', isDirectory: () => true, isFile: () => false }
      ];
      const mockPromptsEntries = [
        { name: 'test.prompt.md', isDirectory: () => false, isFile: () => true }
      ];

      fs.readdir.mockImplementation((dir) => {
        if (dir.includes('prompts')) {
          return mockPromptsEntries;
        }
        return mockRootEntries;
      });

      const result = await deploymentManager.getCompiledFiles('/test/dir');

      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('test.prompt.md');
      expect(result[0].promptName).toBe('test');
    });

    it('should filter files by prompt names', async () => {
      const mockDirEntries = [
        { name: 'test1.prompt.md', isDirectory: () => false, isFile: () => true },
        { name: 'test2.prompt.md', isDirectory: () => false, isFile: () => true }
      ];

      fs.readdir.mockResolvedValue(mockDirEntries);

      const result = await deploymentManager.getCompiledFiles('/test/dir', ['test1']);

      expect(result).toHaveLength(1);
      expect(result[0].promptName).toBe('test1');
    });
  });

  describe('getDestinationPath', () => {
    it('should return relative path when no custom output', () => {
      const result = deploymentManager.getDestinationPath('.github/copilot/prompts/test.md');
      expect(result).toBe('.github/copilot/prompts/test.md');
    });

    it('should prepend custom output path when specified', () => {
      const result = deploymentManager.getDestinationPath('.github/copilot/prompts/test.md', 'custom/output');
      expect(result).toBe('custom/output/.github/copilot/prompts/test.md');
    });
  });

  describe('formatDeploymentResult', () => {
    it('should return empty string for dry run mode', () => {
      const result = deploymentManager.formatDeploymentResult({ dryRun: true });
      expect(result).toBe('');
    });

    it('should format successful deployment result', () => {
      const mockResult = {
        deployed: 2,
        overwritten: 1,
        skipped: 0,
        deployedFiles: [
          { source: 'file1.md', destination: 'dest1.md' },
          { source: 'file2.md', destination: 'dest2.md' }
        ],
        overwrittenFiles: [
          { source: 'file3.md', destination: 'dest3.md' }
        ],
        skippedFiles: [],
        utility: 'github-copilot',
        outputDir: '/project'
      };

      const output = deploymentManager.formatDeploymentResult(mockResult);

      expect(output).toContain('✨ Deployment completed!');
      expect(output).toContain('Utility: github-copilot');
      expect(output).toContain('Output directory: /project');
      expect(output).toContain('✅ Deployed 2 file(s)');
      expect(output).toContain('🔄 Overwritten 1 file(s)');
    });

    it('should format result with skipped files', () => {
      const mockResult = {
        deployed: 0,
        overwritten: 0,
        skipped: 2,
        deployedFiles: [],
        overwrittenFiles: [],
        skippedFiles: [
          { source: 'file1.md', destination: 'dest1.md', reason: 'File already exists' },
          { source: 'file2.md', destination: 'dest2.md', reason: 'Permission denied' }
        ],
        utility: 'github-copilot',
        outputDir: '/project'
      };

      const output = deploymentManager.formatDeploymentResult(mockResult);

      expect(output).toContain('⚠️  Skipped 2 file(s)');
      expect(output).toContain('Reason: File already exists');
      expect(output).toContain('Reason: Permission denied');
    });
  });

  describe('deployWithConfig', () => {
    let mockConfigManager;
    
    beforeEach(() => {
      mockConfigManager = {
        loadConfiguration: jest.fn(),
        get: jest.fn()
      };
      
      // Mock ConfigurationManager constructor
      const ConfigurationManager = require('../src/ConfigurationManager');
      ConfigurationManager.mockImplementation(() => mockConfigManager);
    });

    it('should deploy with configuration', async () => {
      mockConfigManager.get.mockImplementation((key, defaultValue) => {
        if (key === 'deploy.defaultUtility') return 'github-copilot';
        return defaultValue;
      });

      deploymentManager.deploy = jest.fn().mockResolvedValue({ deployed: 1 });
      deploymentManager._resolveDeploymentOptions = jest.fn().mockResolvedValue({
        utility: 'github-copilot',
        promptNames: [],
        output: null,
        dryRun: false,
        force: false
      });

      const result = await deploymentManager.deployWithConfig({ utility: 'github-copilot' });

      expect(mockConfigManager.loadConfiguration).toHaveBeenCalled();
      expect(deploymentManager._resolveDeploymentOptions).toHaveBeenCalled();
      expect(deploymentManager.deploy).toHaveBeenCalled();
      expect(result.deployed).toBe(1);
    });
  });

  describe('_resolveDeploymentOptions', () => {
    let mockConfigManager;
    let mockSmartDetectionManager;
    let mockCacheManager;
    
    beforeEach(() => {
      mockConfigManager = {
        get: jest.fn()
      };
      
      mockSmartDetectionManager = {
        detectWithCache: jest.fn(),
        suggestUtilities: jest.fn(),
        isCacheValid: jest.fn()
      };
      
      mockCacheManager = {
        loadCache: jest.fn(),
        saveCache: jest.fn()
      };
      
      // Mock the required modules
      const SmartDetectionManager = require('../src/SmartDetectionManager');
      const CacheManager = require('../src/CacheManager');
      
      SmartDetectionManager.mockImplementation(() => mockSmartDetectionManager);
      CacheManager.mockImplementation(() => mockCacheManager);
    });

    it('should return options with CLI utility specified', async () => {
      const cliOptions = { utility: 'github-copilot', force: true };
      mockConfigManager.get.mockReturnValue(undefined);

      const result = await deploymentManager._resolveDeploymentOptions(mockConfigManager, cliOptions);

      expect(result.utility).toBe('github-copilot');
      expect(result.force).toBe(true);
    });

    it('should use smart detection when no utility specified', async () => {
      const cliOptions = {};
      mockConfigManager.get.mockReturnValue(undefined);
      mockCacheManager.loadCache.mockResolvedValue({ detectionCache: {}, hashCache: {} });
      mockSmartDetectionManager.detectWithCache.mockResolvedValue({
        detectedUtilities: ['github-copilot']
      });
      mockSmartDetectionManager.suggestUtilities.mockReturnValue([
        { utility: 'github-copilot', confidence: 0.9 }
      ]);
      mockSmartDetectionManager.isCacheValid.mockReturnValue(false);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await deploymentManager._resolveDeploymentOptions(mockConfigManager, cliOptions);

      expect(mockSmartDetectionManager.detectWithCache).toHaveBeenCalled();
      expect(mockSmartDetectionManager.suggestUtilities).toHaveBeenCalled();
      expect(result.utility).toBe('github-copilot');
      expect(consoleSpy).toHaveBeenCalledWith('🎯 智慧偵測建議使用工具: github-copilot');
      
      consoleSpy.mockRestore();
    });

    it('should use config default when no CLI utility and no detection', async () => {
      const cliOptions = {};
      mockConfigManager.get.mockImplementation((key, defaultValue) => {
        if (key === 'deploy.defaultUtility') return 'cursor';
        return defaultValue;
      });

      const result = await deploymentManager._resolveDeploymentOptions(mockConfigManager, cliOptions);

      expect(result.utility).toBe('cursor');
    });

    it('should handle cache validity check', async () => {
      const cliOptions = {};
      mockConfigManager.get.mockReturnValue(undefined);
      mockCacheManager.loadCache.mockResolvedValue({ 
        detectionCache: { '/current/path': { valid: true } }, 
        hashCache: {} 
      });
      mockSmartDetectionManager.detectWithCache.mockResolvedValue({
        detectedUtilities: ['github-copilot']
      });
      mockSmartDetectionManager.suggestUtilities.mockReturnValue([
        { utility: 'github-copilot', confidence: 0.9 }
      ]);
      mockSmartDetectionManager.isCacheValid.mockReturnValue(true); // Cache is valid

      const result = await deploymentManager._resolveDeploymentOptions(mockConfigManager, cliOptions);

      expect(mockCacheManager.saveCache).not.toHaveBeenCalled(); // Should not save cache if valid
      expect(result.utility).toBe('github-copilot');
    });

    it('should return all configuration options', async () => {
      const cliOptions = {
        utility: 'github-copilot',
        promptNames: ['test'],
        output: 'custom-output',
        dryRun: true,
        force: true
      };
      mockConfigManager.get.mockReturnValue(undefined);

      const result = await deploymentManager._resolveDeploymentOptions(mockConfigManager, cliOptions);

      expect(result).toEqual({
        promptNames: ['test'],
        utility: 'github-copilot',
        output: 'custom-output',
        tags: undefined,
        category: undefined,
        excludeTags: undefined,
        dryRun: true,
        force: true
      });
    });
  });

  describe('_applyMetadataFiltering', () => {
    let mockMetadataParser;
    
    beforeEach(() => {
      mockMetadataParser = {
        filterPrompts: jest.fn()
      };
      
      // Mock PromptMetadataParser constructor
      const PromptMetadataParser = require('../src/PromptMetadataParser');
      PromptMetadataParser.mockImplementation(() => mockMetadataParser);
    });

    it('should filter files by tags', async () => {
      const mockFiles = [
        { promptName: 'test1', fileName: 'test1.prompt.md' },
        { promptName: 'test2', fileName: 'test2.prompt.md' }
      ];
      
      mockMetadataParser.filterPrompts.mockResolvedValue(['test1.md']);
      
      const result = await deploymentManager._applyMetadataFiltering(mockFiles, {
        tags: ['javascript']
      });
      
      expect(mockMetadataParser.filterPrompts).toHaveBeenCalledWith(
        ['test1.md', 'test2.md'],
        { tags: ['javascript'], excludeTags: [], category: undefined }
      );
      expect(result).toHaveLength(1);
      expect(result[0].promptName).toBe('test1');
    });

    it('should filter files by category', async () => {
      const mockFiles = [
        { promptName: 'frontend', fileName: 'frontend.prompt.md' },
        { promptName: 'backend', fileName: 'backend.prompt.md' }
      ];
      
      mockMetadataParser.filterPrompts.mockResolvedValue(['frontend.md']);
      
      const result = await deploymentManager._applyMetadataFiltering(mockFiles, {
        category: 'web'
      });
      
      expect(mockMetadataParser.filterPrompts).toHaveBeenCalledWith(
        ['frontend.md', 'backend.md'],
        { tags: [], excludeTags: [], category: 'web' }
      );
      expect(result).toHaveLength(1);
      expect(result[0].promptName).toBe('frontend');
    });

    it('should exclude files by tags', async () => {
      const mockFiles = [
        { promptName: 'test1', fileName: 'test1.prompt.md' },
        { promptName: 'test2', fileName: 'test2.prompt.md' }
      ];
      
      mockMetadataParser.filterPrompts.mockResolvedValue(['test2.md']);
      
      const result = await deploymentManager._applyMetadataFiltering(mockFiles, {
        excludeTags: ['deprecated']
      });
      
      expect(mockMetadataParser.filterPrompts).toHaveBeenCalledWith(
        ['test1.md', 'test2.md'],
        { tags: [], excludeTags: ['deprecated'], category: undefined }
      );
      expect(result).toHaveLength(1);
      expect(result[0].promptName).toBe('test2');
    });

    it('should handle complex filtering with multiple options', async () => {
      const mockFiles = [
        { promptName: 'web-api', fileName: 'web-api.prompt.md' },
        { promptName: 'mobile-ui', fileName: 'mobile-ui.prompt.md' }
      ];
      
      mockMetadataParser.filterPrompts.mockResolvedValue(['web-api.md']);
      
      const result = await deploymentManager._applyMetadataFiltering(mockFiles, {
        tags: ['javascript', 'api'],
        category: 'web',
        excludeTags: ['deprecated']
      });
      
      expect(mockMetadataParser.filterPrompts).toHaveBeenCalledWith(
        ['web-api.md', 'mobile-ui.md'],
        { tags: ['javascript', 'api'], excludeTags: ['deprecated'], category: 'web' }
      );
      expect(result).toHaveLength(1);
      expect(result[0].promptName).toBe('web-api');
    });

    it('should return original files if filtering fails', async () => {
      const mockFiles = [
        { promptName: 'test1', fileName: 'test1.prompt.md' }
      ];
      
      mockMetadataParser.filterPrompts.mockRejectedValue(new Error('Parse error'));
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = await deploymentManager._applyMetadataFiltering(mockFiles, {
        tags: ['javascript']
      });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Failed to apply metadata filtering: Parse error'
      );
      expect(result).toEqual(mockFiles);
      
      consoleSpy.mockRestore();
    });

    it('should return empty array if no files match filter', async () => {
      const mockFiles = [
        { promptName: 'test1', fileName: 'test1.prompt.md' },
        { promptName: 'test2', fileName: 'test2.prompt.md' }
      ];
      
      mockMetadataParser.filterPrompts.mockResolvedValue([]);
      
      const result = await deploymentManager._applyMetadataFiltering(mockFiles, {
        tags: ['nonexistent']
      });
      
      expect(result).toHaveLength(0);
    });
  });

  describe('getCompiledFiles with filtering', () => {
    let mockMetadataParser;
    
    beforeEach(() => {
      mockMetadataParser = {
        filterPrompts: jest.fn()
      };
      
      // Mock PromptMetadataParser constructor
      const PromptMetadataParser = require('../src/PromptMetadataParser');
      PromptMetadataParser.mockImplementation(() => mockMetadataParser);
    });

    it('should apply filtering when filter options provided', async () => {
      const mockDirEntries = [
        { name: 'test1.prompt.md', isDirectory: () => false, isFile: () => true },
        { name: 'test2.prompt.md', isDirectory: () => false, isFile: () => true }
      ];
      
      fs.readdir.mockResolvedValue(mockDirEntries);
      mockMetadataParser.filterPrompts.mockResolvedValue(['test1.md']);
      
      const result = await deploymentManager.getCompiledFiles('/test/dir', [], 'github-copilot', {
        tags: ['javascript']
      });
      
      expect(mockMetadataParser.filterPrompts).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].promptName).toBe('test1');
    });

    it('should skip filtering when no filter options provided', async () => {
      const mockDirEntries = [
        { name: 'test1.prompt.md', isDirectory: () => false, isFile: () => true },
        { name: 'test2.prompt.md', isDirectory: () => false, isFile: () => true }
      ];
      
      fs.readdir.mockResolvedValue(mockDirEntries);
      
      const result = await deploymentManager.getCompiledFiles('/test/dir', [], 'github-copilot', {});
      
      expect(mockMetadataParser.filterPrompts).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  describe('getCompiledFiles - additional cases', () => {
    it('should handle instruction files', async () => {
      const mockDirEntries = [
        { name: 'test.instruction.md', isDirectory: () => false, isFile: () => true }
      ];

      fs.readdir.mockResolvedValue(mockDirEntries);

      const result = await deploymentManager.getCompiledFiles('/test/dir');

      expect(result).toHaveLength(1);
      expect(result[0].promptName).toBe('test');
      expect(result[0].fileName).toBe('test.instruction.md');
    });

    it('should skip non-md files', async () => {
      const mockDirEntries = [
        { name: 'test.txt', isDirectory: () => false, isFile: () => true },
        { name: 'test.md', isDirectory: () => false, isFile: () => true }
      ];

      fs.readdir.mockResolvedValue(mockDirEntries);

      const result = await deploymentManager.getCompiledFiles('/test/dir');

      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('test.md');
    });

    it('should handle nested directory structures', async () => {
      const mockRootEntries = [
        { name: 'subdir', isDirectory: () => true, isFile: () => false }
      ];
      const mockSubdirEntries = [
        { name: 'nested.prompt.md', isDirectory: () => false, isFile: () => true }
      ];

      fs.readdir.mockImplementation((dir) => {
        if (dir.includes('subdir')) {
          return mockSubdirEntries;
        }
        return mockRootEntries;
      });

      const result = await deploymentManager.getCompiledFiles('/test/dir');

      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('nested.prompt.md');
      expect(result[0].relativePath).toContain('subdir');
    });
  });
});
