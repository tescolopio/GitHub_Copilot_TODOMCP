"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AutoContinueService_1 = require("../src/services/AutoContinueService");
const FileSystemTools_1 = require("../src/tools/FileSystemTools");
const GitTools_1 = require("../src/tools/GitTools");
const ValidationTools_1 = require("../src/tools/ValidationTools");
describe('AutoContinueService', () => {
    it('should be defined', () => {
        const fileSystemTools = new FileSystemTools_1.FileSystemTools();
        const gitTools = new GitTools_1.GitTools(process.cwd());
        const validationTools = new ValidationTools_1.ValidationTools();
        const autoContinueService = new AutoContinueService_1.AutoContinueService(fileSystemTools, gitTools, validationTools, process.cwd());
        expect(autoContinueService).toBeDefined();
    });
});
//# sourceMappingURL=AutoContinueService.test.js.map