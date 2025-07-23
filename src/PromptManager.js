const fs = require('fs-extra');
const path = require('path');
const FileSystemManager = require('./FileSystemManager');
const { PermissionError, ValidationError, NotFoundError, FileSystemError } = require('./errors');

class PromptManager {
  static getPromptsDir() {
    return path.join(FileSystemManager.getGlobalRexDir(), 'prompts');
  }

  static async ensurePromptsDir() {
    try {
      await fs.ensureDir(this.getPromptsDir());
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(this.getPromptsDir(), 'Cannot create prompts directory.');
      }
      throw new Error(`Failed to create prompts directory: ${err.message}`);
    }
  }

  static async importPrompt(sourcePath, targetName = null) {
    // 驗證來源檔案存在
    if (!await fs.pathExists(sourcePath)) {
      throw new Error(`Source file does not exist: ${sourcePath}`);
    }

    // 確保 prompts 目錄存在
    await this.ensurePromptsDir();

    // 決定目標檔名
    const fileName = targetName || path.basename(sourcePath);
    const targetPath = path.join(this.getPromptsDir(), fileName);

    try {
      // 檢查目標檔案是否已存在
      const exists = await fs.pathExists(targetPath);
      if (exists) {
        throw new Error(`Prompt '${fileName}' already exists in library. Use --force to overwrite.`);
      }

      // 複製檔案到 prompts 目錄
      await fs.copyFile(sourcePath, targetPath);
      return { fileName, targetPath };
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(targetPath, 'Cannot write to prompts directory.');
      }
      if (err.message.includes('already exists')) {
        throw err; // 重新拋出已存在的錯誤
      }
      throw new Error(`Failed to import prompt: ${err.message}`);
    }
  }

  static async importPromptWithForce(sourcePath, targetName = null) {
    // 驗證來源檔案存在
    if (!await fs.pathExists(sourcePath)) {
      throw new Error(`Source file does not exist: ${sourcePath}`);
    }

    // 確保 prompts 目錄存在
    await this.ensurePromptsDir();

    // 決定目標檔名
    const fileName = targetName || path.basename(sourcePath);
    const targetPath = path.join(this.getPromptsDir(), fileName);

    try {
      // 強制複製檔案（覆寫如果存在）
      await fs.copyFile(sourcePath, targetPath);
      return { fileName, targetPath };
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(targetPath, 'Cannot write to prompts directory.');
      }
      throw new Error(`Failed to import prompt: ${err.message}`);
    }
  }

  static async listPrompts() {
    try {
      // 確保 prompts 目錄存在
      await this.ensurePromptsDir();

      // 讀取目錄內容
      const files = await fs.readdir(this.getPromptsDir());
      
      // 過濾出檔案（排除目錄）並獲取詳細資訊
      const prompts = [];
      for (const file of files) {
        const filePath = path.join(this.getPromptsDir(), file);
        const stat = await fs.stat(filePath);
        
        if (stat.isFile()) {
          prompts.push({
            name: file,
            size: stat.size,
            modified: stat.mtime,
            path: filePath
          });
        }
      }

      // 按修改時間排序（最新的在前）
      prompts.sort((a, b) => b.modified - a.modified);
      
      return prompts;
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(this.getPromptsDir(), 'Cannot read prompts directory.');
      }
      throw new Error(`Failed to list prompts: ${err.message}`);
    }
  }

  static async removePrompt(promptName, force = false) {
    // 驗證輸入參數
    if (!promptName || typeof promptName !== 'string') {
      throw new Error('Prompt name is required and must be a string.');
    }

    // 確保 prompts 目錄存在
    await this.ensurePromptsDir();

    const promptPath = path.join(this.getPromptsDir(), promptName);

    try {
      // 檢查提示檔案是否存在
      const exists = await fs.pathExists(promptPath);
      if (!exists) {
        throw new NotFoundError(promptName, 'prompt');
      }

      // 安全檢查：如果沒有使用 --force 標誌，要求確認
      if (!force) {
        throw new Error(`Cannot remove prompt '${promptName}' without --force flag. This operation cannot be undone.`);
      }

      // 驗證這是一個檔案而不是目錄
      const stat = await fs.stat(promptPath);
      if (!stat.isFile()) {
        throw new Error(`'${promptName}' is not a valid prompt file.`);
      }

      // 刪除檔案
      await fs.remove(promptPath);
      return { promptName, path: promptPath };
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(promptPath, 'Cannot delete prompt from library.');
      }
      if (err instanceof NotFoundError || err.message.includes('without --force') || err.message.includes('not a valid prompt')) {
        throw err; // 重新拋出已知的錯誤
      }
      throw new Error(`Failed to remove prompt: ${err.message}`);
    }
  }

  static async renamePrompt(oldName, newName) {
    // 驗證輸入參數
    if (!oldName || typeof oldName !== 'string') {
      throw new Error('Old prompt name is required and must be a string.');
    }
    if (!newName || typeof newName !== 'string') {
      throw new Error('New prompt name is required and must be a string.');
    }
    if (oldName === newName) {
      throw new Error('Old and new prompt names cannot be the same.');
    }

    // 確保 prompts 目錄存在
    await this.ensurePromptsDir();

    const oldPath = path.join(this.getPromptsDir(), oldName);
    const newPath = path.join(this.getPromptsDir(), newName);

    try {
      // 檢查舊提示檔案是否存在
      const oldExists = await fs.pathExists(oldPath);
      if (!oldExists) {
        throw new NotFoundError(oldName, 'prompt');
      }

      // 驗證舊檔案是一個檔案而不是目錄
      const oldStat = await fs.stat(oldPath);
      if (!oldStat.isFile()) {
        throw new Error(`'${oldName}' is not a valid prompt file.`);
      }

      // 檢查新名稱是否已經被使用
      const newExists = await fs.pathExists(newPath);
      if (newExists) {
        throw new Error(`A prompt named '${newName}' already exists in library.`);
      }

      // 重新命名檔案
      await fs.move(oldPath, newPath);
      return { oldName, newName, oldPath, newPath };
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(oldPath, 'Cannot rename prompt in library.');
      }
      if (err instanceof NotFoundError || err.message.includes('not a valid prompt') || err.message.includes('already exists') || err.message.includes('cannot be the same')) {
        throw err; // 重新拋出已知的錯誤
      }
      throw new Error(`Failed to rename prompt: ${err.message}`);
    }
  }

  static async exportPrompt(promptName, outputPath, format = null) {
    // 驗證輸入參數
    if (!promptName || typeof promptName !== 'string') {
      throw new Error('Prompt name is required and must be a string.');
    }
    if (!outputPath || typeof outputPath !== 'string') {
      throw new Error('Output path is required and must be a string.');
    }

    // 確保 prompts 目錄存在
    await this.ensurePromptsDir();

    const promptPath = path.join(this.getPromptsDir(), promptName);

    try {
      // 檢查提示檔案是否存在
      const exists = await fs.pathExists(promptPath);
      if (!exists) {
        throw new NotFoundError(promptName, 'prompt');
      }

      // 驗證是一個檔案而不是目錄
      const stat = await fs.stat(promptPath);
      if (!stat.isFile()) {
        throw new Error(`'${promptName}' is not a valid prompt file.`);
      }

      // 檢查輸出路徑是否已存在
      const outputExists = await fs.pathExists(outputPath);
      if (outputExists) {
        throw new Error(`Output file '${outputPath}' already exists. Use --force to overwrite.`);
      }

      // 確保輸出目錄存在
      const outputDir = path.dirname(outputPath);
      await fs.ensureDir(outputDir);

      // 根據格式決定處理方式
      if (!format || format === 'copy') {
        // 直接複製檔案
        await fs.copyFile(promptPath, outputPath);
      } else {
        // 暂時不支援其他格式，但為未來擴展留余空間
        throw new Error(`Export format '${format}' is not supported. Currently only 'copy' format is supported.`);
      }

      return { promptName, outputPath, format: format || 'copy', sourcePath: promptPath };
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(outputPath, 'Cannot write to output location.');
      }
      if (err instanceof NotFoundError || err.message.includes('not a valid prompt') || err.message.includes('already exists') || err.message.includes('not supported')) {
        throw err; // 重新拋出已知的錯誤
      }
      throw new Error(`Failed to export prompt: ${err.message}`);
    }
  }

  static async exportPromptWithForce(promptName, outputPath, format = null) {
    // 驗證輸入參數
    if (!promptName || typeof promptName !== 'string') {
      throw new Error('Prompt name is required and must be a string.');
    }
    if (!outputPath || typeof outputPath !== 'string') {
      throw new Error('Output path is required and must be a string.');
    }

    // 確保 prompts 目錄存在
    await this.ensurePromptsDir();

    const promptPath = path.join(this.getPromptsDir(), promptName);

    try {
      // 檢查提示檔案是否存在
      const exists = await fs.pathExists(promptPath);
      if (!exists) {
        throw new NotFoundError(promptName, 'prompt');
      }

      // 驗證是一個檔案而不是目錄
      const stat = await fs.stat(promptPath);
      if (!stat.isFile()) {
        throw new Error(`'${promptName}' is not a valid prompt file.`);
      }

      // 確保輸出目錄存在
      const outputDir = path.dirname(outputPath);
      await fs.ensureDir(outputDir);

      // 根據格式決定處理方式
      if (!format || format === 'copy') {
        // 強制複製檔案（覆寫如果存在）
        await fs.copyFile(promptPath, outputPath);
      } else {
        // 暂時不支援其他格式，但為未來擴展留余空間
        throw new Error(`Export format '${format}' is not supported. Currently only 'copy' format is supported.`);
      }

      return { promptName, outputPath, format: format || 'copy', sourcePath: promptPath };
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(outputPath, 'Cannot write to output location.');
      }
      if (err instanceof NotFoundError || err.message.includes('not a valid prompt') || err.message.includes('not supported')) {
        throw err; // 重新拋出已知的錯誤
      }
      throw new Error(`Failed to export prompt: ${err.message}`);
    }
  }

  static formatPromptList(prompts) {
    if (prompts.length === 0) {
      return 'No prompts found in library.';
    }

    let output = `Found ${prompts.length} prompt(s):\n\n`;
    
    for (const prompt of prompts) {
      const sizeKB = Math.ceil(prompt.size / 1024);
      const modifiedDate = prompt.modified.toISOString().split('T')[0];
      output += `  ${prompt.name}\n`;
      output += `    Size: ${sizeKB}KB | Modified: ${modifiedDate}\n\n`;
    }

    return output.trim();
  }

  static async searchPrompts(query, options = { regex: false, caseSensitive: false }) {
    // 驗證輸入參數
    if (!query || typeof query !== 'string') {
      throw new Error('Search query is required and must be a string.');
    }

    try {
      // 確保 prompts 目錄存在
      await this.ensurePromptsDir();
      
      const promptsDir = this.getPromptsDir();
      const files = await fs.readdir(promptsDir);
      const results = [];

      const isRegex = options.regex;
      const isCaseSensitive = options.caseSensitive;
      let queryPattern = null;
      
      if (isRegex) {
        try {
          queryPattern = new RegExp(query, isCaseSensitive ? '' : 'i');
        } catch (regexError) {
          throw new Error(`Invalid regular expression: ${regexError.message}`);
        }
      }

      for (const file of files) {
        const filePath = path.join(promptsDir, file);
        const stat = await fs.stat(filePath);

        if (stat.isFile()) {
          const content = await fs.readFile(filePath, 'utf8');
          let match = false;

          if (isRegex) {
            match = queryPattern.test(file) || queryPattern.test(content);
          } else {
            const fileName = isCaseSensitive ? file : file.toLowerCase();
            const fileContent = isCaseSensitive ? content : content.toLowerCase();
            const searchQuery = isCaseSensitive ? query : query.toLowerCase();

            match = fileName.includes(searchQuery) || fileContent.includes(searchQuery);
          }

          if (match) {
            results.push({ name: file, path: filePath });
          }
        }
      }
      return results;
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(this.getPromptsDir(), 'Cannot read prompts directory.');
      }
      if (err.message.includes('Invalid regular expression')) {
        throw err; // 重新拋出正則表達式錯誤
      }
      throw new Error(`Failed to search prompts: ${err.message}`);
    }
  }

  static formatSearchResults(results, query, options = {}) {
    if (results.length === 0) {
      return `No prompts found matching "${query}".`;
    }

    const { regex, caseSensitive } = options;
    const searchType = regex ? 'regex' : 'text';
    const sensitivity = caseSensitive ? 'case-sensitive' : 'case-insensitive';
    
    let output = `🔍 Found ${results.length} prompt(s) matching "${query}" (${searchType}, ${sensitivity}):\n\n`;
    
    for (const result of results) {
      output += `  ✓ ${result.name}\n`;
    }

    return output.trim();
  }
}

module.exports = PromptManager;
