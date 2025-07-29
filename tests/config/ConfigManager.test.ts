import { ConfigManager } from '../../src/config/ConfigManager';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  
  beforeEach(() => {
    configManager = new ConfigManager('test-config.json');
  });

  afterEach(async () => {
    // Clean up test config file
    const fs = await import('fs-extra');
    if (await fs.pathExists('test-config.json')) {
      await fs.remove('test-config.json');
    }
  });

  test('should load default configuration', async () => {
    await configManager.load();
    const config = configManager.get();
    
    expect(config.server.name).toBe('mcp-autonomous-dev');
    expect(config.server.maxActionsPerSession).toBe(5);
    expect(config.patterns.confidenceThreshold).toBe(0.8);
  });

  test('should save and load configuration', async () => {
    await configManager.load();
    
    configManager.update({
      server: {
        name: 'test-server',
        version: '1.0.0',
        maxActionsPerSession: 10,
        sessionTimeoutMinutes: 120,
      }
    });
    
    await configManager.save();
    
    // Create new instance and load
    const newConfigManager = new ConfigManager('test-config.json');
    await newConfigManager.load();
    const config = newConfigManager.get();
    
    expect(config.server.name).toBe('test-server');
    expect(config.server.maxActionsPerSession).toBe(10);
  });
});
