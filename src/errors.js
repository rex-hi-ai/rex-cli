class PermissionError extends Error {
  constructor(path, message) {
    super(`Permission denied: ${path}. ${message}`);
    this.name = 'PermissionError';
    this.path = path;
  }
}

class ValidationError extends Error {
  constructor(message, suggestions = []) {
    super(message);
    this.name = 'ValidationError';
    this.suggestions = suggestions;
  }
}

class NotFoundError extends Error {
  constructor(resource, type = 'resource') {
    super(`${type} '${resource}' not found`);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.type = type;
  }
}

class FileSystemError extends Error {
  constructor(operation, path, originalError) {
    const errorMessage = originalError && originalError.message ? originalError.message : (originalError || 'Unknown error');
    super(`Failed to ${operation} '${path}': ${errorMessage}`);
    this.name = 'FileSystemError';
    this.operation = operation;
    this.path = path;
    this.originalError = originalError;
  }
}

class ErrorHandler {
  static handleError(error, context = {}) {
    if (error instanceof PermissionError) {
      console.error(`❌ 權限錯誤: ${error.message}`);
      console.error('💡 建議: 請檢查檔案權限或使用管理員權限');
    } else if (error instanceof ValidationError) {
      console.error(`❌ 輸入錯誤: ${error.message}`);
      if (error.suggestions.length > 0) {
        console.error('💡 建議:');
        error.suggestions.forEach(suggestion => {
          console.error(`   - ${suggestion}`);
        });
      }
    } else if (error instanceof NotFoundError) {
      console.error(`❌ 找不到資源: ${error.message}`);
      if (error.type === 'prompt') {
        console.error('💡 使用 "rex-cli prompt list" 查看可用的提示');
      }
    } else if (error instanceof FileSystemError) {
      console.error(`❌ 檔案系統錯誤: ${error.message}`);
      if (error.originalError.code === 'ENOENT') {
        console.error('💡 建議: 請確認路徑是否正確');
      } else if (error.originalError.code === 'EACCES') {
        console.error('💡 建議: 請檢查檔案權限');
      }
    } else {
      // Generic error handling
      console.error(`❌ 錯誤: ${error.message}`);
    }
    
    // Add context information if available
    if (context.command) {
      console.error(`📝 命令: ${context.command}`);
    }
    
    process.exit(1);
  }
  
  static formatSuggestions(command, examples = []) {
    const suggestions = [`使用 "${command} --help" 查看詳細說明`];
    examples.forEach(example => {
      suggestions.push(`範例: ${example}`);
    });
    return suggestions;
  }
}

module.exports = { 
  PermissionError, 
  ValidationError, 
  NotFoundError, 
  FileSystemError,
  ErrorHandler 
};
