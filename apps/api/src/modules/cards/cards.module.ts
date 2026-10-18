import { Module } from '@nestjs/common';
import { BanksController } from './banks.controller';
import { MyCardsController } from './my-cards.controller';
import { ServiceBusModule } from '../../service-bus/service-bus.module';

@Module({ imports: [ServiceBusModule], controllers: [BanksController, MyCardsController] })
export class CardsModule {}
