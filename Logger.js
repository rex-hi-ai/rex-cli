const chalk = require('chalk');

/**
 * Logger - 處理不同等級的日誌輸出
 */
class Logger {
  constructor(level = 'info') {
    this.level = level;
    this.levels = {
      'debug': 0,
      'info': 1,
      'warn': 2,
      'error': 3,
      'silent': 4
    };
  }

  /**
   * 設定日誌等級
   */
  setLevel(level) {
    if (!this.levels.hasOwnProperty(level)) {
      throw new Error(`Invalid log level: ${level}. Valid levels: ${Object.keys(this.levels).join(', ')}`);
    }
    this.level = level;
  }

  /**
   * 取得目前日誌等級
   */
  getLevel() {
    return this.level;
  }

  /**
   * 檢查是否應該輸出特定等級的日誌
   */
  shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }

  /**
   * 格式化時間戳
   */
  getTimestamp() {
    return new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  }

  /**
   * 輸出 debug 等級日誌
   */
  debug(message, ...args) {
    if (this.shouldLog('debug')) {
      console.debug(chalk.gray(`[${this.getTimestamp()}] [DEBUG] ${message}`), ...args);
    }
  }

  /**
   * 輸出 info 等級日誌
   */
  info(message, ...args) {
    if (this.shouldLog('info')) {
      console.log(chalk.blue(`[${this.getTimestamp()}] [INFO] ${message}`), ...args);
    }
  }

  /**
   * 輸出 warn 等級日誌
   */
  warn(message, ...args) {
    if (this.shouldLog('warn')) {
      console.warn(chalk.yellow(`[${this.getTimestamp()}] [WARN] ${message}`), ...args);
    }
  }

  /**
   * 輸出 error 等級日誌
   */
  error(message, ...args) {
    if (this.shouldLog('error')) {
      console.error(chalk.red(`[${this.getTimestamp()}] [ERROR] ${message}`), ...args);
    }
  }

  /**
   * 輸出成功訊息（始終顯示，除非是 silent 模式）
   */
  success(message, ...args) {
    if (this.shouldLog('info')) {
      console.log(chalk.green(`✅ ${message}`), ...args);
    }
  }

  /**
   * 輸出錯誤訊息（始終顯示，除非是 silent 模式）
   */
  fail(message, ...args) {
    if (this.shouldLog('error')) {
      console.error(chalk.red(`❌ ${message}`), ...args);
    }
  }

  /**
   * 輸出進度訊息（始終顯示，除非是 silent 模式）
   */
  progress(message, ...args) {
    if (this.shouldLog('info')) {
      console.log(chalk.cyan(`🔄 ${message}`), ...args);
    }
  }
}

// 建立全域 logger 實例
const logger = new Logger();

module.exports = { Logger, logger };
