import { Global, Module } from '@nestjs/common';
import { ServiceBus } from './service-bus.service';

@Global()
@Module({ providers: [ServiceBus], exports: [ServiceBus] })
export class ServiceBusModule {}
