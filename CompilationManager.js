const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');
const UtilityRunner = require('./UtilityRunner');
const PromptManager = require('./PromptManager');
const CacheManager = require('./CacheManager');
const FileSystemManager = require('./FileSystemManager');

/**
 * CompilationManager - 管理 prompt 編譯流程
 */
class CompilationManager {
  constructor() {
    this.utilityRunner = new UtilityRunner();
  }

  /**
   * 取得編譯輸出目錄
   */
  getCompiledDir() {
    return path.join(FileSystemManager.getGlobalRexDir(), 'compiled');
  }

  /**
   * 取得特定工具的輸出目錄
   */
  getUtilityOutputDir(utilityName) {
    return path.join(this.getCompiledDir(), utilityName);
  }

  /**
   * 確保編譯目錄存在
   */
  async ensureCompiledDirs() {
    await fs.ensureDir(this.getCompiledDir());
  }

  /**
   * 清理編譯輸出
   */
  async cleanCompiled(utilityName = null) {
    if (utilityName) {
      // 清理特定工具的輸出
      const utilityDir = this.getUtilityOutputDir(utilityName);
      if (await fs.pathExists(utilityDir)) {
        await fs.remove(utilityDir);
        console.log(`✅ 已清理工具 "${utilityName}" 的編譯輸出`);
      }
    } else {
      // 清理所有編譯輸出
      const compiledDir = this.getCompiledDir();
      if (await fs.pathExists(compiledDir)) {
        await fs.remove(compiledDir);
        console.log('✅ 已清理所有編譯輸出');
      }
    }
  }

  /**
   * 編譯指定的 prompts（支援增量編譯）
   */
  async compile(options = {}) {
    const {
      utilities = null,  // 指定工具名稱陣列，null 表示所有工具
      all = false,       // 編譯所有 prompts
      clean = false,     // 編譯前清理
      promptNames = null,// 指定 prompt 名稱陣列
      incremental = true // 是否使用增量編譯
    } = options;

    try {
      await this.ensureCompiledDirs();

      // 如果指定清理，先清理輸出
      if (clean) {
        await this.cleanCompiled();
        // 清理時也清除快取，強制重新編譯
        if (incremental) {
          const cacheManager = new CacheManager();
          await cacheManager.clearCache();
        }
      }

      // 取得要使用的工具
      const targetUtilities = utilities || this.utilityRunner.getUtilityNames();
      
      // 取得要編譯的 prompts
      const availablePrompts = await PromptManager.listPrompts();
      let targetPrompts = availablePrompts;

      if (!all && promptNames) {
        // 篩選指定的 prompts
        targetPrompts = availablePrompts.filter(prompt => 
          promptNames.includes(prompt.name)
        );
      }

      if (targetPrompts.length === 0) {
        throw new Error('沒有找到要編譯的 prompts');
      }

      // 如果啟用增量編譯，檢查哪些檔案需要重新編譯
      let promptsToCompile = targetPrompts;
      let skippedCount = 0;
      
      if (incremental && !clean) {
        const result = await this.getPromptsThatNeedCompilation(targetPrompts);
        promptsToCompile = result.changed;
        skippedCount = result.unchanged.length;
        
        if (skippedCount > 0) {
          console.log(`⚡ 增量編譯：跳過 ${skippedCount} 個未變更的 prompts`);
        }
      }

      if (promptsToCompile.length === 0) {
        console.log('✅ 所有 prompts 都是最新的，無需重新編譯');
        return {
          success: true,
          compiledUtilities: targetUtilities,
          compiledPrompts: 0,
          skippedPrompts: skippedCount,
          outputDir: this.getCompiledDir(),
          incremental: true
        };
      }

      console.log(`📝 找到 ${promptsToCompile.length} 個 prompts 需要編譯`);
      if (skippedCount > 0) {
        console.log(`⚡ 跳過 ${skippedCount} 個未變更的 prompts`);
      }
      console.log(`🔧 使用工具: ${targetUtilities.join(', ')}`);

      // 對每個工具執行編譯
      for (const utilityName of targetUtilities) {
        console.log(`\\n🚀 使用工具 "${utilityName}" 編譯...`);
        
        const utilityOutputDir = this.getUtilityOutputDir(utilityName);
        await fs.ensureDir(utilityOutputDir);

        const compiledResults = await this.compileWithUtility(
          utilityName, 
          promptsToCompile,
          incremental
        );

        console.log(`✅ 工具 "${utilityName}" 編譯完成，輸出到: ${utilityOutputDir}`);
      }

      return {
        success: true,
        compiledUtilities: targetUtilities,
        compiledPrompts: promptsToCompile.length,
        skippedPrompts: skippedCount,
        outputDir: this.getCompiledDir(),
        incremental
      };

    } catch (error) {
      throw new Error(`編譯失敗: ${error.message}`);
    }
  }

  /**
   * 取得需要重新編譯的 prompts
   * @param {Array} prompts - 所有 prompts
   * @returns {Object} 包含 changed 和 unchanged 的物件
   */
  async getPromptsThatNeedCompilation(prompts) {
    const cacheManager = new CacheManager();
    
    // 取得 prompt 檔案路徑
    const promptPaths = prompts.map(prompt => {
      return path.join(
        FileSystemManager.getGlobalRexDir(),
        'prompts',
        prompt.name
      );
    });

    // 檢查哪些檔案有變更
    const { changed: changedPaths, unchanged: unchangedPaths } = 
      await cacheManager.getChangedFiles(promptPaths);

    // 將路徑對應回 prompt 物件
    const changed = prompts.filter(prompt => {
      const promptPath = path.join(
        FileSystemManager.getGlobalRexDir(),
        'prompts',
        prompt.name
      );
      return changedPaths.includes(promptPath);
    });

    const unchanged = prompts.filter(prompt => {
      const promptPath = path.join(
        FileSystemManager.getGlobalRexDir(),
        'prompts',
        prompt.name
      );
      return unchangedPaths.includes(promptPath);
    });

    return { changed, unchanged };
  }

  /**
   * 使用指定工具編譯 prompts
   */
  async compileWithUtility(utilityName, prompts, incremental = true) {
    const utility = this.utilityRunner.utilities[utilityName];
    if (!utility) {
      throw new Error(`工具不存在: ${utilityName}`);
    }

    const outputDir = this.getUtilityOutputDir(utilityName);
    const results = [];
    const cacheManager = incremental ? new CacheManager() : null;
    const { hashCache } = incremental ? await cacheManager.loadCache() : { hashCache: {} };

    for (const prompt of prompts) {
      try {
        // 讀取 prompt 內容
        const promptPath = path.join(
          FileSystemManager.getGlobalRexDir(), 
          'prompts', 
          prompt.name
        );
        const promptContent = await fs.readFile(promptPath, 'utf8');

        // 移除副檔名取得純名稱
        const promptBaseName = path.parse(prompt.name).name;
        
        // 使用工具處理 prompt
        const result = await utility.execute({
          name: promptBaseName,
          fileName: prompt.name,
          content: promptContent,
          sourcePath: promptPath,
          outputDir: outputDir
        });

        // 編譯成功後更新快取
        if (result.success && incremental && cacheManager) {
          await cacheManager.updateFileHash(promptPath, hashCache);
        }

        results.push({
          prompt: prompt.name,
          success: result.success,
          outputPath: result.outputPath
        });

        console.log(`  ✓ ${prompt.name}`);
      } catch (error) {
        console.log(`  ✗ ${prompt.name}: ${error.message}`);
        results.push({
          prompt: prompt.name,
          success: false,
          error: error.message
        });
      }
    }

    // 儲存更新後的快取
    if (incremental && cacheManager) {
      const { detectionCache } = await cacheManager.loadCache();
      await cacheManager.saveCache(hashCache, detectionCache);
    }

    return results;
  }

  /**
   * 監視模式編譯 - 監控 prompts 目錄變化並自動重新編譯
   */
  async compileWithWatch(options = {}) {
    console.log('📡 啟動監視模式...');
    
    const promptsDir = path.join(FileSystemManager.getGlobalRexDir(), 'prompts');
    
    // 確保 prompts 目錄存在
    await fs.ensureDir(promptsDir);
    
    // 執行初始編譯
    console.log('🔄 執行初始編譯...');
    try {
      const result = await this.compile(options);
      console.log(`\n🚀 初始編譯完成!`);
      console.log(`編譯了 ${result.compiledPrompts} 個 prompts，使用工具: ${result.compiledUtilities.join(', ')}`);
      if (result.skippedPrompts > 0) {
        console.log(`跳過 ${result.skippedPrompts} 個未變更的 prompts`);
      }
      console.log(`輸出目錄: ${result.outputDir}`);
    } catch (error) {
      console.error(`❌ 初始編譯失敗: ${error.message}`);
    }
    
    console.log(`\n👀 開始監視 prompts 目錄: ${promptsDir}`);
    console.log('💡 提示: 使用 Ctrl+C 停止監視模式');
    
    let isCompiling = false;
    let compileTimeout = null;
    
    // 設置文件監視器
    const watcher = chokidar.watch(promptsDir, {
      ignored: /(^|[\/\\])\../, // 忽略隱藏檔案
      persistent: true,
      ignoreInitial: true, // 忽略初始事件
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });
    
    const triggerCompile = async (eventType, filePath) => {
      if (isCompiling) {
        console.log('⏳ 編譯中，跳過此次變更...');
        return;
      }
      
      // 清除之前的延時
      if (compileTimeout) {
        clearTimeout(compileTimeout);
      }
      
      // 延時 300ms 執行編譯，避免頻繁觸發
      compileTimeout = setTimeout(async () => {
        isCompiling = true;
        
        try {
          const fileName = path.basename(filePath);
          console.log(`\n🔔 檔案變更detected: ${fileName} (${eventType})`);
          console.log('🔄 重新編譯中...');
          
          const result = await this.compile({ ...options, incremental: true });
          
          const timestamp = new Date().toLocaleTimeString();
          console.log(`\n✅ [${timestamp}] 重新編譯完成!`);
          console.log(`編譯了 ${result.compiledPrompts} 個 prompts，使用工具: ${result.compiledUtilities.join(', ')}`);
          if (result.skippedPrompts > 0) {
            console.log(`跳過 ${result.skippedPrompts} 個未變更的 prompts`);
          }
          
        } catch (error) {
          const timestamp = new Date().toLocaleTimeString();
          console.error(`\n❌ [${timestamp}] 重新編譯失敗: ${error.message}`);
        } finally {
          isCompiling = false;
        }
      }, 300);
    };
    
    // 監聽檔案變更事件
    watcher
      .on('add', (filePath) => triggerCompile('added', filePath))
      .on('change', (filePath) => triggerCompile('changed', filePath))
      .on('unlink', (filePath) => triggerCompile('removed', filePath))
      .on('error', (error) => {
        console.error(`❌ 監視器錯誤: ${error.message}`);
      });
    
    // 處理程序退出
    const cleanup = () => {
      console.log('\n🛑 停止監視模式...');
      if (compileTimeout) {
        clearTimeout(compileTimeout);
      }
      watcher.close();
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    // 保持進程運行
    return new Promise(() => {});
  }
  
  /**
   * 取得編譯狀態資訊
   */
  async getCompilationStatus() {
    const compiledDir = this.getCompiledDir();
    const exists = await fs.pathExists(compiledDir);
    
    if (!exists) {
      return {
        hasCompiled: false,
        utilities: [],
        totalFiles: 0
      };
    }

    const utilities = await fs.readdir(compiledDir);
    let totalFiles = 0;

    for (const utility of utilities) {
      const utilityDir = path.join(compiledDir, utility);
      const stat = await fs.stat(utilityDir);
      if (stat.isDirectory()) {
        const files = await fs.readdir(utilityDir);
        totalFiles += files.length;
      }
    }

    return {
      hasCompiled: true,
      utilities,
      totalFiles,
      compiledDir
    };
  }
}

module.exports = CompilationManager;
