const SmartDetectionManager = require('../SmartDetectionManager');
const fs = require('fs-extra');
const path = require('path');

// Mock fs-extra
jest.mock('fs-extra');

describe('SmartDetectionManager', () => {
  let detectionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    detectionManager = new SmartDetectionManager();
  });

  describe('detectUtilities', () => {
    it('應該根據專案結構偵測工具', async () => {
      // Mock different file existance scenarios
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes('.github/copilot')) return Promise.resolve(true);
        if (filePath.includes('.vscode')) return Promise.resolve(true);
        if (filePath.includes('.cursor')) return Promise.resolve(false);
        return Promise.resolve(false);
      });

      fs.stat.mockResolvedValue({ isDirectory: () => true, isFile: () => false });

      const result = await detectionManager.detectUtilities('/mock/project');

      expect(result.detectedUtilities).toContain('github-copilot');
      expect(result.detectedUtilities).toContain('vscode');
      expect(result.detectedUtilities).not.toContain('cursor');
      expect(result.projectDir).toBe('/mock/project');
      expect(result.timestamp).toBeDefined();
    });

    it('應該在沒有偵測到工具時返回空陣列', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await detectionManager.detectUtilities('/mock/empty-project');

      expect(result.detectedUtilities).toHaveLength(0);
    });
  });

  describe('suggestUtilities', () => {
    it('應該依照信心度排序建議工具', () => {
      const detectionResult = {
        detectedUtilities: ['vscode', 'github-copilot'],
        detectionDetails: {
          'vscode': { confidence: 0.9, foundPaths: [{ path: '.vscode' }] },
          'github-copilot': { confidence: 0.7, foundPaths: [{ path: '.github/copilot' }] }
        }
      };

      const suggestions = detectionManager.suggestUtilities(detectionResult);

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].utility).toBe('vscode');
      expect(suggestions[0].confidence).toBe(0.9);
      expect(suggestions[1].utility).toBe('github-copilot');
      expect(suggestions[1].confidence).toBe(0.7);
    });
  });

  describe('formatDetectionResult', () => {
    it('應該正確格式化偵測結果', () => {
      const detectionResult = {
        projectDir: '/mock/project',
        detectedUtilities: ['github-copilot'],
        detectionDetails: {
          'github-copilot': {
            found: true,
            foundPaths: [
              { path: '.github/copilot/prompts', type: 'directory' }
            ],
            missingPaths: [],
            confidence: 0.5
          }
        }
      };

      const output = detectionManager.formatDetectionResult(detectionResult);

      expect(output).toContain('✅ 偵測到 1 個潛在的工具');
      expect(output).toContain('github-copilot');
      expect(output).toContain('prompts (directory)');
      expect(output).toContain('50%');
    });

    it('應該處理沒有偵測到工具的情況', () => {
      const detectionResult = {
        projectDir: '/mock/empty-project',
        detectedUtilities: [],
        detectionDetails: {}
      };

      const output = detectionManager.formatDetectionResult(detectionResult);

      expect(output).toContain('❌ 未偵測到任何已知的工具配置');
      expect(output).toContain('💡 提示：您可以手動指定 --utility 參數');
    });
  });

  describe('isCacheValid', () => {
    it('應該根據時間戳記驗證快取有效性', () => {
      const recentResult = {
        timestamp: new Date().toISOString()
      };

      const oldResult = {
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago
      };

      expect(detectionManager.isCacheValid(recentResult, 30)).toBe(true);
      expect(detectionManager.isCacheValid(oldResult, 30)).toBe(false);
    });

    it('應該在沒有時間戳記時返回 false', () => {
      const invalidResult = {};
      expect(detectionManager.isCacheValid(invalidResult)).toBe(false);
    });
  });

  describe('addDetectionRule', () => {
    it('應該允許添加自訂偵測規則', () => {
      detectionManager.addDetectionRule('custom-tool', ['.custom', '.custom-config']);
      
      const supportedUtilities = detectionManager.getSupportedUtilities();
      expect(supportedUtilities).toContain('custom-tool');
    });
  });

  describe('getSupportedUtilities', () => {
    it('應該返回所有支援的工具列表', () => {
      const utilities = detectionManager.getSupportedUtilities();
      
      expect(utilities).toContain('github-copilot');
      expect(utilities).toContain('vscode');
      expect(utilities).toContain('cursor');
    });
  });

  describe('detectWithCache', () => {
    it('應該使用有效的快取結果', async () => {
      const cachedResult = {
        projectDir: '/mock/project',
        detectedUtilities: ['github-copilot'],
        timestamp: new Date().toISOString()
      };
      
      const detectionCache = {
        '/mock/project': cachedResult
      };
      
      const result = await detectionManager.detectWithCache('/mock/project', detectionCache);
      
      expect(result).toBe(cachedResult);
    });

    it('應該在快取過期時執行新的偵測', async () => {
      fs.pathExists.mockResolvedValue(false);
      
      const expiredResult = {
        projectDir: '/mock/project',
        detectedUtilities: ['github-copilot'],
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago
      };
      
      const detectionCache = {
        '/mock/project': expiredResult
      };
      
      const result = await detectionManager.detectWithCache('/mock/project', detectionCache);
      
      expect(result).not.toBe(expiredResult);
      expect(result.projectDir).toBe('/mock/project');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('應該處理檔案系統錯誤', async () => {
      fs.pathExists.mockRejectedValue(new Error('Permission denied'));
      
      await expect(detectionManager.detectUtilities('/restricted/path'))
        .rejects.toThrow('Permission denied');
    });

    it('應該處理無效的專案目錄', async () => {
      fs.pathExists.mockResolvedValue(false);
      
      const result = await detectionManager.detectUtilities('/nonexistent/path');
      
      expect(result.detectedUtilities).toHaveLength(0);
      expect(result.projectDir).toBe('/nonexistent/path');
    });
  });
});
