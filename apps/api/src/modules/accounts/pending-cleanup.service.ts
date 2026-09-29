import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/database/prisma.service';

const IDLE_DAYS = 30;

@Injectable()
export class PendingCleanupService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(PinoLogger) private readonly logger: PinoLogger) {}

  @Cron('0 0 3 * * *', { timeZone: 'Asia/Kolkata' })
  async run(): Promise<void> {
    try {
      this.logger.info('Sign-in cleanup started');
      const cutoff = new Date(Date.now() - IDLE_DAYS * 86_400_000);
      const pending = await this.db.pendingSignIn.deleteMany({ where: { lastActivityAtUtc: { lt: cutoff } } });
      const sessions = await this.db.session.deleteMany({ where: { expiresAtUtc: { lt: new Date() } } });
      this.logger.info({ context: { pendingCount: pending.count, sessionCount: sessions.count } }, 'Sign-in cleanup completed');
    } catch (error) {
      this.logger.error({ context: { reason: error instanceof Error ? error.name : 'unknown' } }, 'Sign-in cleanup failed');
      throw error;
    }
  }
}
