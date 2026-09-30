import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Client, generators, Issuer } from 'openid-client';
import { ApiConfig } from '../../common/config/config.module';
import { GoogleIdentity, safeReturnPath } from './accounts.service';

type SignInState = { state: string; nonce: string; verifier: string; returnPath: string; expiresAt: number };

@Injectable()
export class GoogleProvider {
  private clientPromise?: Promise<Client>;
  constructor(@Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>) {}

  private client(): Promise<Client> {
    const clientId = this.config.get('googleClientId');
    const clientSecret = this.config.get('googleClientSecret');
    if (!clientId || !clientSecret) throw new ServiceUnavailableException();
    this.clientPromise ??= Issuer.discover('https://accounts.google.com')
      .then((issuer) => new issuer.Client({ client_id: clientId, client_secret: clientSecret, redirect_uris: [`${this.config.getOrThrow('apiOrigin')}/api/v1/auth/google/callback`], response_types: ['code'] }))
      .catch((error: unknown) => { this.clientPromise = undefined; throw error; });
    return this.clientPromise;
  }

  private signature(value: string): string {
    return createHmac('sha256', this.config.getOrThrow('sessionSecret')).update(value).digest('base64url');
  }

  async start(returnPath?: string): Promise<{ url: string; cookie: string }> {
    const client = await this.client();
    const state: SignInState = { state: generators.state(), nonce: generators.nonce(), verifier: generators.codeVerifier(), returnPath: safeReturnPath(returnPath), expiresAt: Date.now() + 600_000 };
    const encoded = Buffer.from(JSON.stringify(state)).toString('base64url');
    const url = client.authorizationUrl({ scope: 'openid email profile', response_type: 'code', state: state.state, nonce: state.nonce, code_challenge: generators.codeChallenge(state.verifier), code_challenge_method: 'S256' });
    return { url, cookie: `${encoded}.${this.signature(encoded)}` };
  }

  async callback(query: Record<string, string>, cookie?: string): Promise<{ identity: GoogleIdentity; returnPath: string }> {
    if (!cookie) throw new UnauthorizedException();
    const [encoded, signature] = cookie.split('.');
    if (!encoded || !signature || signature.length !== this.signature(encoded).length || !timingSafeEqual(Buffer.from(this.signature(encoded)), Buffer.from(signature))) throw new UnauthorizedException();
    let state: SignInState;
    try { state = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SignInState; }
    catch { throw new UnauthorizedException(); }
    if (state.expiresAt < Date.now() || query.state !== state.state) throw new UnauthorizedException();
    try {
      const client = await this.client();
      const tokens = await client.callback(`${this.config.getOrThrow('apiOrigin')}/api/v1/auth/google/callback`, query, { state: state.state, nonce: state.nonce, code_verifier: state.verifier });
      const claims = tokens.claims();
      if (!claims?.sub || !tokens.access_token) throw new UnauthorizedException();
      const user = await client.userinfo(tokens.access_token);
      if (user.sub !== claims.sub || typeof user.email !== 'string' || user.email_verified !== true) throw new UnauthorizedException();
      return { identity: { googleAccountId: claims.sub, email: user.email, name: typeof user.name === 'string' ? user.name : '', emailVerified: true }, returnPath: state.returnPath };
    } catch { throw new UnauthorizedException(); }
  }
}
