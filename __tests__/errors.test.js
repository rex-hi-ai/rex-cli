const { 
  PermissionError, 
  ValidationError, 
  NotFoundError, 
  FileSystemError,
  ErrorHandler 
} = require('../src/errors');

describe('錯誤類別測試', () => {
  describe('PermissionError', () => {
    it('應該正確建立權限錯誤', () => {
      const error = new PermissionError('/path/to/file', '無法寫入檔案');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PermissionError');
      expect(error.message).toBe('Permission denied: /path/to/file. 無法寫入檔案');
      expect(error.path).toBe('/path/to/file');
    });
  });

  describe('ValidationError', () => {
    it('應該正確建立驗證錯誤（無建議）', () => {
      const error = new ValidationError('輸入格式無效');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('輸入格式無效');
      expect(error.suggestions).toEqual([]);
    });

    it('應該正確建立驗證錯誤（有建議）', () => {
      const suggestions = ['請檢查輸入格式', '參考文件說明'];
      const error = new ValidationError('輸入格式無效', suggestions);
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('輸入格式無效');
      expect(error.suggestions).toEqual(suggestions);
    });
  });

  describe('NotFoundError', () => {
    it('應該正確建立未找到錯誤（預設類型）', () => {
      const error = new NotFoundError('my-prompt');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe("resource 'my-prompt' not found");
      expect(error.resource).toBe('my-prompt');
      expect(error.type).toBe('resource');
    });

    it('應該正確建立未找到錯誤（自訂類型）', () => {
      const error = new NotFoundError('my-prompt', 'prompt');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe("prompt 'my-prompt' not found");
      expect(error.resource).toBe('my-prompt');
      expect(error.type).toBe('prompt');
    });
  });

  describe('FileSystemError', () => {
    it('應該正確建立檔案系統錯誤', () => {
      const originalError = new Error('ENOENT: no such file or directory');
      originalError.code = 'ENOENT';
      const error = new FileSystemError('read', '/path/to/file', originalError);
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('FileSystemError');
      expect(error.message).toBe("Failed to read '/path/to/file': ENOENT: no such file or directory");
      expect(error.operation).toBe('read');
      expect(error.path).toBe('/path/to/file');
      expect(error.originalError).toBe(originalError);
    });
  });
});

describe('ErrorHandler 測試', () => {
  let consoleSpy;
  let processExitSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('handleError', () => {
    it('應該正確處理 PermissionError', () => {
      const error = new PermissionError('/path/to/file', '無法寫入檔案');
      
      ErrorHandler.handleError(error);
      
      expect(consoleSpy).toHaveBeenCalledWith('❌ 權限錯誤: Permission denied: /path/to/file. 無法寫入檔案');
      expect(consoleSpy).toHaveBeenCalledWith('💡 建議: 請檢查檔案權限或使用管理員權限');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('應該正確處理 ValidationError（無建議）', () => {
      const error = new ValidationError('輸入格式無效');
      
      ErrorHandler.handleError(error);
      
      expect(consoleSpy).toHaveBeenCalledWith('❌ 輸入錯誤: 輸入格式無效');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('應該正確處理 ValidationError（有建議）', () => {
      const error = new ValidationError('輸入格式無效', ['請檢查格式', '參考說明']);
      
      ErrorHandler.handleError(error);
      
      expect(consoleSpy).toHaveBeenCalledWith('❌ 輸入錯誤: 輸入格式無效');
      expect(consoleSpy).toHaveBeenCalledWith('💡 建議:');
      expect(consoleSpy).toHaveBeenCalledWith('   - 請檢查格式');
      expect(consoleSpy).toHaveBeenCalledWith('   - 參考說明');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('應該正確處理 NotFoundError（一般類型）', () => {
      const error = new NotFoundError('my-file', 'file');
      
      ErrorHandler.handleError(error);
      
      expect(consoleSpy).toHaveBeenCalledWith("❌ 找不到資源: file 'my-file' not found");
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('應該正確處理 NotFoundError（prompt 類型）', () => {
      const error = new NotFoundError('my-prompt', 'prompt');
      
      ErrorHandler.handleError(error);
      
      expect(consoleSpy).toHaveBeenCalledWith("❌ 找不到資源: prompt 'my-prompt' not found");
      expect(consoleSpy).toHaveBeenCalledWith('💡 使用 "rex-cli prompt list" 查看可用的提示');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('應該正確處理 FileSystemError（ENOENT）', () => {
      const originalError = new Error('No such file');
      originalError.code = 'ENOENT';
      const error = new FileSystemError('read', '/path/to/file', originalError);
      
      ErrorHandler.handleError(error);
      
      expect(consoleSpy).toHaveBeenCalledWith("❌ 檔案系統錯誤: Failed to read '/path/to/file': No such file");
      expect(consoleSpy).toHaveBeenCalledWith('💡 建議: 請確認路徑是否正確');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('應該正確處理 FileSystemError（EACCES）', () => {
      const originalError = new Error('Permission denied');
      originalError.code = 'EACCES';
      const error = new FileSystemError('write', '/path/to/file', originalError);
      
      ErrorHandler.handleError(error);
      
      expect(consoleSpy).toHaveBeenCalledWith("❌ 檔案系統錯誤: Failed to write '/path/to/file': Permission denied");
      expect(consoleSpy).toHaveBeenCalledWith('💡 建議: 請檢查檔案權限');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('應該正確處理一般錯誤', () => {
      const error = new Error('一般錯誤訊息');
      
      ErrorHandler.handleError(error);
      
      expect(consoleSpy).toHaveBeenCalledWith('❌ 錯誤: 一般錯誤訊息');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('應該顯示命令上下文資訊', () => {
      const error = new Error('測試錯誤');
      const context = { command: 'rex-cli deploy test' };
      
      ErrorHandler.handleError(error, context);
      
      expect(consoleSpy).toHaveBeenCalledWith('❌ 錯誤: 測試錯誤');
      expect(consoleSpy).toHaveBeenCalledWith('📝 命令: rex-cli deploy test');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('formatSuggestions', () => {
    it('應該格式化建議（無範例）', () => {
      const suggestions = ErrorHandler.formatSuggestions('rex-cli deploy');
      
      expect(suggestions).toEqual([
        '使用 "rex-cli deploy --help" 查看詳細說明'
      ]);
    });

    it('應該格式化建議（有範例）', () => {
      const examples = [
        'rex-cli deploy my-prompt --utility github-copilot',
        'rex-cli deploy --dry-run'
      ];
      const suggestions = ErrorHandler.formatSuggestions('rex-cli deploy', examples);
      
      expect(suggestions).toEqual([
        '使用 "rex-cli deploy --help" 查看詳細說明',
        '範例: rex-cli deploy my-prompt --utility github-copilot',
        '範例: rex-cli deploy --dry-run'
      ]);
    });
  });
});
