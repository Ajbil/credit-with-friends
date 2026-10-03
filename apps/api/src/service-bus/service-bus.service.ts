import { Injectable } from '@nestjs/common';

export type CircleCreator = { id: string; isOwner: boolean } | null;

@Injectable()
export class ServiceBus {
  private circleCreatorHandler?: (memberId: string) => Promise<CircleCreator>;

  registerCircleCreator(handler: (memberId: string) => Promise<CircleCreator>): void {
    this.circleCreatorHandler = handler;
  }

  circleCreator(memberId: string): Promise<CircleCreator> {
    if (!this.circleCreatorHandler) throw new Error('Circle creator handler is not registered');
    return this.circleCreatorHandler(memberId);
  }
}
