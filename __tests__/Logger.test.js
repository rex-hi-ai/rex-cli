const { Logger, logger } = require('../src/Logger');

describe('Logger', () => {
  let mockConsoleLog;
  let mockConsoleWarn;
  let mockConsoleError;
  let mockConsoleDebug;
  let testLogger;

  beforeEach(() => {
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    mockConsoleDebug = jest.spyOn(console, 'debug').mockImplementation();
    testLogger = new Logger('info');
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleDebug.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with default info level', () => {
      const defaultLogger = new Logger();
      expect(defaultLogger.getLevel()).toBe('info');
    });

    it('should initialize with specified level', () => {
      const debugLogger = new Logger('debug');
      expect(debugLogger.getLevel()).toBe('debug');
    });
  });

  describe('setLevel', () => {
    it('should set valid log level', () => {
      testLogger.setLevel('debug');
      expect(testLogger.getLevel()).toBe('debug');
    });

    it('should throw error for invalid log level', () => {
      expect(() => testLogger.setLevel('invalid')).toThrow('Invalid log level');
    });
  });

  describe('shouldLog', () => {
    it('should return true for levels >= current level', () => {
      testLogger.setLevel('warn');
      
      expect(testLogger.shouldLog('debug')).toBe(false);
      expect(testLogger.shouldLog('info')).toBe(false);
      expect(testLogger.shouldLog('warn')).toBe(true);
      expect(testLogger.shouldLog('error')).toBe(true);
    });

    it('should handle silent level correctly', () => {
      testLogger.setLevel('silent');
      
      expect(testLogger.shouldLog('debug')).toBe(false);
      expect(testLogger.shouldLog('info')).toBe(false);
      expect(testLogger.shouldLog('warn')).toBe(false);
      expect(testLogger.shouldLog('error')).toBe(false);
    });
  });

  describe('logging methods', () => {
    it('should log debug messages when level is debug', () => {
      testLogger.setLevel('debug');
      testLogger.debug('test debug message');
      
      expect(mockConsoleDebug).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] test debug message')
      );
    });

    it('should not log debug messages when level is info', () => {
      testLogger.setLevel('info');
      testLogger.debug('test debug message');
      
      expect(mockConsoleDebug).not.toHaveBeenCalled();
    });

    it('should log info messages when level is info', () => {
      testLogger.setLevel('info');
      testLogger.info('test info message');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] test info message')
      );
    });

    it('should log warn messages when level is warn', () => {
      testLogger.setLevel('warn');
      testLogger.warn('test warn message');
      
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] test warn message')
      );
    });

    it('should log error messages when level is error', () => {
      testLogger.setLevel('error');
      testLogger.error('test error message');
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] test error message')
      );
    });

    it('should not log anything when level is silent', () => {
      testLogger.setLevel('silent');
      
      testLogger.debug('test');
      testLogger.info('test');
      testLogger.warn('test');
      testLogger.error('test');
      
      expect(mockConsoleDebug).not.toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });

  describe('convenience methods', () => {
    it('should log success messages when level allows info', () => {
      testLogger.setLevel('info');
      testLogger.success('test success');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✅ test success')
      );
    });

    it('should log fail messages when level allows error', () => {
      testLogger.setLevel('error');
      testLogger.fail('test fail');
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ test fail')
      );
    });

    it('should log progress messages when level allows info', () => {
      testLogger.setLevel('info');
      testLogger.progress('test progress');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🔄 test progress')
      );
    });
  });

  describe('global logger instance', () => {
    it('should export a global logger instance', () => {
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.getLevel()).toBe('info');
    });
  });
});
