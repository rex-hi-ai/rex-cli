const fs = require('fs-extra');
const path = require('path');

/**
 * SmartDetectionManager - 智慧偵測相關公用程式
 * 
 * 主要功能：
 * 1. 掃描專案檔案以偵測可能需要的公用程式
 * 2. 根據專案結構自動建議適合的工具
 * 3. 快取偵測結果以提高效能
 */
class SmartDetectionManager {
  constructor() {
    this.detectionRules = {
      'github-copilot': [
        '.github/copilot/prompts',
        '.github/copilot/instructions'
      ],
      'vscode': [
        '.vscode/settings.json',
        '.vscode/extensions.json',
        '.vscode'
      ],
      'cursor': [
        '.cursor/settings.json',
        '.cursor',
        '.cursorrules'
      ]
    };
  }

  /**
   * 掃描當前專案目錄以偵測相關的公用程式
   * @param {string} projectDir - 專案目錄路徑
   * @returns {Object} 偵測結果
   */
  async detectUtilities(projectDir = process.cwd()) {
    const detectedUtilities = [];
    const detectionDetails = {};

    for (const [utilityName, patterns] of Object.entries(this.detectionRules)) {
      const detected = await this._checkUtilityPatterns(projectDir, patterns);
      
      if (detected.found) {
        detectedUtilities.push(utilityName);
        detectionDetails[utilityName] = detected;
      }
    }

    return {
      projectDir,
      detectedUtilities,
      detectionDetails,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 檢查特定公用程式的模式是否存在
   * @param {string} projectDir - 專案目錄
   * @param {string[]} patterns - 要檢查的檔案/目錄模式
   * @returns {Object} 檢查結果
   */
  async _checkUtilityPatterns(projectDir, patterns) {
    const foundPaths = [];
    const missingPaths = [];

    for (const pattern of patterns) {
      const fullPath = path.join(projectDir, pattern);
      
      if (await fs.pathExists(fullPath)) {
        const stats = await fs.stat(fullPath);
        foundPaths.push({
          path: pattern,
          fullPath,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.isFile() ? stats.size : null
        });
      } else {
        missingPaths.push(pattern);
      }
    }

    return {
      found: foundPaths.length > 0,
      foundPaths,
      missingPaths,
      confidence: foundPaths.length / patterns.length
    };
  }

  /**
   * 根據偵測結果建議最適合的公用程式
   * @param {Object} detectionResult - 偵測結果
   * @returns {string[]} 建議的公用程式列表（依信心度排序）
   */
  suggestUtilities(detectionResult) {
    const suggestions = [];

    for (const utilityName of detectionResult.detectedUtilities) {
      const details = detectionResult.detectionDetails[utilityName];
      suggestions.push({
        utility: utilityName,
        confidence: details.confidence,
        reason: `發現 ${details.foundPaths.length} 個相關檔案/目錄`
      });
    }

    // 依信心度排序
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions;
  }

  /**
   * 格式化偵測結果為使用者友善的輸出
   * @param {Object} detectionResult - 偵測結果
   * @returns {string} 格式化的輸出
   */
  formatDetectionResult(detectionResult) {
    const lines = [];
    
    lines.push(`🔍 專案智慧偵測結果 (${detectionResult.projectDir})`);
    lines.push('');

    if (detectionResult.detectedUtilities.length === 0) {
      lines.push('❌ 未偵測到任何已知的工具配置');
      lines.push('');
      lines.push('💡 提示：您可以手動指定 --utility 參數來使用特定工具');
      return lines.join('\n');
    }

    const suggestions = this.suggestUtilities(detectionResult);

    lines.push(`✅ 偵測到 ${detectionResult.detectedUtilities.length} 個潛在的工具：`);
    lines.push('');

    for (const suggestion of suggestions) {
      const confidence = Math.round(suggestion.confidence * 100);
      lines.push(`  📊 ${suggestion.utility} (信心度: ${confidence}%)`);
      lines.push(`     ${suggestion.reason}`);
      
      const details = detectionResult.detectionDetails[suggestion.utility];
      for (const found of details.foundPaths) {
        lines.push(`     ✓ ${found.path} (${found.type})`);
      }
      lines.push('');
    }

    const topSuggestion = suggestions[0];
    if (topSuggestion) {
      lines.push(`💡 建議使用: ${topSuggestion.utility} (最高信心度: ${Math.round(topSuggestion.confidence * 100)}%)`);
    }

    return lines.join('\n');
  }

  /**
   * 檢查偵測結果是否仍然有效（基於時間戳記和檔案變更）
   * @param {Object} cachedResult - 快取的偵測結果
   * @param {number} maxAgeMinutes - 快取有效期限（分鐘）
   * @returns {boolean} 快取是否有效
   */
  isCacheValid(cachedResult, maxAgeMinutes = 30) {
    if (!cachedResult || !cachedResult.timestamp) {
      return false;
    }

    const cacheTime = new Date(cachedResult.timestamp);
    const now = new Date();
    const ageMinutes = (now - cacheTime) / (1000 * 60);

    return ageMinutes < maxAgeMinutes;
  }

  /**
   * 快速偵測（使用快取）
   * @param {string} projectDir - 專案目錄
   * @param {Object} detectionCache - 偵測快取
   * @returns {Object} 偵測結果
   */
  async detectWithCache(projectDir = process.cwd(), detectionCache = {}) {
    const cacheKey = path.resolve(projectDir);
    const cachedResult = detectionCache[cacheKey];

    // 檢查快取是否有效
    if (this.isCacheValid(cachedResult)) {
      console.log('🚀 使用快取的偵測結果');
      return cachedResult;
    }

    // 執行新的偵測
    console.log('🔍 執行專案偵測...');
    const result = await this.detectUtilities(projectDir);

    // 更新快取
    detectionCache[cacheKey] = result;

    return result;
  }

  /**
   * 新增自訂偵測規則
   * @param {string} utilityName - 公用程式名稱
   * @param {string[]} patterns - 檔案/目錄模式陣列
   */
  addDetectionRule(utilityName, patterns) {
    this.detectionRules[utilityName] = patterns;
  }

  /**
   * 取得所有支援的公用程式列表
   * @returns {string[]} 公用程式名稱陣列
   */
  getSupportedUtilities() {
    return Object.keys(this.detectionRules);
  }
}

module.exports = SmartDetectionManager;
