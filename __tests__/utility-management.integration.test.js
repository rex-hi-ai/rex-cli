const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ConfigurationManager = require('../ConfigurationManager');

describe('Utility Management Integration', () => {
  let tempDir;
  let configManager;
  let originalCwd;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `rex-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.ensureDir(tempDir);
    originalCwd = process.cwd();
    process.chdir(tempDir);
    
    configManager = new ConfigurationManager();
    
    // 建立測試目錄結構
    await fs.ensureDir(path.join(tempDir, '.rex'));
    await fs.writeJson(path.join(tempDir, '.rex', 'config.json'), {});
  });

  afterEach(() => {
    try {
      process.chdir(originalCwd);
    } catch (error) {
      // Ignore chdir errors during cleanup
    }
    try {
      fs.removeSync(tempDir);
    } catch (error) {
      // Ignore file system errors during cleanup
    }
  });

  describe('setUtilityConfig', () => {
    it('should set utility configuration', async () => {
      await configManager.loadConfiguration({});
      
      await configManager.setUtilityConfig('github-copilot', 'enabled', true);
      
      // 重新載入配置以驗證持久化
      const newConfigManager = new ConfigurationManager();
      await newConfigManager.loadConfiguration({});
      
      expect(newConfigManager.get('utilities.github-copilot.enabled')).toBe(true);
    });

    it('should set multiple configuration values for same utility', async () => {
      await configManager.loadConfiguration({});
      
      await configManager.setUtilityConfig('github-copilot', 'enabled', true);
      await configManager.setUtilityConfig('github-copilot', 'outputFormat', 'enhanced');
      await configManager.setUtilityConfig('github-copilot', 'maxFileSize', 1024);
      
      // 重新載入配置
      const newConfigManager = new ConfigurationManager();
      await newConfigManager.loadConfiguration({});
      
      expect(newConfigManager.get('utilities.github-copilot.enabled')).toBe(true);
      expect(newConfigManager.get('utilities.github-copilot.outputFormat')).toBe('enhanced');
      expect(newConfigManager.get('utilities.github-copilot.maxFileSize')).toBe(1024);
    });

    it('should handle JSON values correctly', async () => {
      await configManager.loadConfiguration({});
      
      const complexValue = { rules: ['rule1', 'rule2'], nested: { key: 'value' } };
      await configManager.setUtilityConfig('cursor', 'complexConfig', complexValue);
      
      // 重新載入配置
      const newConfigManager = new ConfigurationManager();
      await newConfigManager.loadConfiguration({});
      
      expect(newConfigManager.get('utilities.cursor.complexConfig')).toEqual(complexValue);
    });

    it('should remove configuration when value is undefined', async () => {
      await configManager.loadConfiguration({});
      
      // 先設定一些值
      await configManager.setUtilityConfig('github-copilot', 'enabled', true);
      await configManager.setUtilityConfig('github-copilot', 'outputFormat', 'standard');
      
      // 移除其中一個值
      await configManager.setUtilityConfig('github-copilot', 'outputFormat', undefined);
      
      // 重新載入配置
      const newConfigManager = new ConfigurationManager();
      await newConfigManager.loadConfiguration({});
      
      expect(newConfigManager.get('utilities.github-copilot.enabled')).toBe(true);
      expect(newConfigManager.get('utilities.github-copilot.outputFormat')).toBeUndefined();
    });

    it('should remove utility section when all configs are removed', async () => {
      await configManager.loadConfiguration({});
      
      // 設定工具配置
      await configManager.setUtilityConfig('github-copilot', 'enabled', true);
      
      // 移除所有配置
      await configManager.setUtilityConfig('github-copilot', 'enabled', undefined);
      
      // 重新載入配置
      const newConfigManager = new ConfigurationManager();
      await newConfigManager.loadConfiguration({});
      
      expect(newConfigManager.get('utilities.github-copilot')).toBeUndefined();
    });

    it('should remove utilities section when no utilities remain', async () => {
      await configManager.loadConfiguration({});
      
      // 設定兩個工具的配置
      await configManager.setUtilityConfig('github-copilot', 'enabled', true);
      await configManager.setUtilityConfig('cursor', 'enabled', false);
      
      // 移除所有工具配置
      await configManager.setUtilityConfig('github-copilot', 'enabled', undefined);
      await configManager.setUtilityConfig('cursor', 'enabled', undefined);
      
      // 重新載入配置
      const newConfigManager = new ConfigurationManager();
      await newConfigManager.loadConfiguration({});
      
      expect(newConfigManager.get('utilities')).toBeUndefined();
    });

    it('should handle multiple utilities independently', async () => {
      await configManager.loadConfiguration({});
      
      // 設定多個工具的不同配置
      await configManager.setUtilityConfig('github-copilot', 'enabled', true);
      await configManager.setUtilityConfig('github-copilot', 'format', 'enhanced');
      
      await configManager.setUtilityConfig('cursor', 'enabled', false);
      await configManager.setUtilityConfig('cursor', 'theme', 'dark');
      
      await configManager.setUtilityConfig('vscode', 'enabled', true);
      
      // 重新載入配置
      const newConfigManager = new ConfigurationManager();
      await newConfigManager.loadConfiguration({});
      
      expect(newConfigManager.get('utilities.github-copilot.enabled')).toBe(true);
      expect(newConfigManager.get('utilities.github-copilot.format')).toBe('enhanced');
      
      expect(newConfigManager.get('utilities.cursor.enabled')).toBe(false);
      expect(newConfigManager.get('utilities.cursor.theme')).toBe('dark');
      
      expect(newConfigManager.get('utilities.vscode.enabled')).toBe(true);
    });

    it('should preserve existing non-utility configuration', async () => {
      // 先設定一些非 utility 的配置
      await fs.writeJson(path.join(tempDir, '.rex', 'config.json'), {
        deploy: {
          defaultUtility: 'github-copilot',
          prompts: ['test-prompt']
        },
        otherSetting: 'value'
      });

      await configManager.loadConfiguration({});
      
      // 添加 utility 配置
      await configManager.setUtilityConfig('github-copilot', 'enabled', true);
      
      // 重新載入配置
      const newConfigManager = new ConfigurationManager();
      await newConfigManager.loadConfiguration({});
      
      // 驗證原有配置保持不變
      expect(newConfigManager.get('deploy.defaultUtility')).toBe('github-copilot');
      expect(newConfigManager.get('deploy.prompts')).toEqual(['test-prompt']);
      expect(newConfigManager.get('otherSetting')).toBe('value');
      
      // 驗證新配置已添加
      expect(newConfigManager.get('utilities.github-copilot.enabled')).toBe(true);
    });
  });
});
