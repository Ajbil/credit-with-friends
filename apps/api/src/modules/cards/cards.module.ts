import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { BanksController } from './banks.controller';
import { MyCardsController } from './my-cards.controller';
import { ServiceBusModule } from '../../service-bus/service-bus.module';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { memberCards } from './member-cards.service';

@Module({ imports: [ServiceBusModule], controllers: [BanksController, MyCardsController] })
export class CardsModule implements OnModuleInit {
  constructor(@Inject(ServiceBus) private readonly bus: ServiceBus) {}

  onModuleInit(): void {
    this.bus.registerRequest('cards.memberCards', ({ memberId, tx }) => memberCards(memberId, tx));
  }
}
