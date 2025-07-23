const ConfigurationManager = require('../src/ConfigurationManager');
const fs = require('fs-extra');
const path = require('path');

// Mock FileSystemManager
jest.mock('../src/FileSystemManager', () => ({
  getGlobalRexDir: () => '/home/user/.rex',
  getProjectRexDir: () => '/project/.rex'
}));

jest.mock('fs-extra');

const mockCliOptions = {
  option1: 'cli-value1',
  option2: 'cli-value2'
};

const mockGlobalConfig = {
  option1: 'global-value1',
  option3: 'global-value3'
};

const mockProjectConfig = {
  option2: 'project-value2',
  option4: 'project-value4'
};

const makeConfigManager = async () => {
  const manager = new ConfigurationManager();
  fs.pathExists.mockImplementation((filePath) => {
    if (filePath.includes('.rex/config.json')) return Promise.resolve(true);
    return Promise.resolve(false);
  });

  const fakeReadJson = jest.fn();
  fakeReadJson.mockResolvedValueOnce(mockGlobalConfig) // For global
    .mockResolvedValueOnce(mockProjectConfig); // For project

  fs.readJson = fakeReadJson;

  await manager.loadConfiguration(mockCliOptions);
  return manager;
};

describe('ConfigurationManager', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('應該正確合併 CLI、專案和全域配置', async () => {
    const manager = await makeConfigManager();
    const mergedConfig = manager.getAll();
    
    expect(mergedConfig).toEqual({
      option1: 'cli-value1',  // CLI should override global
      option2: 'cli-value2',  // CLI should override project
      option3: 'global-value3',
      option4: 'project-value4'
    });
  });

  it('應該在未載入配置時擲出錯誤', () => {
    const manager = new ConfigurationManager();
    expect(() => manager.get('option1')).toThrow('Configuration not loaded');
  });

  it('應該正確取得巢狀配置值', async () => {
    const manager = await makeConfigManager();
    manager.set('nested.option', 'nested-value');
    expect(manager.get('nested.option')).toBe('nested-value');
  });

  it('應該正確設定巢狀配置值', async () => {
    const manager = await makeConfigManager();
    manager.set('new.option', 'new-value');
    expect(manager.get('new.option')).toBe('new-value');
  });

  it('應該驗證必要的配置項目', async () => {
    const manager = await makeConfigManager();
    manager.set('required.option', 'value');
    expect(() => manager.validateRequiredConfig(['required.option'])).not.toThrow();
    expect(() => manager.validateRequiredConfig(['missing.option'])).toThrow('Missing required configuration: missing.option');
  });

  it('應該正確重設管理器', async () => {
    const manager = await makeConfigManager();
    expect(manager.isLoaded()).toBe(true);
    manager.reset();
    expect(manager.isLoaded()).toBe(false);
    expect(() => manager.get('option1')).toThrow('Configuration not loaded');
  });

  it('應該正確返回配置來源', async () => {
    const manager = await makeConfigManager();
    const sources = manager.getConfigSources();
    expect(sources).toHaveProperty('global');
    expect(sources).toHaveProperty('project');
    expect(sources).toHaveProperty('merged');
  });

  it('在保存專案配置時應該處理文件系統錯誤', async () => {
    const manager = await makeConfigManager();
    fs.ensureDir.mockResolvedValue();
    const mockError = new Error('Filesystem error');
    fs.writeJson.mockRejectedValue(mockError);
    await expect(manager.saveProjectConfig({ key: 'value' })).rejects.toThrow('Failed to save project config');
  });

  it('在保存全域配置時應該處理文件系統錯誤', async () => {
    const manager = await makeConfigManager();
    fs.ensureDir.mockResolvedValue();
    const mockError = new Error('Filesystem error');
    fs.writeJson.mockRejectedValue(mockError);
    await expect(manager.saveGlobalConfig({ key: 'value' })).rejects.toThrow('Failed to save global config');
  });

  it('應該處理配置文件不存在的情況', async () => {
    const manager = new ConfigurationManager();
    fs.pathExists.mockResolvedValue(false);
    fs.readJson.mockResolvedValue({});
    
    const config = await manager.loadConfiguration({});
    expect(config).toEqual({});
  });

  it('應該處理配置文件讀取錯誤', async () => {
    const manager = new ConfigurationManager();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    fs.pathExists.mockResolvedValue(true);
    fs.readJson.mockRejectedValue(new Error('Parse error'));
    
    const config = await manager.loadConfiguration({});
    expect(config).toEqual({});
    expect(consoleWarnSpy).toHaveBeenCalled();
    
    consoleWarnSpy.mockRestore();
  });

  it('應該處理設定巢狀值時建立中間層級', async () => {
    const manager = await makeConfigManager();
    manager.set('deep.nested.option', 'deep-value');
    expect(manager.get('deep.nested.option')).toBe('deep-value');
  });

  it('應該處理 setUtilityConfig 方法', async () => {
    const manager = await makeConfigManager();
    fs.ensureDir.mockResolvedValue();
    fs.writeJson.mockResolvedValue();
    
    await manager.setUtilityConfig('test-utility', 'option1', 'value1');
    
    expect(fs.writeJson).toHaveBeenCalled();
  });

  it('應該處理 setUtilityConfig 錯誤', async () => {
    const manager = await makeConfigManager();
    fs.ensureDir.mockResolvedValue();
    const mockError = new Error('Write error');
    fs.writeJson.mockRejectedValue(mockError);
    
    await expect(manager.setUtilityConfig('test-utility', 'option1', 'value1'))
      .rejects.toThrow('Failed to set utility config');
  });

  it('應該處理未載入配置時的驗證', () => {
    const manager = new ConfigurationManager();
    expect(() => manager.validateRequiredConfig(['key'])).toThrow('Configuration not loaded');
    expect(() => manager.getAll()).toThrow('Configuration not loaded');
  });

  it('應該處理在沒有配置時設定值', () => {
    const manager = new ConfigurationManager();
    manager.set('key', 'value');
    expect(manager.get('key')).toBe('value');
  });

  it('應該處理載入配置時的一般錯誤', async () => {
    const manager = new ConfigurationManager();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    // 模擬讀取配置時發生錯誤，但 loadConfiguration 不應該綜續拋出錯誤
    fs.pathExists.mockResolvedValue(true);
    
    // 模擬在 _loadGlobalConfig 和 _loadProjectConfig 中的錯誤
    const fsError = new Error('General file system error');
    fs.readJson.mockRejectedValue(fsError);
    
    // 應該成功載入，但會顯示警告
    const config = await manager.loadConfiguration({});
    expect(config).toEqual({});
    expect(consoleWarnSpy).toHaveBeenCalled();
    
    consoleWarnSpy.mockRestore();
  });

  it('應該處理 saveGlobalConfig 後重新載入配置', async () => {
    const manager = await makeConfigManager();
    fs.ensureDir.mockResolvedValue();
    fs.writeJson.mockResolvedValue();
    
    const newConfig = { newKey: 'newValue' };
    await manager.saveGlobalConfig(newConfig);
    
    // 驗證全域配置被更新
    const sources = manager.getConfigSources();
    expect(sources.global).toEqual(newConfig);
  });

  it('應該處理 setUtilityConfig 當配置尚未載入時', async () => {
    const manager = new ConfigurationManager();
    
    // 模擬 loadConfiguration 被呼叫
    fs.pathExists.mockResolvedValue(false);
    fs.readJson.mockResolvedValue({});
    fs.ensureDir.mockResolvedValue();
    fs.writeJson.mockResolvedValue();
    
    await manager.setUtilityConfig('test-utility', 'option1', 'value1');
    
    expect(fs.writeJson).toHaveBeenCalled();
  });

  it('應該在 _mergeConfigurations 拋出錯誤時拋出 FileSystemError (覆蓋 line 46)', async () => {
    const manager = new ConfigurationManager();
    
    // 模擬 _loadGlobalConfig 和 _loadProjectConfig 正常執行
    fs.pathExists.mockResolvedValue(true);
    fs.readJson.mockResolvedValueOnce(mockGlobalConfig)
                .mockResolvedValueOnce(mockProjectConfig);
    
    // 模擬 _mergeConfigurations 過程中發生嚴重錯誤，透過覆寫方法
    const originalMergeConfigurations = manager._mergeConfigurations;
    manager._mergeConfigurations = jest.fn().mockImplementation(() => {
      throw new Error('Critical merge error');
    });
    
    await expect(manager.loadConfiguration({})).rejects.toThrow('Failed to load configuration: Critical merge error');
    
    // 恢復原方法
    manager._mergeConfigurations = originalMergeConfigurations;
  });

  describe('部署過濾器配置測試', () => {
    it('應該正確處理 deploy.defaultTags 配置', async () => {
      const manager = new ConfigurationManager();
      const configWithTags = {
        deploy: {
          defaultTags: ['tag1', 'tag2', 'tag3']
        }
      };
      
      await manager.loadConfiguration(configWithTags);
      const tags = manager.get('deploy.defaultTags');
      
      expect(tags).toEqual(['tag1', 'tag2', 'tag3']);
      expect(Array.isArray(tags)).toBe(true);
    });

    it('應該正確處理 deploy.defaultCategory 配置', async () => {
      const manager = new ConfigurationManager();
      const configWithCategory = {
        deploy: {
          defaultCategory: 'instructions'
        }
      };
      
      await manager.loadConfiguration(configWithCategory);
      const category = manager.get('deploy.defaultCategory');
      
      expect(category).toBe('instructions');
    });

    it('應該正確處理 deploy.filters 巢狀配置', async () => {
      const manager = new ConfigurationManager();
      const configWithFilters = {
        deploy: {
          filters: {
            enableAdvanced: true,
            customRules: ['rule1', 'rule2']
          }
        }
      };
      
      await manager.loadConfiguration(configWithFilters);
      
      expect(manager.get('deploy.filters.enableAdvanced')).toBe(true);
      expect(manager.get('deploy.filters.customRules')).toEqual(['rule1', 'rule2']);
    });

    it('應該正確合併不同來源的部署配置', async () => {
      const manager = new ConfigurationManager();
      
      const globalConfig = {
        deploy: {
          defaultTags: ['global-tag'],
          defaultCategory: 'global-category'
        }
      };
      
      const projectConfig = {
        deploy: {
          defaultTags: ['project-tag'],
          defaultUtility: 'github-copilot'
        }
      };
      
      const cliOptions = {
        deploy: {
          defaultCategory: 'cli-category'
        }
      };
      
      // 模擬配置載入過程
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValueOnce(globalConfig)
                  .mockResolvedValueOnce(projectConfig);
      
      await manager.loadConfiguration(cliOptions);
      
      // 驗證配置階層：CLI > project > global
      expect(manager.get('deploy.defaultTags')).toEqual(['project-tag']); // project 覆蓋 global
      expect(manager.get('deploy.defaultCategory')).toBe('cli-category'); // CLI 覆蓋所有
      expect(manager.get('deploy.defaultUtility')).toBe('github-copilot'); // 只在 project 中
    });

    it('應該為不存在的部署配置返回預設值', async () => {
      const manager = new ConfigurationManager();
      await manager.loadConfiguration({});
      
      expect(manager.get('deploy.defaultTags', [])).toEqual([]);
      expect(manager.get('deploy.defaultCategory', 'default')).toBe('default');
      expect(manager.get('deploy.filters.nonExistent', false)).toBe(false);
    });

    it('應該正確設定和刪除部署配置', async () => {
      const manager = new ConfigurationManager();
      await manager.loadConfiguration({});
      
      // 設定配置
      manager.set('deploy.defaultTags', ['new-tag']);
      manager.set('deploy.filters.advanced', true);
      
      expect(manager.get('deploy.defaultTags')).toEqual(['new-tag']);
      expect(manager.get('deploy.filters.advanced')).toBe(true);
      
      // 測試刪除功能
      const config = manager.getAll();
      manager._deleteNestedKey(config, 'deploy.filters.advanced');
      
      expect(manager._getNestedValue(config, 'deploy.filters.advanced')).toBeUndefined();
    });
  });

});

