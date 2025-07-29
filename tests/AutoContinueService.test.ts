import { AutoContinueService } from '../src/services/AutoContinueService';
import { FileSystemTools } from '../src/tools/FileSystemTools';
import { GitTools } from '../src/tools/GitTools';
import { ValidationTools } from '../src/tools/ValidationTools';

describe('AutoContinueService', () => {
  it('should be defined', () => {
    const fileSystemTools = new FileSystemTools();
    const gitTools = new GitTools(process.cwd());
    const validationTools = new ValidationTools();
    const autoContinueService = new AutoContinueService(
      fileSystemTools,
      gitTools,
      validationTools,
      process.cwd()
    );
    expect(autoContinueService).toBeDefined();
  });
});
