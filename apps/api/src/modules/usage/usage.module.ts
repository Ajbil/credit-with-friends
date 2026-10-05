import { Module } from '@nestjs/common';
import { ServiceBusModule } from '../../service-bus/service-bus.module';
import { UsageEventRecorder } from './usage-event-recorder.service';

@Module({ imports: [ServiceBusModule], providers: [UsageEventRecorder] })
export class UsageModule {}
