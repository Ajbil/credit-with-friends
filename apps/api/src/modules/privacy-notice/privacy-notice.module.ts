import { Module } from '@nestjs/common';
import { PrivacyNoticeController } from './privacy-notice.controller';
import { PrivacyNoticeGuard } from './privacy-notice.guard';
import { PrivacyNoticeService } from './privacy-notice.service';

@Module({ controllers: [PrivacyNoticeController], providers: [PrivacyNoticeService, PrivacyNoticeGuard], exports: [PrivacyNoticeGuard] })
export class PrivacyNoticeModule {}
