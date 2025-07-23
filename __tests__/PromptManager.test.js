const fs = require('fs-extra');
const path = require('path');
const PromptManager = require('../src/PromptManager');
const { NotFoundError, PermissionError, ValidationError, FileSystemError } = require('../src/errors');

// Mock FileSystemManager 模組
jest.mock('../src/FileSystemManager', () => ({
  getGlobalRexDir: () => '/home/user/.rex'
}));

jest.mock('fs-extra');

beforeEach(() => {
  jest.clearAllMocks();
});

// 測試 `PromptManager` 功能

describe('PromptManager', () => {
  describe('importPrompt', () => {
    it('應該成功匯入新的提示', async () => {
      const sourcePath = '/test/source.md';
      
      // 模擬來源檔案存在
      fs.pathExists.mockImplementation((path) => {
        if (path === sourcePath) return Promise.resolve(true);
        if (path.includes('.rex/prompts/source.md')) return Promise.resolve(false);
        return Promise.resolve(true);
      });
      
      fs.ensureDir.mockResolvedValue();
      fs.copyFile.mockResolvedValue();

      const result = await PromptManager.importPrompt(sourcePath);

      // 應該檢查來源檔案是否存在
      expect(fs.pathExists).toHaveBeenCalledWith(sourcePath);
      // 應該確保目錄存在
      expect(fs.ensureDir).toHaveBeenCalled();
      // 應該複製檔案
      expect(fs.copyFile).toHaveBeenCalled();
      expect(result).toHaveProperty('fileName', 'source.md');
      expect(result).toHaveProperty('targetPath');
    });

    it('當來源檔案不存在時應該失敗', async () => {
      const sourcePath = '/test/nonexistent.md';
      fs.pathExists.mockResolvedValue(false);

      await expect(PromptManager.importPrompt(sourcePath)).rejects.toThrow('Source file does not exist');
      expect(fs.pathExists).toHaveBeenCalledWith(sourcePath);
    });

    it('當目標檔案已存在時應該失敗', async () => {
      const sourcePath = '/test/existing.md';
      
      fs.pathExists.mockImplementation((path) => {
        if (path === sourcePath) return Promise.resolve(true);
        return Promise.resolve(true); // 目標檔案已存在
      });
      fs.ensureDir.mockResolvedValue();

      await expect(PromptManager.importPrompt(sourcePath)).rejects.toThrow('already exists');
    });

    // Note: File format validation is not implemented yet in PromptManager
    // This would be a future enhancement
  });

  describe('importPromptWithForce', () => {
    it('應該強制覆寫已存在的提示', async () => {
      const sourcePath = '/test/source.md';
      
      fs.pathExists.mockResolvedValue(true);
      fs.ensureDir.mockResolvedValue();
      fs.copyFile.mockResolvedValue();

      const result = await PromptManager.importPromptWithForce(sourcePath);

      expect(fs.pathExists).toHaveBeenCalledWith(sourcePath);
      expect(fs.copyFile).toHaveBeenCalled();
      expect(result).toHaveProperty('fileName', 'source.md');
    });
  });

  describe('listPrompts', () => {
    it('應該列出存在的提示', async () => {
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockResolvedValue(['example.md', 'test.txt']);
      fs.stat.mockResolvedValue({ 
        isFile: () => true, 
        size: 2048, 
        mtime: new Date('2023-01-01') 
      });

      const prompts = await PromptManager.listPrompts();

      expect(fs.readdir).toHaveBeenCalled();
      expect(prompts).toHaveLength(2);
      expect(prompts[0]).toHaveProperty('name', 'example.md');
      expect(prompts[0]).toHaveProperty('size', 2048);
    });

    it('應該過濾掉目錄', async () => {
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockResolvedValue(['file.md', 'directory']);
      fs.stat.mockImplementation((path) => {
        if (path.includes('file.md')) {
          return Promise.resolve({ isFile: () => true, size: 1024, mtime: new Date() });
        }
        return Promise.resolve({ isFile: () => false });
      });

      const prompts = await PromptManager.listPrompts();

      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('file.md');
    });
  });

  describe('formatPromptList', () => {
    it('應該格式化空的提示清單', () => {
      const output = PromptManager.formatPromptList([]);
      expect(output).toBe('No prompts found in library.');
    });

    it('應該格式化提示清單', () => {
      const prompts = [{
        name: 'test.md',
        size: 2048,
        modified: new Date('2023-01-01T12:00:00Z')
      }];

      const output = PromptManager.formatPromptList(prompts);
      expect(output).toContain('Found 1 prompt(s):');
      expect(output).toContain('test.md');
      expect(output).toContain('Size: 2KB');
      expect(output).toContain('Modified: 2023-01-01');
    });

    it('應該格式化多個提示並按修改時間排序', () => {
      const prompts = [
        {
          name: 'newer.md',
          size: 1024,
          modified: new Date('2023-01-02T12:00:00Z')
        },
        {
          name: 'older.md', 
          size: 512,
          modified: new Date('2023-01-01T12:00:00Z')
        }
      ];

      const output = PromptManager.formatPromptList(prompts);
      expect(output).toContain('Found 2 prompt(s):');
      // 應該按修改時間排序（newer.md 應該在前面）
      expect(output.indexOf('newer.md')).toBeLessThan(output.indexOf('older.md'));
    });
  });

  // 測試錯誤處理場景
  describe('錯誤處理', () => {
    it('匯入時應該處理權限錯誤', async () => {
      const sourcePath = '/test/source.md';
      // 模擬來源檔案存在，但目標檔案不存在（這樣才會執行到 copyFile）
      fs.pathExists.mockImplementation((path) => {
        if (path === sourcePath) return Promise.resolve(true);
        return Promise.resolve(false); // 目標檔案不存在
      });
      fs.ensureDir.mockResolvedValue();
      
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.copyFile.mockRejectedValue(permissionError);

      await expect(PromptManager.importPrompt(sourcePath)).rejects.toThrow('Cannot write to prompts directory');
    });

    it('匯入時應該處理一般檔案系統錯誤', async () => {
      const sourcePath = '/test/source.md';
      fs.pathExists.mockImplementation((path) => {
        if (path === sourcePath) return Promise.resolve(true);
        return Promise.resolve(false);
      });
      fs.ensureDir.mockResolvedValue();
      fs.copyFile.mockRejectedValue(new Error('Disk full'));

      await expect(PromptManager.importPrompt(sourcePath)).rejects.toThrow('Failed to import prompt: Disk full');
    });

    it('importPromptWithForce 應該處理來源檔案不存在', async () => {
      const sourcePath = '/test/nonexistent.md';
      fs.pathExists.mockResolvedValue(false);

      await expect(PromptManager.importPromptWithForce(sourcePath))
        .rejects.toThrow('Source file does not exist');
    });

    it('importPromptWithForce 應該處理權限錯誤', async () => {
      const sourcePath = '/test/source.md';
      fs.pathExists.mockResolvedValue(true);
      fs.ensureDir.mockResolvedValue();
      
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.copyFile.mockRejectedValue(permissionError);

      await expect(PromptManager.importPromptWithForce(sourcePath))
        .rejects.toThrow('Cannot write to prompts directory');
    });

    it('importPromptWithForce 應該處理一般檔案系統錯誤', async () => {
      const sourcePath = '/test/source.md';
      fs.pathExists.mockResolvedValue(true);
      fs.ensureDir.mockResolvedValue();
      fs.copyFile.mockRejectedValue(new Error('Disk full'));

      await expect(PromptManager.importPromptWithForce(sourcePath))
        .rejects.toThrow('Failed to import prompt: Disk full');
    });

    it('列表時應該處理權限錯誤', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.readdir.mockRejectedValue(permissionError);

      await expect(PromptManager.listPrompts()).rejects.toThrow('Cannot read prompts directory');
    });

    it('列表時應該處理一般檔案系統錯誤', async () => {
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockRejectedValue(new Error('Disk error'));

      await expect(PromptManager.listPrompts()).rejects.toThrow('Failed to list prompts: Disk error');
    });

    it('建立目錄時應該處理權限錯誤', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.ensureDir.mockRejectedValue(permissionError);

      await expect(PromptManager.ensurePromptsDir()).rejects.toThrow('Cannot create prompts directory');
    });

    it('建立目錄時應該處理一般檔案系統錯誤', async () => {
      fs.ensureDir.mockRejectedValue(new Error('Disk full'));

      await expect(PromptManager.ensurePromptsDir()).rejects.toThrow('Failed to create prompts directory');
    });
  });

  // 測試各種檔案路徑和名稱（符合 PRD 測試策略）
  describe('各種檔案路徑和名稱', () => {
    beforeEach(() => {
      // 模擬：來源檔案存在，但目標檔案不存在
      fs.pathExists.mockImplementation((path) => {
        // 先檢查是否為 .rex/prompts 中的目標檔案
        if (path.includes('/home/user/.rex/prompts/')) {
          return Promise.resolve(false); // 目標檔案不存在
        }
        // 來源檔案存在
        return Promise.resolve(true);
      });
      fs.ensureDir.mockResolvedValue();
      fs.copyFile.mockResolvedValue();
    });

    it('應該處理絕對路徑', async () => {
      const result = await PromptManager.importPrompt('/absolute/path/to/prompt.md');
      expect(result.fileName).toBe('prompt.md');
    });

    it('應該處理相對路徑', async () => {
      const result = await PromptManager.importPrompt('./relative/source.txt');
      expect(result.fileName).toBe('source.txt');
    });

    it('應該處理不同檔案副檔名', async () => {
      const extensions = ['txt', 'md', 'prompt', 'ai'];
      for (const ext of extensions) {
        const result = await PromptManager.importPrompt(`/test/source.${ext}`);
        expect(result.fileName).toBe(`source.${ext}`);
      }
    });

    it('應該處理包含空格的檔名', async () => {
      const result = await PromptManager.importPrompt('/test/my prompt file.md');
      expect(result.fileName).toBe('my prompt file.md');
    });

    it('應該處理自定義名稱', async () => {
      const result = await PromptManager.importPrompt('/test/source.md', 'custom-name.md');
      expect(result.fileName).toBe('custom-name.md');
    });
  });

  describe('removePrompt', () => {
    it('應該在沒有 --force 標誌時拒絕刪除', async () => {
      const promptName = 'test-prompt.md';
      
      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => true });

      await expect(PromptManager.removePrompt(promptName, false))
        .rejects.toThrow('Cannot remove prompt \'test-prompt.md\' without --force flag');
      
      // 確保 fs.remove 沒有被調用
      expect(fs.remove).not.toHaveBeenCalled();
    });

    it('應該在使用 --force 標誌時成功刪除提示', async () => {
      const promptName = 'test-prompt.md';
      
      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.remove.mockResolvedValue();

      const result = await PromptManager.removePrompt(promptName, true);
      
      expect(fs.pathExists).toHaveBeenCalledWith('/home/user/.rex/prompts/test-prompt.md');
      expect(fs.stat).toHaveBeenCalledWith('/home/user/.rex/prompts/test-prompt.md');
      expect(fs.remove).toHaveBeenCalledWith('/home/user/.rex/prompts/test-prompt.md');
      expect(result).toEqual({
        promptName: 'test-prompt.md',
        path: '/home/user/.rex/prompts/test-prompt.md'
      });
    });

    it('當提示不存在時應該失敗', async () => {
      const promptName = 'nonexistent.md';
      
      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(false);

      await expect(PromptManager.removePrompt(promptName, true))
        .rejects.toThrow(NotFoundError);
      
      expect(fs.remove).not.toHaveBeenCalled();
    });

    it('當提示名稱無效時應該失敗', async () => {
      await expect(PromptManager.removePrompt('', true))
        .rejects.toThrow('Prompt name is required and must be a string.');
      
      await expect(PromptManager.removePrompt(null, true))
        .rejects.toThrow('Prompt name is required and must be a string.');
      
      await expect(PromptManager.removePrompt(123, true))
        .rejects.toThrow('Prompt name is required and must be a string.');
    });

    it('當目標是目錄而不是檔案時應該失敗', async () => {
      const promptName = 'directory';
      
      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => false });

      await expect(PromptManager.removePrompt(promptName, true))
        .rejects.toThrow('\'directory\' is not a valid prompt file.');
      
      expect(fs.remove).not.toHaveBeenCalled();
    });

    it('應該在移除不合法的提示時拋出錯誤', async () => {
      await expect(PromptManager.removePrompt('.', true))
        .rejects.toThrow('is not a valid prompt file.');
    });

    it('應該處理權限錯誤', async () => {
      const promptName = 'test-prompt.md';
      
      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => true });
      
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.remove.mockRejectedValue(permissionError);

      await expect(PromptManager.removePrompt(promptName, true))
        .rejects.toThrow('Cannot delete prompt from library.');
    });

    it('應該處理其他檔案系統錯誤', async () => {
      const promptName = 'test-prompt.md';
      
      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.remove.mockRejectedValue(new Error('Disk full'));

      await expect(PromptManager.removePrompt(promptName, true))
        .rejects.toThrow('Failed to remove prompt: Disk full');
    });
  });

  describe('renamePrompt', () => {
    it('應該成功重新命名提示', async () => {
      const oldName = 'old-name.md';
      const newName = 'new-name.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(oldName)) return Promise.resolve(true);
        if (filePath.includes(newName)) return Promise.resolve(false);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.move.mockResolvedValue();

      const result = await PromptManager.renamePrompt(oldName, newName);

      expect(fs.move).toHaveBeenCalledWith(
        '/home/user/.rex/prompts/old-name.md',
        '/home/user/.rex/prompts/new-name.md'
      );
      expect(result).toEqual({
        oldName: 'old-name.md',
        newName: 'new-name.md',
        oldPath: '/home/user/.rex/prompts/old-name.md',
        newPath: '/home/user/.rex/prompts/new-name.md'
      });
    });

    it('應該驗證舊名稱參數', async () => {
      await expect(PromptManager.renamePrompt('', 'new-name.md'))
        .rejects.toThrow('Old prompt name is required and must be a string.');
      
      await expect(PromptManager.renamePrompt(null, 'new-name.md'))
        .rejects.toThrow('Old prompt name is required and must be a string.');
      
      await expect(PromptManager.renamePrompt(123, 'new-name.md'))
        .rejects.toThrow('Old prompt name is required and must be a string.');
    });

    it('應該驗證新名稱參數', async () => {
      await expect(PromptManager.renamePrompt('old-name.md', ''))
        .rejects.toThrow('New prompt name is required and must be a string.');
      
      await expect(PromptManager.renamePrompt('old-name.md', null))
        .rejects.toThrow('New prompt name is required and must be a string.');
      
      await expect(PromptManager.renamePrompt('old-name.md', 123))
        .rejects.toThrow('New prompt name is required and must be a string.');
    });

    it('當舊提示不存在時應該失敗', async () => {
      const oldName = 'nonexistent.md';
      const newName = 'new-name.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(false);

      await expect(
        PromptManager.renamePrompt(oldName, newName)
      ).rejects.toThrow(NotFoundError);
      expect(fs.move).not.toHaveBeenCalled();
    });

    it('當舊提示名和新提示名相同時應該失敗', async () => {
      const name = 'same-name.md';

      await expect(PromptManager.renamePrompt(name, name))
        .rejects.toThrow('Old and new prompt names cannot be the same.');
      expect(fs.move).not.toHaveBeenCalled();
    });

    it('當新名稱已被使用時應該失敗', async () => {
      const oldName = 'old-name.md';
      const newName = 'new-name.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(oldName)) return Promise.resolve(true);
        if (filePath.includes(newName)) return Promise.resolve(true);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => true });

      await expect(
        PromptManager.renamePrompt(oldName, newName)
      ).rejects.toThrow('A prompt named \'new-name.md\' already exists in library.');
      expect(fs.move).not.toHaveBeenCalled();
    });

    it('當目標是目錄而不是檔案時應該失敗', async () => {
      const oldName = 'directory';
      const newName = 'new-name.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => false });

      await expect(
        PromptManager.renamePrompt(oldName, newName)
      ).rejects.toThrow('\'directory\' is not a valid prompt file.');
      expect(fs.move).not.toHaveBeenCalled();
    });

    it('應該處理權限錯誤', async () => {
      const oldName = 'old-name.md';
      const newName = 'new-name.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(oldName)) return Promise.resolve(true);
        if (filePath.includes(newName)) return Promise.resolve(false);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => true });
      
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.move.mockRejectedValue(permissionError);
      
      await expect(PromptManager.renamePrompt(oldName, newName))
        .rejects.toThrow('Cannot rename prompt in library.');
    });

    it('應該處理重新命名時的文件系統錯誤', async () => {
      const oldName = 'old-file.md';
      const newName = 'new-file.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(oldName)) return Promise.resolve(true);
        if (filePath.includes(newName)) return Promise.resolve(false);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => true });

      fs.move.mockRejectedValue(new Error('File system error'));

      await expect(
        PromptManager.renamePrompt(oldName, newName)
      ).rejects.toThrow('Failed to rename prompt: File system error');
    });

    it('應該處理當舊名稱和新名稱相同時的情況', async () => {
      const sameName = 'test-file.md';

      await expect(PromptManager.renamePrompt(sameName, sameName))
        .rejects.toThrow('Old and new prompt names cannot be the same.');
    });
  });

  describe('exportPrompt', () => {
    it('應該成功匯出提示到指定路徑', async () => {
      const promptName = 'test-prompt.md';
      const outputPath = '/test/output/exported-prompt.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(promptName)) return Promise.resolve(true);
        if (filePath === outputPath) return Promise.resolve(false);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.copyFile.mockResolvedValue();

      const result = await PromptManager.exportPrompt(promptName, outputPath);

      expect(fs.copyFile).toHaveBeenCalledWith(
        '/home/user/.rex/prompts/test-prompt.md',
        '/test/output/exported-prompt.md'
      );
      expect(result).toEqual({
        promptName: 'test-prompt.md',
        outputPath: '/test/output/exported-prompt.md',
        format: 'copy',
        sourcePath: '/home/user/.rex/prompts/test-prompt.md'
      });
    });

    it('應該支援指定格式參數', async () => {
      const promptName = 'test-prompt.md';
      const outputPath = '/test/output/exported-prompt.md';
      const format = 'copy';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(promptName)) return Promise.resolve(true);
        if (filePath === outputPath) return Promise.resolve(false);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.copyFile.mockResolvedValue();

      const result = await PromptManager.exportPrompt(promptName, outputPath, format);

      expect(result.format).toBe('copy');
    });

    it('當提示不存在時應該失敗', async () => {
      const promptName = 'nonexistent.md';
      const outputPath = '/test/output/exported.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(false);

      await expect(
        PromptManager.exportPrompt(promptName, outputPath)
      ).rejects.toThrow(NotFoundError);
      expect(fs.copyFile).not.toHaveBeenCalled();
    });

    it('當輸出檔案已存在時應該失敗', async () => {
      const promptName = 'test-prompt.md';
      const outputPath = '/test/output/existing.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(promptName)) return Promise.resolve(true);
        if (filePath === outputPath) return Promise.resolve(true);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => true });

      await expect(
        PromptManager.exportPrompt(promptName, outputPath)
      ).rejects.toThrow('Output file \'/test/output/existing.md\' already exists. Use --force to overwrite.');
      expect(fs.copyFile).not.toHaveBeenCalled();
    });

    it('應該拒絕不支援的格式', async () => {
      const promptName = 'test-prompt.md';
      const outputPath = '/test/output/exported.md';
      const format = 'unsupported';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(promptName)) return Promise.resolve(true);
        if (filePath === outputPath) return Promise.resolve(false);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => true });

      await expect(
        PromptManager.exportPrompt(promptName, outputPath, format)
      ).rejects.toThrow('Export format \'unsupported\' is not supported.');
      expect(fs.copyFile).not.toHaveBeenCalled();
    });

    it('應該處理權限錯誤', async () => {
      const promptName = 'test-prompt.md';
      const outputPath = '/test/output/exported.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(promptName)) return Promise.resolve(true);
        if (filePath === outputPath) return Promise.resolve(false);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => true });
      
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.copyFile.mockRejectedValue(permissionError);

      await expect(
        PromptManager.exportPrompt(promptName, outputPath)
      ).rejects.toThrow('Cannot write to output location.');
    });

    it('應該驗證提示名稱參數', async () => {
      await expect(PromptManager.exportPrompt('', '/test/output.md'))
        .rejects.toThrow('Prompt name is required and must be a string.');
      
      await expect(PromptManager.exportPrompt(null, '/test/output.md'))
        .rejects.toThrow('Prompt name is required and must be a string.');
      
      await expect(PromptManager.exportPrompt(123, '/test/output.md'))
        .rejects.toThrow('Prompt name is required and must be a string.');
    });

    it('應該驗證輸出路徑參數', async () => {
      await expect(PromptManager.exportPrompt('test.md', ''))
        .rejects.toThrow('Output path is required and must be a string.');
      
      await expect(PromptManager.exportPrompt('test.md', null))
        .rejects.toThrow('Output path is required and must be a string.');
      
      await expect(PromptManager.exportPrompt('test.md', 123))
        .rejects.toThrow('Output path is required and must be a string.');
    });

    it('應該處理不是檔案的提示', async () => {
      const promptName = 'directory';
      const outputPath = '/test/output.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(promptName)) return Promise.resolve(true);
        if (filePath === outputPath) return Promise.resolve(false);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => false });

      await expect(
        PromptManager.exportPrompt(promptName, outputPath)
      ).rejects.toThrow('\'directory\' is not a valid prompt file.');
      expect(fs.copyFile).not.toHaveBeenCalled();
    });

    it('應該處理其他檔案系統錯誤', async () => {
      const promptName = 'test-prompt.md';
      const outputPath = '/test/output.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockImplementation((filePath) => {
        if (filePath.includes(promptName)) return Promise.resolve(true);
        if (filePath === outputPath) return Promise.resolve(false);
        return Promise.resolve();
      });
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.copyFile.mockRejectedValue(new Error('Disk full'));

      await expect(
        PromptManager.exportPrompt(promptName, outputPath)
      ).rejects.toThrow('Failed to export prompt: Disk full');
    });
  });

  describe('exportPromptWithForce', () => {
    it('應該強制匯出即使輸出檔案已存在', async () => {
      const promptName = 'test-prompt.md';
      const outputPath = '/test/output/existing.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.copyFile.mockResolvedValue();

      const result = await PromptManager.exportPromptWithForce(promptName, outputPath);

      expect(fs.copyFile).toHaveBeenCalledWith(
        '/home/user/.rex/prompts/test-prompt.md',
        '/test/output/existing.md'
      );
      expect(result.outputPath).toBe(outputPath);
    });

    it('應該驗證提示名稱參數', async () => {
      await expect(PromptManager.exportPromptWithForce('', '/test/output.md'))
        .rejects.toThrow('Prompt name is required and must be a string.');
      
      await expect(PromptManager.exportPromptWithForce(null, '/test/output.md'))
        .rejects.toThrow('Prompt name is required and must be a string.');
      
      await expect(PromptManager.exportPromptWithForce(123, '/test/output.md'))
        .rejects.toThrow('Prompt name is required and must be a string.');
    });

    it('應該驗證輸出路徑參數', async () => {
      await expect(PromptManager.exportPromptWithForce('test.md', ''))
        .rejects.toThrow('Output path is required and must be a string.');
      
      await expect(PromptManager.exportPromptWithForce('test.md', null))
        .rejects.toThrow('Output path is required and must be a string.');
      
      await expect(PromptManager.exportPromptWithForce('test.md', 123))
        .rejects.toThrow('Output path is required and must be a string.');
    });

    it('應該處理不存在的提示', async () => {
      const promptName = 'nonexistent.md';
      const outputPath = '/test/output.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(false);

      await expect(
        PromptManager.exportPromptWithForce(promptName, outputPath)
      ).rejects.toThrow(NotFoundError);
      expect(fs.copyFile).not.toHaveBeenCalled();
    });

    it('應該處理不是檔案的提示', async () => {
      const promptName = 'directory';
      const outputPath = '/test/output.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => false });

      await expect(
        PromptManager.exportPromptWithForce(promptName, outputPath)
      ).rejects.toThrow('\'directory\' is not a valid prompt file.');
      expect(fs.copyFile).not.toHaveBeenCalled();
    });

    it('應該處理不支援的格式', async () => {
      const promptName = 'test-prompt.md';
      const outputPath = '/test/output.md';
      const format = 'unsupported';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => true });

      await expect(
        PromptManager.exportPromptWithForce(promptName, outputPath, format)
      ).rejects.toThrow('Export format \'unsupported\' is not supported.');
      expect(fs.copyFile).not.toHaveBeenCalled();
    });

    it('應該處理權限錯誤', async () => {
      const promptName = 'test-prompt.md';
      const outputPath = '/test/output.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => true });
      
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.copyFile.mockRejectedValue(permissionError);

      await expect(
        PromptManager.exportPromptWithForce(promptName, outputPath)
      ).rejects.toThrow('Cannot write to output location.');
    });

    it('應該處理其他檔案系統錯誤', async () => {
      const promptName = 'test-prompt.md';
      const outputPath = '/test/output.md';

      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.copyFile.mockRejectedValue(new Error('Disk full'));

      await expect(
        PromptManager.exportPromptWithForce(promptName, outputPath)
      ).rejects.toThrow('Failed to export prompt: Disk full');
    });
  });

  // 測試 CLI 命令規範（符合 PRD）
  describe('CLI 命令規範相容性', () => {
    it('import 命令應支援 overwrite 行為（對應 PRD 的 --overwrite 標誌）', async () => {
      const sourcePath = '/test/source.md';
      fs.pathExists.mockResolvedValue(true);
      fs.ensureDir.mockResolvedValue();
      fs.copyFile.mockResolvedValue();

      // importPromptWithForce 對應 CLI 的 --overwrite/--force 標誌
      const result = await PromptManager.importPromptWithForce(sourcePath);
      expect(result.fileName).toBe('source.md');
      expect(fs.copyFile).toHaveBeenCalled();
    });

    it('remove 命令應符合 PRD 規格: rex-cli prompt remove <name> [-f, --force]', async () => {
      const promptName = 'test.md';
      
      fs.ensureDir.mockResolvedValue();
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.remove.mockResolvedValue();

      // 測試沒有 --force 標誌應該失敗
      await expect(PromptManager.removePrompt(promptName, false))
        .rejects.toThrow('without --force flag');
      
      // 測試有 --force 標誌應該成功
      const result = await PromptManager.removePrompt(promptName, true);
      expect(result.promptName).toBe(promptName);
    });
  });

  describe('searchPrompts', () => {
    it('應該支持文字搜尋', async () => {
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockResolvedValue(['test1.md', 'test2.md']);
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.readFile.mockResolvedValue('This is a test content.');

      const results = await PromptManager.searchPrompts('test');

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('name', 'test1.md');
    });

    it('應該支持正則表達式搜尋', async () => {
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockResolvedValue(['file1.md', 'file2.md']);
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('file1.md')) {
          return Promise.resolve('Sample content with special keyword.');
        }
        return Promise.resolve('Regular content without keyword.');
      });

      const results = await PromptManager.searchPrompts('special', { regex: true });

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('name', 'file1.md');
    });

    it('應該處理不合法的正則表達式', async () => {
      fs.ensureDir.mockResolvedValue();

      await expect(
        PromptManager.searchPrompts('**invalid)', { regex: true })
      ).rejects.toThrow('Invalid regular expression');
    });

    it('應該支持大小寫敏感搜尋', async () => {
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockResolvedValue(['Test.md', 'test.md']);
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.readFile.mockResolvedValue('Sample Content');

      // 大小寫敏感搜尋
      const resultsCS = await PromptManager.searchPrompts('Test', { caseSensitive: true });
      expect(resultsCS).toHaveLength(1);
      expect(resultsCS[0].name).toBe('Test.md');

      // 大小寫不敏感搜尋（預設）
      const resultsCI = await PromptManager.searchPrompts('test', { caseSensitive: false });
      expect(resultsCI).toHaveLength(2);
    });

    it('應該處理檔案讀取錯誤', async () => {
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockResolvedValue(['test.md']);
      fs.stat.mockResolvedValue({ isFile: () => true });
      
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.readFile.mockRejectedValue(permissionError);

      await expect(
        PromptManager.searchPrompts('test')
      ).rejects.toThrow('Cannot read prompts directory');
    });

    it('應該驗證搜尋參數', async () => {
      await expect(
        PromptManager.searchPrompts('')
      ).rejects.toThrow('Search query is required and must be a string.');

      await expect(
        PromptManager.searchPrompts(null)
      ).rejects.toThrow('Search query is required and must be a string.');

      await expect(
        PromptManager.searchPrompts(123)
      ).rejects.toThrow('Search query is required and must be a string.');
    });

    it('應該處理目錄權限錯誤', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      fs.readdir.mockRejectedValue(permissionError);

      await expect(
        PromptManager.searchPrompts('test')
      ).rejects.toThrow('Cannot read prompts directory');
    });

    it('應該篩選出非檔案項目', async () => {
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockResolvedValue(['test.md', 'directory', 'another.txt']);
      fs.stat.mockImplementation((filePath) => {
        if (filePath.includes('directory')) {
          return Promise.resolve({ isFile: () => false });
        }
        return Promise.resolve({ isFile: () => true });
      });
      fs.readFile.mockResolvedValue('test content');

      const results = await PromptManager.searchPrompts('test');
      expect(results).toHaveLength(2); // 應該排除 'directory'
    });

    it('應該處理一般檔案系統錯誤 (覆蓋 line 395)', async () => {
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockResolvedValue(['test.md']);
      fs.stat.mockResolvedValue({ isFile: () => true });
      
      // 模擬一般檔案系統錯誤（非權限錯誤）
      const fsError = new Error('Disk read error');
      fs.readFile.mockRejectedValue(fsError);

      await expect(
        PromptManager.searchPrompts('test')
      ).rejects.toThrow('Failed to search prompts: Disk read error');
    });
  });

  describe('formatSearchResults', () => {
    it('應該格式化空的搜尋結果', () => {
      const output = PromptManager.formatSearchResults([], 'test');
      expect(output).toBe('No prompts found matching "test".');
    });

    it('應該格式化有搜尋結果的輸出', () => {
      const results = [
        { name: 'test1.md', path: '/path/to/test1.md' },
        { name: 'test2.md', path: '/path/to/test2.md' }
      ];
      
      const output = PromptManager.formatSearchResults(results, 'test');
      expect(output).toContain('🔍 Found 2 prompt(s) matching "test"');
      expect(output).toContain('(text, case-insensitive)');
      expect(output).toContain('✓ test1.md');
      expect(output).toContain('✓ test2.md');
    });

    it('應該支持正則表達式搜尋格式化', () => {
      const results = [{ name: 'pattern.md', path: '/path/to/pattern.md' }];
      
      const output = PromptManager.formatSearchResults(results, 'pat.*', { regex: true });
      expect(output).toContain('(regex, case-insensitive)');
      expect(output).toContain('✓ pattern.md');
    });

    it('應該支持大小寫敏感搜尋格式化', () => {
      const results = [{ name: 'Test.md', path: '/path/to/Test.md' }];
      
      const output = PromptManager.formatSearchResults(results, 'Test', { caseSensitive: true });
      expect(output).toContain('(text, case-sensitive)');
      expect(output).toContain('✓ Test.md');
    });

    it('應該支持正則表達式且大小寫敏感搜尋格式化', () => {
      const results = [{ name: 'Pattern.md', path: '/path/to/Pattern.md' }];
      
      const output = PromptManager.formatSearchResults(results, 'P.*', { regex: true, caseSensitive: true });
      expect(output).toContain('(regex, case-sensitive)');
      expect(output).toContain('✓ Pattern.md');
    });
  });
});

