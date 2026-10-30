/** FIFO semaphore: with a single CPU model, requests wait their turn instead of competing. */
export class Semaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(public limit: number) {}

  get waiting(): number {
    return this.waiters.length;
  }

  get busy(): boolean {
    return this.active >= this.limit;
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve, reject) => {
        const waiter = () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        const onAbort = () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        this.waiters.push(waiter);
      });
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.waiters.shift()?.();
    };
  }
}

export function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parent?: AbortSignal,
  label = 'operation',
): Promise<T> {
  const signal = parent
    ? AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(
        parent?.aborted
          ? new DOMException('Aborted', 'AbortError')
          : new Error(`${label} timed out after ${timeoutMs} ms`),
      );
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    work(signal)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
