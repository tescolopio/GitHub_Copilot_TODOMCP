"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const ConfigManager_1 = require("../../src/config/ConfigManager");
describe('ConfigManager', () => {
    let configManager;
    beforeEach(() => {
        configManager = new ConfigManager_1.ConfigManager('test-config.json');
    });
    afterEach(async () => {
        // Clean up test config file
        const fs = await Promise.resolve().then(() => __importStar(require('fs-extra')));
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
        const newConfigManager = new ConfigManager_1.ConfigManager('test-config.json');
        await newConfigManager.load();
        const config = newConfigManager.get();
        expect(config.server.name).toBe('test-server');
        expect(config.server.maxActionsPerSession).toBe(10);
    });
});
//# sourceMappingURL=ConfigManager.test.js.map