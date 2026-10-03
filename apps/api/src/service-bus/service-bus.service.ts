import { Injectable } from '@nestjs/common';

export type CircleCreator = { id: string; googleAccountId: string } | null;
export type BusEvent = { id: string; version: number; timestampUtc: Date; initiatedByAccountId: string; data: Record<string, unknown> };

@Injectable()
export class ServiceBus {
  private readonly requestHandlers = new Map<string, (memberId: string) => Promise<CircleCreator>>();
  private readonly eventHandlers = new Map<string, Array<(event: BusEvent) => Promise<void>>>();

  registerRequest(name: 'accounts.circleCreator', handler: (memberId: string) => Promise<CircleCreator>): void {
    this.requestHandlers.set(name, handler);
  }

  async request(name: string, memberId: string): Promise<CircleCreator> {
    const handler = this.requestHandlers.get(name);
    if (!handler) throw new Error(`No service-bus request handler registered for ${name}`);
    return handler(memberId);
  }

  registerEvent(name: string, handler: (event: BusEvent) => Promise<void>): void {
    this.eventHandlers.set(name, [...(this.eventHandlers.get(name) ?? []), handler]);
  }

  async publish(name: string, event: BusEvent): Promise<void> {
    await Promise.all((this.eventHandlers.get(name) ?? []).map((handler) => handler(event)));
  }
}
