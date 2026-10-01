/** Wire format for every server → client message (docs/LLD/websocket-contracts.md §3). */
export interface RealtimeEnvelope<T = unknown> {
  event: string;
  eventId: string;
  timestamp: string;
  data: T;
}

/** Transport-agnostic publisher. Delivery is best effort; the database stays authoritative. */
export interface RealtimePublisherPort {
  publishToUser(userId: string, event: string, data: unknown): void;
  isConnected(userId: string): boolean;
}

export class NoopRealtimePublisher implements RealtimePublisherPort {
  publishToUser(): void {}
  isConnected(): boolean {
    return false;
  }
}
