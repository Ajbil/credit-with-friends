import { Module } from '@nestjs/common';
import { ServiceBusModule } from '../../service-bus/service-bus.module';
import { MemberCardsController } from './member-cards.controller';
import { SearchesController } from './searches.controller';

@Module({ imports: [ServiceBusModule], controllers: [MemberCardsController, SearchesController] })
export class SearchModule {}
