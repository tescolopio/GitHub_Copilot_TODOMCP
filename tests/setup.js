"use strict";
// Jest setup file for MCP Autonomous Development System
// Global test configuration
global.console = {
    ...console,
    // Suppress console.log in tests unless NODE_ENV is test-verbose
    log: process.env.NODE_ENV === 'test-verbose' ? console.log : jest.fn(),
    debug: process.env.NODE_ENV === 'test-verbose' ? console.debug : jest.fn(),
    info: process.env.NODE_ENV === 'test-verbose' ? console.info : jest.fn(),
    warn: console.warn,
    error: console.error,
};
// Mock file system operations for consistent testing
jest.mock('fs-extra');
// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Minimize logging in tests
//# sourceMappingURL=setup.js.map