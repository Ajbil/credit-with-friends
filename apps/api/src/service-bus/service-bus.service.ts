import { Injectable } from '@nestjs/common';

export type CircleCreator = { id: string; googleAccountId: string } | null;
export type MemberDisplayName = { id: string; displayName: string };
export type BusEvent = { id: string; version: number; timestampUtc: Date; initiatedByAccountId: string; data: Record<string, unknown> };
type Requests = {
  'accounts.circleCreator': { input: string; output: CircleCreator };
  'accounts.displayNames': { input: string[]; output: MemberDisplayName[] };
};

@Injectable()
export class ServiceBus {
  private readonly requestHandlers = new Map<string, (input: unknown) => Promise<unknown>>();
  private readonly eventHandlers = new Map<string, Array<(event: BusEvent) => Promise<void>>>();

  registerRequest<K extends keyof Requests>(name: K, handler: (input: Requests[K]['input']) => Promise<Requests[K]['output']>): void {
    this.requestHandlers.set(name, (input) => handler(input as Requests[K]['input']));
  }

  request<K extends keyof Requests>(name: K, input: Requests[K]['input']): Promise<Requests[K]['output']>;
  request(name: string, input: unknown): Promise<unknown>;
  async request(name: string, input: unknown): Promise<unknown> {
    const handler = this.requestHandlers.get(name);
    if (!handler) throw new Error(`No service-bus request handler registered for ${name}`);
    return handler(input);
  }

  registerEvent(name: string, handler: (event: BusEvent) => Promise<void>): void {
    this.eventHandlers.set(name, [...(this.eventHandlers.get(name) ?? []), handler]);
  }

  async publish(name: string, event: BusEvent): Promise<void> {
    await Promise.all((this.eventHandlers.get(name) ?? []).map((handler) => handler(event)));
  }
}
