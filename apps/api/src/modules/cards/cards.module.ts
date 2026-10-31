import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { BanksController } from './banks.controller';
import { MyCardsController } from './my-cards.controller';
import { ServiceBusModule } from '../../service-bus/service-bus.module';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { memberCards } from './member-cards.service';
import { findHolders } from './find-holders.service';
import { cardHolder, lockCard } from './lock-card.service';

@Module({ imports: [ServiceBusModule], controllers: [BanksController, MyCardsController] })
export class CardsModule implements OnModuleInit {
  constructor(@Inject(ServiceBus) private readonly bus: ServiceBus) {}

  onModuleInit(): void {
    this.bus.registerRequest('cards.memberCards', ({ memberId, tx }) => memberCards(memberId, tx));
    this.bus.registerRequest('cards.findHolders', ({ memberIds, bankId, type, variant, tx }) => findHolders(memberIds, bankId, type, variant, tx));
    this.bus.registerRequest('cards.cardHolder', ({ cardId, tx }) => cardHolder(cardId, tx));
    this.bus.registerRequest('cards.lockCard', ({ cardId, tx }) => lockCard(cardId, tx));
  }
}
