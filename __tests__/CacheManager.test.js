const CacheManager = require('../src/CacheManager');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Mock fs-extra
jest.mock('fs-extra');

describe('CacheManager', () => {
  let cacheManager;
  let mockTempDir;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTempDir = path.join(os.tmpdir(), 'rex-test-cache');
    
    // Mock process.cwd to return our mock directory
    jest.spyOn(process, 'cwd').mockReturnValue(mockTempDir);
    
    cacheManager = new CacheManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('loadCache', () => {
    it('應該成功載入現有的快取檔案', async () => {
      const mockHashCache = { 'file1.md': 'hash1' };
      const mockDetectionCache = { '/project': { detected: ['github-copilot'] } };

      fs.readJson
        .mockResolvedValueOnce(mockHashCache)
        .mockResolvedValueOnce(mockDetectionCache);

      const result = await cacheManager.loadCache();

      expect(result).toEqual({
        hashCache: mockHashCache,
        detectionCache: mockDetectionCache
      });
      expect(fs.readJson).toHaveBeenCalledTimes(2);
    });

    it('應該在快取檔案不存在時返回空物件', async () => {
      fs.readJson.mockResolvedValue(null);

      const result = await cacheManager.loadCache();

      expect(result).toEqual({
        hashCache: {},
        detectionCache: {}
      });
    });

    it('應該在載入失敗時返回空物件並顯示警告', async () => {
      fs.readJson.mockRejectedValue(new Error('File not found'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await cacheManager.loadCache();

      expect(result).toEqual({
        hashCache: {},
        detectionCache: {}
      });
      expect(consoleSpy).toHaveBeenCalledWith('警告：無法載入快取: File not found');
    });
  });

  describe('saveCache', () => {
    it('應該成功儲存快取到檔案系統', async () => {
      const hashCache = { 'file1.md': 'hash1' };
      const detectionCache = { '/project': { detected: ['github-copilot'] } };

      fs.ensureDir.mockResolvedValue();
      fs.writeJson.mockResolvedValue();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await cacheManager.saveCache(hashCache, detectionCache);

      expect(fs.ensureDir).toHaveBeenCalledWith(cacheManager.cacheDir);
      expect(fs.writeJson).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith('✅ 快取儲存成功');
    });

    it('應該處理儲存失敗的情況', async () => {
      fs.ensureDir.mockRejectedValue(new Error('Permission denied'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await cacheManager.saveCache({}, {});

      expect(consoleSpy).toHaveBeenCalledWith('儲存快取失敗: Permission denied');
    });
  });

  describe('calculateFileHash', () => {
    it('應該計算檔案的 SHA256 雜湊', async () => {
      const fileContent = 'test content';
      fs.readFile.mockResolvedValue(fileContent);

      const hash = await cacheManager.calculateFileHash('/test/file.md');

      const expectedHash = '6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72';
      expect(hash).toBe(expectedHash);
      expect(fs.readFile).toHaveBeenCalledWith('/test/file.md', 'utf8');
    });

    it('應該在檔案讀取失敗時返回 null', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const hash = await cacheManager.calculateFileHash('/test/missing.md');

      expect(hash).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('計算檔案雜湊失敗 /test/missing.md: File not found');
    });
  });

  describe('hasFileChanged', () => {
    it('應該在檔案雜湊不同時返回 true', async () => {
      const hashCache = { '/test/file.md': 'old-hash' };
      fs.readFile.mockResolvedValue('new content');

      const result = await cacheManager.hasFileChanged('/test/file.md', hashCache);

      expect(result).toBe(true);
    });

    it('應該在檔案雜湊相同時返回 false', async () => {
      const expectedHashContent = 'same content';
      const expectedHash = 'a636bd7cd42060a4d07fa1bfbcc010eb7794c2ba721e1e3e4c20335a15b66eaf';
      const hashCache = { '/test/file.md': expectedHash };
      
      fs.readFile.mockResolvedValue(expectedHashContent);

      const result = await cacheManager.hasFileChanged('/test/file.md', hashCache);

      expect(result).toBe(false);
    });

    it('應該在快取中沒有檔案記錄時返回 true', async () => {
      const hashCache = {};
      fs.readFile.mockResolvedValue('content');

      const result = await cacheManager.hasFileChanged('/test/new-file.md', hashCache);

      expect(result).toBe(true);
    });

    it('應該在無法計算檔案雜湊時返回 true (覆蓋 line 77)', async () => {
      const hashCache = { '/test/file.md': 'existing-hash' };
      fs.readFile.mockRejectedValue(new Error('File read error'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await cacheManager.hasFileChanged('/test/file.md', hashCache);

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('計算檔案雜湊失敗 /test/file.md: File read error');
    });
  });

  describe('getChangedFiles', () => {
    it('應該正確識別變更和未變更的檔案', async () => {
      const filePaths = ['/test/changed.md', '/test/unchanged.md'];
      const unchangedContent = 'same content';
      const unchangedHash = 'a636bd7cd42060a4d07fa1bfbcc010eb7794c2ba721e1e3e4c20335a15b66eaf';
      const hashCache = { '/test/unchanged.md': unchangedHash };
      
      fs.readJson.mockResolvedValue(hashCache);
      fs.readFile
        .mockResolvedValueOnce('new content') // for changed.md
        .mockResolvedValueOnce(unchangedContent); // for unchanged.md

      const result = await cacheManager.getChangedFiles(filePaths);

      expect(result.changed).toContain('/test/changed.md');
      expect(result.unchanged).toContain('/test/unchanged.md');
    });
  });

  describe('clearCache', () => {
    it('應該成功清除快取目錄', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.remove.mockResolvedValue();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await cacheManager.clearCache();

      expect(fs.remove).toHaveBeenCalledWith(cacheManager.cacheDir);
      expect(consoleSpy).toHaveBeenCalledWith('✅ 快取已清除');
    });
    it('應該在快取目錄不存在時正常處理', async () => {
      fs.pathExists.mockResolvedValue(false);

      await cacheManager.clearCache();

      expect(fs.remove).not.toHaveBeenCalled();
    });

    it('應該處理清除快取時的錯誤', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.remove.mockRejectedValue(new Error('Permission denied'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await cacheManager.clearCache();

      expect(consoleSpy).toHaveBeenCalledWith('清除快取失敗: Permission denied');
    });
  });

  describe('updateFileHash', () => {
    it('應該成功更新檔案雜湊 (覆蓋 line 90)', async () => {
      const hashCache = {};
      fs.readFile.mockResolvedValue('test content');

      await cacheManager.updateFileHash('/test/file.md', hashCache);

      const expectedHash = '6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72';
      expect(hashCache['/test/file.md']).toBe(expectedHash);
      expect(fs.readFile).toHaveBeenCalledWith('/test/file.md', 'utf8');
    });

    it('應該在計算雜湊失敗時不更新快取', async () => {
      const hashCache = {};
      fs.readFile.mockRejectedValue(new Error('File read error'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await cacheManager.updateFileHash('/test/missing.md', hashCache);

      expect(Object.keys(hashCache)).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith('計算檔案雜湊失敗 /test/missing.md: File read error');
    });
  });

  describe('getCacheStats', () => {
    it('應該返回快取統計資訊', async () => {
      const hashCache = { 'file1.md': 'hash1', 'file2.md': 'hash2' };
      const detectionCache = { '/project1': {}, '/project2': {} };
      
      fs.readJson
        .mockResolvedValueOnce(hashCache)
        .mockResolvedValueOnce(detectionCache);
      fs.pathExists.mockResolvedValue(true);

      const stats = await cacheManager.getCacheStats();

      expect(stats).toEqual({
        hashCacheSize: 2,
        detectionCacheSize: 2,
        cacheDir: cacheManager.cacheDir,
        exists: true
      });
    });

    it('應該處理獲取統計資訊時的錯誤', async () => {
      fs.readJson.mockRejectedValue(new Error('Read error'));
      fs.pathExists.mockRejectedValue(new Error('Path error'));

      const stats = await cacheManager.getCacheStats();

      expect(stats).toEqual({
        hashCacheSize: 0,
        detectionCacheSize: 0,
        cacheDir: cacheManager.cacheDir,
        exists: false,
        error: 'Path error'
      });
    });
  });
});
