import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';

const IDLE_DAYS = 30;
const COOKIE_NAME = 'cwf_session';
const MAX_AGE_SECONDS = IDLE_DAYS * 24 * 60 * 60;

export type Caller = { sessionId: string; memberId: string | null; pendingSignInId: string | null };

@Injectable()
export class SessionsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  cookie(token: string, secure: boolean): string {
    return `${COOKIE_NAME}=${token}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/api/v1; Max-Age=${MAX_AGE_SECONDS}`;
  }

  clearCookie(secure: boolean): string {
    return `${COOKIE_NAME}=; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/api/v1; Max-Age=0`;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async create(identity: { memberId?: string; pendingSignInId?: string }, userAgent?: string, returnPath = '/'): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.session.create({ data: {
      tokenHash: this.hash(token), memberId: identity.memberId, pendingSignInId: identity.pendingSignInId,
      expiresAtUtc: new Date(Date.now() + MAX_AGE_SECONDS * 1000),
      userAgentLabel: userAgent?.slice(0, 100),
      returnPath,
    } });
    return token;
  }

  async resolve(cookieHeader?: string): Promise<{ caller: Caller; token: string }> {
    const token = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
    if (!token) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({ where: { tokenHash: this.hash(token) } });
    if (!session || session.expiresAtUtc <= new Date()) throw new UnauthorizedException();
    const now = new Date();
    await this.db.session.update({ where: { id: session.id }, data: { lastSeenAtUtc: now, expiresAtUtc: new Date(now.getTime() + MAX_AGE_SECONDS * 1000) } });
    if (session.pendingSignInId) {
      const refreshed = await this.db.pendingSignIn.updateMany({ where: { id: session.pendingSignInId }, data: { lastActivityAtUtc: now } });
      if (!refreshed.count) {
        const current = await this.db.session.findUnique({ where: { id: session.id } });
        if (!current) throw new UnauthorizedException();
        return { caller: { sessionId: current.id, memberId: current.memberId, pendingSignInId: current.pendingSignInId }, token };
      }
    }
    return { caller: { sessionId: session.id, memberId: session.memberId, pendingSignInId: session.pendingSignInId }, token };
  }

  async signOut(sessionId: string): Promise<void> {
    await this.db.session.delete({ where: { id: sessionId } });
  }
}
