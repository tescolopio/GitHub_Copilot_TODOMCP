import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { Action, SessionMetrics } from '../models/Action';

const logger = createLogger('SessionStorage');

export enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
}

export interface SessionConfig {
  maxActions: number;
  timeoutMinutes: number;
  autoApproveThreshold: number;
  enableBackups: boolean;
  patterns: {
    enabled: string[];
    disabled: string[];
  };
}

export interface Session {
  id: string;
  startTime: Date;
  endTime?: Date;
  status: SessionStatus;
  workspacePath: string;
  actions: Action[];
  config: SessionConfig;
  metrics: SessionMetrics;
}

export class SessionStorage {
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    fs.ensureDirSync(this.storagePath);
  }

  async createSession(
    workspacePath: string,
    config: Partial<SessionConfig> = {}
  ): Promise<Session> {
    const defaultConfig: SessionConfig = {
      maxActions: 10,
      timeoutMinutes: 60,
      autoApproveThreshold: 0.8,
      enableBackups: true,
      patterns: {
        enabled: [],
        disabled: [],
      },
    };

    const session: Session = {
      id: uuidv4(),
      startTime: new Date(),
      status: SessionStatus.ACTIVE,
      workspacePath,
      actions: [],
      config: { ...defaultConfig, ...config },
      metrics: {
        totalActions: 0,
        completedActions: 0,
        failedActions: 0,
        skippedActions: 0,
        averageConfidence: 0,
        totalTimeSaved: 0,
        riskDistribution: {
          low: 0,
          medium: 0,
          high: 0,
        },
      },
    };

    await this.saveSession(session);
    logger.info(`Session created: ${session.id}`);
    return session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const filePath = path.join(this.storagePath, `${sessionId}.json`);
    if (await fs.pathExists(filePath)) {
      return fs.readJson(filePath);
    }
    return null;
  }

  async updateSession(session: Session): Promise<void> {
    await this.saveSession(session);
  }

  async completeSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.status = SessionStatus.COMPLETED;
      session.endTime = new Date();
      await this.saveSession(session);
      logger.info(`Session completed: ${sessionId}`);
    }
  }

  async addAction(sessionId: string, action: Action): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.actions.push(action);
      await this.updateSession(session);
    }
  }

  private async saveSession(session: Session): Promise<void> {
    const filePath = path.join(this.storagePath, `${session.id}.json`);
    await fs.writeJson(filePath, session, { spaces: 2 });
  }
}
