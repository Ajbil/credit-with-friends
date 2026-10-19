import { Module } from '@nestjs/common';
import { ServiceBusModule } from '../../service-bus/service-bus.module';
import { MemberCardsController } from './member-cards.controller';

@Module({ imports: [ServiceBusModule], controllers: [MemberCardsController] })
export class SearchModule {}
