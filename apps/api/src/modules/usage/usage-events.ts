import type { BusEvent } from '../../service-bus/service-bus.service';

export const USAGE_EVENT_NAMES = {
  search: 'CardSearchedEvent',
  whatsappTap: 'CardHolderContactedEvent',
} as const;

export type CardSearchedEvent = Omit<BusEvent, 'data'> & {
  data: { circleIds: string[]; bankId: string; cardType: 'credit' | 'debit' | 'either'; peopleFound: number };
};

export type CardHolderContactedEvent = Omit<BusEvent, 'data'> & {
  data: { holderMemberId: string; circleIds: string[] };
};
