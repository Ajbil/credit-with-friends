import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts.module';
import { SessionsModule } from '../sessions/sessions.module';
import { TestAuthController } from './test-auth.controller';

@Module({ imports: [AccountsModule, SessionsModule], controllers: [TestAuthController] })
export class TestAuthModule {}
