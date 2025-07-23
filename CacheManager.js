const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

/**
 * CacheManager - 管理檔案雜湊快取和偵測結果快取
 * 
 * 主要功能：
 * 1. 管理檔案雜湊快取 (hashes.json) - 用於增量編譯
 * 2. 管理偵測結果快取 (detection.json) - 用於智慧偵測
 * 3. 計算檔案雜湊以檢查變更
 */
class CacheManager {
  constructor() {
    this.cacheDir = path.join(process.cwd(), '.rex', 'cache');
    this.hashCachePath = path.join(this.cacheDir, 'hashes.json');
    this.detectionCachePath = path.join(this.cacheDir, 'detection.json');
  }

  /**
   * 載入所有快取
   * @returns {Object} 包含 hashCache 和 detectionCache 的物件
   */
  async loadCache() {
    try {
      const hashCache = await fs.readJson(this.hashCachePath, { throws: false }) || {};
      const detectionCache = await fs.readJson(this.detectionCachePath, { throws: false }) || {};

      return { hashCache, detectionCache };
    } catch (error) {
      console.warn(`警告：無法載入快取: ${error.message}`);
      return { hashCache: {}, detectionCache: {} };
    }
  }

  /**
   * 儲存快取到檔案系統
   * @param {Object} hashCache - 檔案雜湊快取
   * @param {Object} detectionCache - 偵測結果快取
   */
  async saveCache(hashCache, detectionCache) {
    try {
      await fs.ensureDir(this.cacheDir);

      await fs.writeJson(this.hashCachePath, hashCache, { spaces: 2 });
      await fs.writeJson(this.detectionCachePath, detectionCache, { spaces: 2 });

      console.log('✅ 快取儲存成功');
    } catch (error) {
      console.error(`儲存快取失敗: ${error.message}`);
    }
  }

  /**
   * 計算檔案的 SHA256 雜湊值
   * @param {string} filePath - 檔案路徑
   * @returns {string} 檔案雜湊值
   */
  async calculateFileHash(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      console.warn(`計算檔案雜湊失敗 ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * 檢查檔案是否有變更（與快取中的雜湊比較）
   * @param {string} filePath - 檔案路徑
   * @param {Object} hashCache - 雜湊快取
   * @returns {boolean} 檔案是否有變更
   */
  async hasFileChanged(filePath, hashCache) {
    const currentHash = await this.calculateFileHash(filePath);
    if (!currentHash) return true; // 如果無法計算雜湊，假設檔案有變更

    const cachedHash = hashCache[filePath];
    return !cachedHash || cachedHash !== currentHash;
  }

  /**
   * 更新檔案的雜湊快取
   * @param {string} filePath - 檔案路徑
   * @param {Object} hashCache - 雜湊快取物件（會被修改）
   */
  async updateFileHash(filePath, hashCache) {
    const hash = await this.calculateFileHash(filePath);
    if (hash) {
      hashCache[filePath] = hash;
    }
  }

  /**
   * 取得需要重新編譯的檔案列表
   * @param {string[]} filePaths - 要檢查的檔案路徑陣列
   * @returns {Object} 包含 changed 和 unchanged 檔案列表
   */
  async getChangedFiles(filePaths) {
    const { hashCache } = await this.loadCache();
    
    const changed = [];
    const unchanged = [];

    for (const filePath of filePaths) {
      if (await this.hasFileChanged(filePath, hashCache)) {
        changed.push(filePath);
      } else {
        unchanged.push(filePath);
      }
    }

    return { changed, unchanged };
  }

  /**
   * 清除所有快取
   */
  async clearCache() {
    try {
      if (await fs.pathExists(this.cacheDir)) {
        await fs.remove(this.cacheDir);
        console.log('✅ 快取已清除');
      }
    } catch (error) {
      console.error(`清除快取失敗: ${error.message}`);
    }
  }

  /**
   * 取得快取統計資訊
   * @returns {Object} 快取統計資訊
   */
  async getCacheStats() {
    try {
      const { hashCache, detectionCache } = await this.loadCache();
      
      return {
        hashCacheSize: Object.keys(hashCache).length,
        detectionCacheSize: Object.keys(detectionCache).length,
        cacheDir: this.cacheDir,
        exists: await fs.pathExists(this.cacheDir)
      };
    } catch (error) {
      return {
        hashCacheSize: 0,
        detectionCacheSize: 0,
        cacheDir: this.cacheDir,
        exists: false,
        error: error.message
      };
    }
  }
}

module.exports = CacheManager;

