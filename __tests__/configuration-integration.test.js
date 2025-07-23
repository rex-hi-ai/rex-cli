const fs = require('fs-extra');
const path = require('path');
const ConfigurationManager = require('../ConfigurationManager');
const DeploymentManager = require('../DeploymentManager');

// Mock FileSystemManager
jest.mock('../FileSystemManager', () => {
  const path = require('path');
  return {
    getGlobalRexDir: () => path.join(__dirname, 'fixtures', 'global', '.rex'),
    getProjectRexDir: () => path.join(__dirname, 'fixtures', 'project', '.rex'),
    ensureRexDirs: jest.fn(),
    ensureConfigFile: jest.fn()
  };
});

// Mock SmartDetectionManager to avoid external dependencies
jest.mock('../SmartDetectionManager', () => {
  return jest.fn().mockImplementation(() => ({
    detectWithCache: jest.fn().mockResolvedValue({
      detectedUtilities: [{ name: 'github-copilot', confidence: 0.9 }]
    }),
    suggestUtilities: jest.fn().mockReturnValue([
      { utility: 'github-copilot', reason: 'Detected .github directory' }
    ])
  }));
});

// Mock CacheManager
jest.mock('../CacheManager', () => {
  return jest.fn().mockImplementation(() => ({
    loadCache: jest.fn().mockResolvedValue({ hashCache: {}, detectionCache: {} }),
    saveCache: jest.fn().mockResolvedValue()
  }));
});

describe('Configuration Integration Tests', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const globalConfigDir = path.join(fixturesDir, 'global', '.rex');
  const projectConfigDir = path.join(fixturesDir, 'project', '.rex');

  beforeEach(async () => {
    // Clean up and create fixture directories
    await fs.remove(fixturesDir);
    await fs.ensureDir(globalConfigDir);
    await fs.ensureDir(projectConfigDir);
  });

  afterEach(async () => {
    await fs.remove(fixturesDir);
  });

  it('應該正確處理多層級配置在部署中的應用', async () => {
    // 設定全域配置
    const globalConfig = {
      deploy: {
        defaultUtility: 'github-copilot',
        defaultOutput: '.github',
        force: false
      }
    };
    await fs.writeJson(path.join(globalConfigDir, 'config.json'), globalConfig);

    // 設定專案配置
    const projectConfig = {
      deploy: {
        defaultOutput: '.vscode',
        dryRun: true
      }
    };
    await fs.writeJson(path.join(projectConfigDir, 'config.json'), projectConfig);

    // CLI 選項（最高優先級）
    const cliOptions = {
      deploy: {
        force: true,
        defaultOutput: 'custom-output'
      }
    };

    // 測試配置載入和合併
    const configManager = new ConfigurationManager();
    await configManager.loadConfiguration(cliOptions);

    // 驗證配置合併正確性
    expect(configManager.get('deploy.defaultUtility')).toBe('github-copilot'); // 來自全域
    expect(configManager.get('deploy.defaultOutput')).toBe('custom-output'); // CLI 覆寫
    expect(configManager.get('deploy.dryRun')).toBe(true); // 來自專案
    expect(configManager.get('deploy.force')).toBe(true); // CLI 覆寫全域的 false

    // 測試在 DeploymentManager 中的使用
    const deploymentManager = new DeploymentManager();
    
    // Mock 編譯文件存在檢查
    const originalPathExists = fs.pathExists;
    fs.pathExists = jest.fn().mockImplementation((filePath) => {
      if (filePath.includes('compiled')) {
        return Promise.resolve(true);
      }
      return originalPathExists(filePath);
    });

    // Mock readdir 用於獲取編譯文件
    const originalReaddir = fs.readdir;
    fs.readdir = jest.fn().mockResolvedValue([
      { name: 'test.md', isDirectory: () => false, isFile: () => true }
    ]);

    try {
      const resolvedOptions = await deploymentManager._resolveDeploymentOptions(
        configManager, 
        { promptNames: ['test'], output: 'custom-output', force: true }
      );

      expect(resolvedOptions).toMatchObject({
        utility: 'github-copilot',
        output: 'custom-output', // CLI 優先
        dryRun: true, // 專案配置
        force: true // CLI 覆寫
      });
    } finally {
      // Restore mocks
      fs.pathExists = originalPathExists;
      fs.readdir = originalReaddir;
    }
  });

  it('應該在沒有配置文件時使用預設值', async () => {
    const configManager = new ConfigurationManager();
    const cliOptions = { utility: 'test-utility' };
    
    await configManager.loadConfiguration(cliOptions);
    
    // 只有 CLI 選項應該被設定
    expect(configManager.get('utility')).toBe('test-utility');
    expect(configManager.get('deploy.defaultUtility')).toBeUndefined();
    expect(configManager.get('nonexistent.key', 'default')).toBe('default');
  });

  it('應該正確驗證必要的配置項目', async () => {
    const configManager = new ConfigurationManager();
    await configManager.loadConfiguration({ requiredOption: 'value' });
    
    // 應該通過驗證
    expect(() => {
      configManager.validateRequiredConfig(['requiredOption']);
    }).not.toThrow();
    
    // 應該擲出錯誤對於缺少的配置
    expect(() => {
      configManager.validateRequiredConfig(['missing.option']);
    }).toThrow('Missing required configuration: missing.option');
  });

  it('應該支援巢狀配置的設定和取得', async () => {
    const configManager = new ConfigurationManager();
    await configManager.loadConfiguration();
    
    // 測試設定巢狀值
    configManager.set('deep.nested.option', 'nested-value');
    expect(configManager.get('deep.nested.option')).toBe('nested-value');
    
    // 測試覆蓋巢狀值
    configManager.set('deep.nested.option', 'updated-value');
    expect(configManager.get('deep.nested.option')).toBe('updated-value');
    
    // 測試取得不存在的巢狀值
    expect(configManager.get('deep.missing.option', 'fallback')).toBe('fallback');
  });

  it('應該正確儲存和重新載入配置', async () => {
    const configManager = new ConfigurationManager();
    await configManager.loadConfiguration();
    
    // 儲存專案配置
    const newProjectConfig = {
      deploy: {
        defaultUtility: 'new-utility',
        force: true
      }
    };
    
    await configManager.saveProjectConfig(newProjectConfig);
    
    // 驗證配置被更新
    expect(configManager.get('deploy.defaultUtility')).toBe('new-utility');
    expect(configManager.get('deploy.force')).toBe(true);
  });
});
