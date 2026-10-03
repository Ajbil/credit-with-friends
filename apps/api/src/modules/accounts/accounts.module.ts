import { Module } from '@nestjs/common';
import { AccountsController, GoogleController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { GoogleProvider } from './google.provider';
import { SessionsModule } from '../sessions/sessions.module';
import { PendingCleanupService } from './pending-cleanup.service';
import { ServiceBusModule } from '../../service-bus/service-bus.module';

@Module({ imports: [SessionsModule, ServiceBusModule], controllers: [AccountsController, GoogleController], providers: [AccountsService, GoogleProvider, PendingCleanupService], exports: [AccountsService, PendingCleanupService] })
export class AccountsModule {}
