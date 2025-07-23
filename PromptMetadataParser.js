const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const FileSystemManager = require('./FileSystemManager');

/**
 * PromptMetadataParser - 解析 prompt 檔案的 YAML frontmatter
 * 
 * 負責從原始 prompt 檔案 (~/.rex/prompts/*.md) 中提取 metadata
 * 支援 tags 和 category 的解析，並提供快取機制
 */
class PromptMetadataParser {
  constructor() {
    // 記憶體快取，key 為檔案路徑，value 為解析結果
    this.cache = new Map();
    // 檔案修改時間快取，用於快取失效檢查
    this.mtimeCache = new Map();
  }

  /**
   * 解析單個 prompt 檔案的 metadata
   * @param {string} promptName - prompt 檔案名稱 (例: "code-review.md")
   * @returns {Object} 解析後的 metadata { tags: string[], category: string }
   */
  async parseMetadata(promptName) {
    const promptPath = this._getPromptPath(promptName);
    
    // 檢查快取是否有效
    if (await this._isCacheValid(promptPath)) {
      return this.cache.get(promptPath);
    }

    try {
      // 讀取檔案內容
      const content = await fs.readFile(promptPath, 'utf8');
      
      // 解析 frontmatter
      const metadata = this._parseFrontmatter(content);
      
      // 標準化並快取結果
      const result = this._normalizeMetadata(metadata);
      await this._cacheResult(promptPath, result);
      
      return result;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Prompt 檔案不存在: ${promptPath}`);
      }
      throw new Error(`解析 metadata 失敗 (${promptName}): ${error.message}`);
    }
  }

  /**
   * 批次解析多個 prompt 檔案的 metadata
   * @param {string[]} promptNames - prompt 檔案名稱陣列
   * @returns {Object} key 為 promptName，value 為 metadata
   */
  async parseMultiple(promptNames) {
    const results = {};
    
    // 使用 Promise.all 並行處理以提升效能
    const parsePromises = promptNames.map(async (promptName) => {
      try {
        const metadata = await this.parseMetadata(promptName);
        return { promptName, metadata, success: true };
      } catch (error) {
        return { promptName, error: error.message, success: false };
      }
    });

    const resolvedResults = await Promise.all(parsePromises);
    
    resolvedResults.forEach(({ promptName, metadata, error, success }) => {
      if (success) {
        results[promptName] = metadata;
      } else {
        // 對於失敗的檔案，記錄錯誤但不中斷整個過程
        console.warn(`警告：無法解析 ${promptName} 的 metadata: ${error}`);
        results[promptName] = { tags: [], category: '', error };
      }
    });

    return results;
  }

  /**
   * 清除指定檔案的快取
   * @param {string} promptName - prompt 檔案名稱
   */
  clearCache(promptName = null) {
    if (promptName) {
      const promptPath = this._getPromptPath(promptName);
      this.cache.delete(promptPath);
      this.mtimeCache.delete(promptPath);
    } else {
      // 清除所有快取
      this.cache.clear();
      this.mtimeCache.clear();
    }
  }

  /**
   * 取得快取統計資訊
   * @returns {Object} 快取統計
   */
  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      mtimeCacheSize: this.mtimeCache.size,
      cachedFiles: Array.from(this.cache.keys()).map(path => path.split('/').pop())
    };
  }

  /**
   * 根據 tags 和 category 過濾 prompt 檔案
   * @param {string[]} promptNames - 要過濾的 prompt 檔案名稱
   * @param {Object} filters - 過濾條件
   * @param {string[]} filters.tags - 必須包含的 tags
   * @param {string[]} filters.excludeTags - 要排除的 tags  
   * @param {string} filters.category - 必須符合的 category
   * @returns {string[]} 過濾後的 prompt 檔案名稱
   */
  async filterPrompts(promptNames, filters = {}) {
    const { tags = [], excludeTags = [], category } = filters;
    
    if (!tags.length && !excludeTags.length && !category) {
      return promptNames; // 沒有過濾條件，回傳全部
    }

    const metadataMap = await this.parseMultiple(promptNames);
    
    return promptNames.filter(promptName => {
      const metadata = metadataMap[promptName];
      
      // 如果解析失敗，則排除
      if (metadata.error) {
        return false;
      }

      const promptTags = metadata.tags || [];
      const promptCategory = metadata.category || '';

      // 檢查必須包含的 tags
      if (tags.length > 0) {
        const hasRequiredTags = tags.some(tag => promptTags.includes(tag));
        if (!hasRequiredTags) return false;
      }

      // 檢查要排除的 tags
      if (excludeTags.length > 0) {
        const hasExcludedTags = excludeTags.some(tag => promptTags.includes(tag));
        if (hasExcludedTags) return false;
      }

      // 檢查 category
      if (category && promptCategory !== category) {
        return false;
      }

      return true;
    });
  }

  /**
   * 取得 prompt 檔案的完整路徑
   * @private
   */
  _getPromptPath(promptName) {
    return path.join(
      FileSystemManager.getGlobalRexDir(),
      'prompts',
      promptName
    );
  }

  /**
   * 檢查快取是否有效（基於檔案修改時間）
   * @private
   */
  async _isCacheValid(promptPath) {
    if (!this.cache.has(promptPath)) {
      return false;
    }

    try {
      const stats = await fs.stat(promptPath);
      const cachedMtime = this.mtimeCache.get(promptPath);
      
      return cachedMtime && stats.mtime.getTime() === cachedMtime;
    } catch (error) {
      // 檔案不存在或其他錯誤，快取無效
      return false;
    }
  }

  /**
   * 快取解析結果
   * @private
   */
  async _cacheResult(promptPath, result) {
    try {
      const stats = await fs.stat(promptPath);
      this.cache.set(promptPath, result);
      this.mtimeCache.set(promptPath, stats.mtime.getTime());
    } catch (error) {
      // 無法取得檔案統計資訊，不快取
      console.warn(`警告：無法快取 ${promptPath}: ${error.message}`);
    }
  }

  /**
   * 解析檔案的 YAML frontmatter
   * @private
   */
  _parseFrontmatter(content) {
    // 尋找 YAML frontmatter (介於 --- 之間)
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(frontmatterRegex);
    
    if (!match) {
      return {}; // 沒有 frontmatter
    }

    try {
      return yaml.load(match[1]) || {};
    } catch (error) {
      throw new Error(`YAML 解析錯誤: ${error.message}`);
    }
  }

  /**
   * 標準化 metadata 格式
   * @private
   */
  _normalizeMetadata(rawMetadata) {
    let tags = [];
    let category = '';

    // 處理 tags
    if (rawMetadata.tags) {
      if (Array.isArray(rawMetadata.tags)) {
        tags = rawMetadata.tags
          .filter(tag => tag !== null && tag !== undefined && tag !== '')
          .map(tag => String(tag).trim())
          .filter(Boolean);
      } else if (typeof rawMetadata.tags === 'string') {
        // 處理逗號分隔的字串
        tags = rawMetadata.tags
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean);
      }
    }

    // 處理 category
    if (rawMetadata.category && typeof rawMetadata.category === 'string') {
      category = rawMetadata.category.trim();
    }

    return {
      tags,
      category,
      // 保留其他可能有用的 metadata
      type: rawMetadata.type || '',
      name: rawMetadata.name || '',
      description: rawMetadata.description || '',
      version: rawMetadata.version || '',
      author: rawMetadata.author || ''
    };
  }
}

module.exports = PromptMetadataParser;
