import type { AdminEvent } from '@ayko/contracts';

type Listener = (event: AdminEvent) => void;

/** Fans component changes out to every connected backoffice. */
export class EventBus {
  private readonly listeners = new Set<Listener>();

  publish(event: AdminEvent) {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
