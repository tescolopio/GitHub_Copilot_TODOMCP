import { createLogger } from '../../src/utils/logger';

describe('Logger', () => {
  test('should create a logger instance', () => {
    const logger = createLogger('test');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  test('should log messages without errors', () => {
    const logger = createLogger('test');
    
    // These should not throw errors
    expect(() => {
      logger.info('Test info message');
      logger.error('Test error message');
      logger.warn('Test warning message');
      logger.debug('Test debug message');
    }).not.toThrow();
  });
});
