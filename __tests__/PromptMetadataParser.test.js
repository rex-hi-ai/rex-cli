const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const PromptMetadataParser = require('../src/PromptMetadataParser');
const FileSystemManager = require('../src/FileSystemManager');

// Mock FileSystemManager
jest.mock('../src/FileSystemManager');

describe('PromptMetadataParser', () => {
  let parser;
  let tempDir;
  let mockPromptsDir;

  beforeEach(async () => {
    // 建立暫存目錄
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rex-test-'));
    mockPromptsDir = path.join(tempDir, 'prompts');
    await fs.ensureDir(mockPromptsDir);

    // Mock FileSystemManager.getGlobalRexDir
    FileSystemManager.getGlobalRexDir.mockReturnValue(tempDir);

    // 建立 parser 實例
    parser = new PromptMetadataParser();
  });

  afterEach(async () => {
    // 清理暫存目錄
    await fs.remove(tempDir);
    jest.clearAllMocks();
  });

  describe('parseMetadata', () => {
    test('應該正確解析包含陣列 tags 的 frontmatter', async () => {
      const promptContent = `---
type: prompt
name: test-prompt
description: 測試用 prompt
tags: [javascript, typescript, testing]
category: development
version: 1.0.0
author: test-user
---

# Test Prompt
This is a test prompt.`;

      await fs.writeFile(path.join(mockPromptsDir, 'test.md'), promptContent);

      const result = await parser.parseMetadata('test.md');

      expect(result).toEqual({
        tags: ['javascript', 'typescript', 'testing'],
        category: 'development',
        type: 'prompt',
        name: 'test-prompt',
        description: '測試用 prompt',
        version: '1.0.0',
        author: 'test-user'
      });
    });

    test('應該正確解析逗號分隔的 tags 字串', async () => {
      const promptContent = `---
tags: "react, nextjs, frontend"
category: web-development
---

# React Prompt`;

      await fs.writeFile(path.join(mockPromptsDir, 'react.md'), promptContent);

      const result = await parser.parseMetadata('react.md');

      expect(result.tags).toEqual(['react', 'nextjs', 'frontend']);
      expect(result.category).toBe('web-development');
    });

    test('應該處理空的或缺失的 tags', async () => {
      const promptContent = `---
category: general
description: 沒有 tags 的 prompt
---

# No Tags Prompt`;

      await fs.writeFile(path.join(mockPromptsDir, 'notags.md'), promptContent);

      const result = await parser.parseMetadata('notags.md');

      expect(result.tags).toEqual([]);
      expect(result.category).toBe('general');
    });

    test('應該處理沒有 frontmatter 的檔案', async () => {
      const promptContent = `# Simple Prompt
This prompt has no frontmatter.`;

      await fs.writeFile(path.join(mockPromptsDir, 'simple.md'), promptContent);

      const result = await parser.parseMetadata('simple.md');

      expect(result).toEqual({
        tags: [],
        category: '',
        type: '',
        name: '',
        description: '',
        version: '',
        author: ''
      });
    });

    test('應該處理格式錯誤的 YAML', async () => {
      const promptContent = `---
invalid: yaml: content: [
---

# Invalid YAML`;

      await fs.writeFile(path.join(mockPromptsDir, 'invalid.md'), promptContent);

      await expect(parser.parseMetadata('invalid.md'))
        .rejects
        .toThrow('解析 metadata 失敗');
    });

    test('應該對不存在的檔案拋出錯誤', async () => {
      await expect(parser.parseMetadata('nonexistent.md'))
        .rejects
        .toThrow('Prompt 檔案不存在');
    });

    test('應該正確清理和標準化 tags', async () => {
      const promptContent = `---
tags: ["  javascript  ", "", "  typescript", null, "  "]
category: "  development  "
---

# Cleanup Test`;

      await fs.writeFile(path.join(mockPromptsDir, 'cleanup.md'), promptContent);

      const result = await parser.parseMetadata('cleanup.md');

      expect(result.tags).toEqual(['javascript', 'typescript']);
      expect(result.category).toBe('development');
    });
  });

  describe('caching', () => {
    test('應該快取解析結果', async () => {
      const promptContent = `---
tags: [cached, test]
category: cache-test
---

# Cached Prompt`;

      const filePath = path.join(mockPromptsDir, 'cached.md');
      await fs.writeFile(filePath, promptContent);

      // 第一次解析
      const result1 = await parser.parseMetadata('cached.md');
      
      // 第二次解析應該使用快取
      const result2 = await parser.parseMetadata('cached.md');

      expect(result1).toEqual(result2);
      expect(parser.getCacheStats().cacheSize).toBe(1);
    });

    test('應該在檔案修改後使快取失效', async () => {
      const originalContent = `---
tags: [original]
---

# Original`;

      const modifiedContent = `---
tags: [modified]
---

# Modified`;

      const filePath = path.join(mockPromptsDir, 'modified.md');
      
      // 寫入原始檔案並解析
      await fs.writeFile(filePath, originalContent);
      const result1 = await parser.parseMetadata('modified.md');
      expect(result1.tags).toEqual(['original']);

      // 等待一小段時間確保 mtime 不同
      await new Promise(resolve => setTimeout(resolve, 10));

      // 修改檔案
      await fs.writeFile(filePath, modifiedContent);
      const result2 = await parser.parseMetadata('modified.md');
      
      expect(result2.tags).toEqual(['modified']);
    });

    test('clearCache 應該清除指定檔案的快取', async () => {
      const promptContent = `---
tags: [test]
---

# Test`;

      await fs.writeFile(path.join(mockPromptsDir, 'clear-test.md'), promptContent);

      // 解析檔案建立快取
      await parser.parseMetadata('clear-test.md');
      expect(parser.getCacheStats().cacheSize).toBe(1);

      // 清除快取
      parser.clearCache('clear-test.md');
      expect(parser.getCacheStats().cacheSize).toBe(0);
    });

    test('clearCache() 應該清除所有快取', async () => {
      const promptContent = `---
tags: [test]
---

# Test`;

      await fs.writeFile(path.join(mockPromptsDir, 'test1.md'), promptContent);
      await fs.writeFile(path.join(mockPromptsDir, 'test2.md'), promptContent);

      // 解析兩個檔案
      await parser.parseMetadata('test1.md');
      await parser.parseMetadata('test2.md');
      expect(parser.getCacheStats().cacheSize).toBe(2);

      // 清除所有快取
      parser.clearCache();
      expect(parser.getCacheStats().cacheSize).toBe(0);
    });
  });

  describe('parseMultiple', () => {
    beforeEach(async () => {
      // 建立多個測試檔案
      const files = [
        {
          name: 'web.md',
          content: `---
tags: [html, css, javascript]
category: web
---
# Web Development`
        },
        {
          name: 'backend.md',
          content: `---
tags: [nodejs, express]
category: backend
---
# Backend Development`
        },
        {
          name: 'invalid.md',
          content: `---
invalid: yaml: [
---
# Invalid`
        }
      ];

      for (const file of files) {
        await fs.writeFile(
          path.join(mockPromptsDir, file.name),
          file.content
        );
      }
    });

    test('應該並行解析多個檔案', async () => {
      const results = await parser.parseMultiple(['web.md', 'backend.md']);

      expect(results['web.md']).toMatchObject({
        tags: ['html', 'css', 'javascript'],
        category: 'web'
      });

      expect(results['backend.md']).toMatchObject({
        tags: ['nodejs', 'express'],
        category: 'backend'
      });
    });

    test('應該處理部分檔案解析失敗的情況', async () => {
      const results = await parser.parseMultiple(['web.md', 'invalid.md', 'nonexistent.md']);

      expect(results['web.md']).toMatchObject({
        tags: ['html', 'css', 'javascript'],
        category: 'web'
      });

      expect(results['invalid.md']).toMatchObject({
        tags: [],
        category: '',
        error: expect.any(String)
      });

      expect(results['nonexistent.md']).toMatchObject({
        tags: [],
        category: '',
        error: expect.any(String)
      });
    });
  });

  describe('filterPrompts', () => {
    beforeEach(async () => {
      // 建立測試檔案
      const testFiles = [
        {
          name: 'react-app.md',
          content: `---
tags: [react, frontend, javascript]
category: web
---
# React App`
        },
        {
          name: 'node-api.md',
          content: `---
tags: [nodejs, backend, api]
category: backend
---
# Node API`
        },
        {
          name: 'typescript-util.md',
          content: `---
tags: [typescript, utility, frontend]
category: web
---
# TypeScript Utility`
        },
        {
          name: 'experimental.md',
          content: `---
tags: [experimental, draft]
category: research
---
# Experimental Feature`
        }
      ];

      for (const file of testFiles) {
        await fs.writeFile(
          path.join(mockPromptsDir, file.name),
          file.content
        );
      }
    });

    test('應該根據 tags 過濾', async () => {
      const promptNames = ['react-app.md', 'node-api.md', 'typescript-util.md'];
      
      const frontendPrompts = await parser.filterPrompts(promptNames, {
        tags: ['frontend']
      });

      expect(frontendPrompts).toEqual(['react-app.md', 'typescript-util.md']);
    });

    test('應該根據 category 過濾', async () => {
      const promptNames = ['react-app.md', 'node-api.md', 'typescript-util.md'];
      
      const webPrompts = await parser.filterPrompts(promptNames, {
        category: 'web'
      });

      expect(webPrompts).toEqual(['react-app.md', 'typescript-util.md']);
    });

    test('應該排除指定 tags', async () => {
      const promptNames = ['react-app.md', 'node-api.md', 'experimental.md'];
      
      const nonExperimentalPrompts = await parser.filterPrompts(promptNames, {
        excludeTags: ['experimental', 'draft']
      });

      expect(nonExperimentalPrompts).toEqual(['react-app.md', 'node-api.md']);
    });

    test('應該組合多種過濾條件', async () => {
      const promptNames = ['react-app.md', 'node-api.md', 'typescript-util.md', 'experimental.md'];
      
      const filtered = await parser.filterPrompts(promptNames, {
        tags: ['frontend'],
        category: 'web',
        excludeTags: ['experimental']
      });

      expect(filtered).toEqual(['react-app.md', 'typescript-util.md']);
    });

    test('沒有過濾條件時應該回傳所有檔案', async () => {
      const promptNames = ['react-app.md', 'node-api.md'];
      
      const filtered = await parser.filterPrompts(promptNames, {});

      expect(filtered).toEqual(promptNames);
    });
  });

  describe('getCacheStats', () => {
    test('應該回傳正確的快取統計資訊', async () => {
      const promptContent = `---
tags: [test]
---
# Test`;

      await fs.writeFile(path.join(mockPromptsDir, 'stats-test.md'), promptContent);
      await parser.parseMetadata('stats-test.md');

      const stats = parser.getCacheStats();

      expect(stats).toMatchObject({
        cacheSize: 1,
        mtimeCacheSize: 1,
        cachedFiles: ['stats-test.md']
      });
    });
  });

  it('should warn and return error for unsupported YAML structure', () => {
    const mockContent = `---\ninvalid: yaml: [\n---\n`; // Invalid YAML
    const instance = new PromptMetadataParser();

    expect(() => instance._parseFrontmatter(mockContent)).toThrow('YAML 解析錯誤');
  });

  it('should return empty metadata for content without frontmatter', () => {
    const content = 'No frontmatter here';
    const instance = new PromptMetadataParser();
    const metadata = instance._parseFrontmatter(content);
    expect(metadata).toEqual({});
  });

  it('should handle caching incomplete due to fs.stat error', async () => {
    jest.spyOn(fs, 'stat').mockRejectedValue(new Error('stat error'));
    const instance = new PromptMetadataParser();
    const promptPath = 'mock/path/to/prompt.md';
    const cacheResultSpy = jest.spyOn(instance.cache, 'set');
    await instance._cacheResult(promptPath, { tags: [] });

    expect(cacheResultSpy).not.toHaveBeenCalled();
  });

  it('should handle invalid cache result due to file not existing', async () => {
    const instance = new PromptMetadataParser();
    const promptPath = 'mock/path/to/nonexistent.md';
    const isValid = await instance._isCacheValid(promptPath);

    expect(isValid).toBe(false);
  });
});
