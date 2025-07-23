const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const FileSystemManager = require('./FileSystemManager');
const { ValidationError, FileSystemError } = require('./errors');

/**
 * ConfigurationManager - 多層級配置系統
 * 
 * 配置優先順序：
 * 1. CLI flags (最高優先級)
 * 2. 專案配置 (./.rex/config.json) 
 * 3. 全域配置 (~/.rex/config.json) (最低優先級)
 * 
 * 此管理器被其他命令（如 deploy）使用來決定行為
 */
class ConfigurationManager {
  constructor() {
    this._globalConfig = null;
    this._projectConfig = null;
    this._mergedConfig = null;
  }

  /**
   * 載入並合併所有配置來源
   * @param {Object} cliOptions - 命令列選項覆寫
   * @returns {Object} 合併後的配置
   */
  async loadConfiguration(cliOptions = {}) {
    try {
      // 載入全域配置
      this._globalConfig = await this._loadGlobalConfig();
      
      // 載入專案配置
      this._projectConfig = await this._loadProjectConfig();
      
      // 合併配置（優先順序：CLI > 專案 > 全域）
      this._mergedConfig = this._mergeConfigurations(
        this._globalConfig,
        this._projectConfig,
        cliOptions
      );

      return this._mergedConfig;
    } catch (error) {
      throw new FileSystemError(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * 載入全域配置 (~/.rex/config.json)
   * @returns {Object} 全域配置或空物件
   */
  async _loadGlobalConfig() {
    try {
      const globalRexDir = FileSystemManager.getGlobalRexDir();
      const globalConfigPath = path.join(globalRexDir, 'config.json');

      if (await fs.pathExists(globalConfigPath)) {
        const config = await fs.readJson(globalConfigPath);
        return config || {};
      }

      return {};
    } catch (error) {
      console.warn(`Warning: Could not load global config: ${error.message}`);
      return {};
    }
  }

  /**
   * 載入專案配置 (./.rex/config.json)
   * @returns {Object} 專案配置或空物件
   */
  async _loadProjectConfig() {
    try {
      const projectRexDir = FileSystemManager.getProjectRexDir();
      const projectConfigPath = path.join(projectRexDir, 'config.json');

      if (await fs.pathExists(projectConfigPath)) {
        const config = await fs.readJson(projectConfigPath);
        return config || {};
      }

      return {};
    } catch (error) {
      console.warn(`Warning: Could not load project config: ${error.message}`);
      return {};
    }
  }

  /**
   * 合併配置物件，遵循優先順序
   * @param {Object} globalConfig - 全域配置
   * @param {Object} projectConfig - 專案配置  
   * @param {Object} cliOptions - CLI 選項
   * @returns {Object} 合併後的配置
   */
  _mergeConfigurations(globalConfig, projectConfig, cliOptions) {
    // 深度合併配置，CLI 選項優先級最高
    const merged = this._deepMerge(
      this._deepMerge(globalConfig, projectConfig),
      this._sanitizeCliOptions(cliOptions)
    );

    return merged;
  }

  /**
   * 深度合併物件
   * @param {Object} target - 目標物件
   * @param {Object} source - 來源物件
   * @returns {Object} 合併結果
   */
  _deepMerge(target, source) {
    if (!target) target = {};
    if (!source) source = {};

    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (this._isObject(source[key]) && this._isObject(target[key])) {
          result[key] = this._deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * 檢查是否為物件（不是 null 或陣列）
   * @param {*} obj - 要檢查的值
   * @returns {boolean} 是否為物件
   */
  _isObject(obj) {
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
  }

  /**
   * 淨化 CLI 選項，移除 undefined 值
   * @param {Object} cliOptions - CLI 選項
   * @returns {Object} 淨化後的選項
   */
  _sanitizeCliOptions(cliOptions) {
    const sanitized = {};
    
    for (const key in cliOptions) {
      if (cliOptions.hasOwnProperty(key) && cliOptions[key] !== undefined) {
        sanitized[key] = cliOptions[key];
      }
    }

    return sanitized;
  }

  /**
   * 取得配置值
   * @param {string} key - 配置鍵名（支援點記法，如 'deploy.defaultUtility'）
   * @param {*} defaultValue - 預設值
   * @returns {*} 配置值
   */
  get(key, defaultValue = undefined) {
    if (!this._mergedConfig) {
      throw new ValidationError('Configuration not loaded. Call loadConfiguration() first.');
    }

    return this._getNestedValue(this._mergedConfig, key, defaultValue);
  }

  /**
   * 取得巢狀物件的值
   * @param {Object} obj - 物件
   * @param {string} keyPath - 點記法鍵名路徑
   * @param {*} defaultValue - 預設值
   * @returns {*} 值
   */
  _getNestedValue(obj, keyPath, defaultValue) {
    const keys = keyPath.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }

    return current;
  }

  /**
   * 設定配置值（僅在記憶體中，不持久化）
   * @param {string} key - 配置鍵名
   * @param {*} value - 值
   */
  set(key, value) {
    if (!this._mergedConfig) {
      this._mergedConfig = {};
    }

    this._setNestedValue(this._mergedConfig, key, value);
  }

  /**
   * 設定巢狀物件的值
   * @param {Object} obj - 物件
   * @param {string} keyPath - 點記法鍵名路徑
   * @param {*} value - 值
   */
  _setNestedValue(obj, keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    let current = obj;

    for (const key of keys) {
      if (!(key in current) || !this._isObject(current[key])) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
  }

  /**
   * 刪除巢狀物件的鍵
   * @param {Object} obj - 物件
   * @param {string} keyPath - 點記法鍵名路徑
   */
  _deleteNestedKey(obj, keyPath) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    let current = obj;

    // 導航到包含要刪除鍵的物件
    for (const key of keys) {
      if (!current || !this._isObject(current) || !(key in current)) {
        return; // 鍵不存在，無需刪除
      }
      current = current[key];
    }

    // 刪除最終的鍵
    if (current && this._isObject(current) && lastKey in current) {
      delete current[lastKey];
      
      // 清理空的巢狀物件（向上回溯）
      this._cleanupEmptyObjects(obj, keyPath);
    }
  }

  /**
   * 清理空的巢狀物件
   * @param {Object} obj - 根物件
   * @param {string} keyPath - 原始鍵路徑
   */
  _cleanupEmptyObjects(obj, keyPath) {
    const keys = keyPath.split('.');
    
    // 從最深層開始，逐層檢查是否為空物件
    for (let i = keys.length - 1; i > 0; i--) {
      const parentPath = keys.slice(0, i).join('.');
      const childKey = keys[i - 1];
      
      let current = obj;
      const pathKeys = parentPath ? parentPath.split('.') : [];
      
      // 導航到父物件
      for (const key of pathKeys) {
        if (!current || !this._isObject(current) || !(key in current)) {
          return;
        }
        current = current[key];
      }
      
      // 檢查子物件是否為空
      const childObj = current[childKey];
      if (this._isObject(childObj) && Object.keys(childObj).length === 0) {
        delete current[childKey];
      } else {
        break; // 如果不是空物件，停止清理
      }
    }
  }

  /**
   * 取得所有配置
   * @returns {Object} 完整配置物件
   */
  getAll() {
    if (!this._mergedConfig) {
      throw new ValidationError('Configuration not loaded. Call loadConfiguration() first.');
    }

    return { ...this._mergedConfig };
  }

  /**
   * 檢查配置是否已載入
   * @returns {boolean} 是否已載入
   */
  isLoaded() {
    return this._mergedConfig !== null;
  }

  /**
   * 重設配置管理器
   */
  reset() {
    this._globalConfig = null;
    this._projectConfig = null;
    this._mergedConfig = null;
  }

  /**
   * 取得配置來源資訊（用於除錯）
   * @returns {Object} 配置來源資訊
   */
  getConfigSources() {
    return {
      global: this._globalConfig,
      project: this._projectConfig,
      merged: this._mergedConfig
    };
  }

  /**
   * 驗證必要的配置項目
   * @param {string[]} requiredKeys - 必要的配置鍵名陣列
   * @throws {ValidationError} 如果缺少必要配置
   */
  validateRequiredConfig(requiredKeys) {
    if (!this._mergedConfig) {
      throw new ValidationError('Configuration not loaded. Call loadConfiguration() first.');
    }

    const missing = [];
    
    for (const key of requiredKeys) {
      if (this.get(key) === undefined) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new ValidationError(`Missing required configuration: ${missing.join(', ')}`);
    }
  }

  /**
   * 儲存專案配置到 ./.rex/config.json
   * @param {Object} config - 要儲存的配置
   */
  async saveProjectConfig(config) {
    const projectRexDir = FileSystemManager.getProjectRexDir();
    const projectConfigPath = path.join(projectRexDir, 'config.json');
    
    try {
      await fs.ensureDir(projectRexDir);
      await fs.writeJson(projectConfigPath, config, { spaces: 2 });
      
      // 重新載入配置以反映變更
      if (this._mergedConfig) {
        this._projectConfig = config;
        this._mergedConfig = this._mergeConfigurations(
          this._globalConfig,
          this._projectConfig,
          {} // 不包含 CLI 選項
        );
      }
    } catch (error) {
      throw new FileSystemError('save project config', projectConfigPath, error);
    }
  }

  /**
   * 儲存全域配置到 ~/.rex/config.json
   * @param {Object} config - 要儲存的配置
   */
  async saveGlobalConfig(config) {
    const globalRexDir = FileSystemManager.getGlobalRexDir();
    const globalConfigPath = path.join(globalRexDir, 'config.json');
    
    try {
      await fs.ensureDir(globalRexDir);
      await fs.writeJson(globalConfigPath, config, { spaces: 2 });
      
      // 重新載入配置以反映變更
      if (this._mergedConfig) {
        this._globalConfig = config;
        this._mergedConfig = this._mergeConfigurations(
          this._globalConfig,
          this._projectConfig,
          {} // 不包含 CLI 選項
        );
      }
    } catch (error) {
      throw new FileSystemError('save global config', globalConfigPath, error);
    }
  }

  /**
   * 設定工具配置並儲存到專案配置檔案
   * @param {string} utilityName - 工具名稱
   * @param {string} key - 配置鍵名
   * @param {*} value - 配置值（undefined 表示刪除）
   */
  async setUtilityConfig(utilityName, key, value) {
    try {
      // 確保已載入配置
      if (!this._mergedConfig) {
        await this.loadConfiguration({});
      }

      // 取得當前配置
      const currentConfig = { ...this._projectConfig };
      
      // 確保 utilities 節點存在
      if (!currentConfig.utilities) {
        currentConfig.utilities = {};
      }
      
      // 確保特定工具的配置節點存在
      if (!currentConfig.utilities[utilityName]) {
        currentConfig.utilities[utilityName] = {};
      }
      
      // 設定或刪除配置值
      if (value === undefined) {
        delete currentConfig.utilities[utilityName][key];
        
        // 如果工具配置為空，則刪除整個工具節點
        if (Object.keys(currentConfig.utilities[utilityName]).length === 0) {
          delete currentConfig.utilities[utilityName];
        }
        
        // 如果 utilities 為空，則刪除整個 utilities 節點
        if (Object.keys(currentConfig.utilities).length === 0) {
          delete currentConfig.utilities;
        }
      } else {
        currentConfig.utilities[utilityName][key] = value;
      }
      
      // 儲存更新的配置
      await this.saveProjectConfig(currentConfig);
      
    } catch (error) {
      throw new FileSystemError('set utility config', 'project config file', error);
    }
  }
}

module.exports = ConfigurationManager;
