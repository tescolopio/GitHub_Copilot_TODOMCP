import { AutoContinueService } from '../services/AutoContinueService';
import { Tool } from '@modelcontextprotocol/sdk/types';

export const getAutoContinueTools = (autoContinueService: AutoContinueService): Tool[] => {
  return [
    {
      name: 'startAutoContinue',
      description: 'Starts the auto-continue service to process TODOs autonomously.',
      inputSchema: {
        type: 'object',
        properties: {
          workspacePath: {
            type: 'string',
            description: 'The path to the workspace.',
          },
        },
        required: ['workspacePath'],
      },
    },
    {
      name: 'stopAutoContinue',
      description: 'Stops the auto-continue service.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'The ID of the session to stop.',
          },
        },
        required: ['sessionId'],
      },
    },
  ];
};

export const handleAutoContinueTools = async (
  name: string,
  args: any,
  service: AutoContinueService
) => {
  switch (name) {
    case 'startAutoContinue':
      return await service.startSession(args.workspacePath);
    case 'stopAutoContinue':
      return await service.stopSession(args.sessionId);
    default:
      return null;
  }
};
