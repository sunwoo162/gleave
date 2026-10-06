export type UserRuntimeDispatchGate = <T>(userId: string, task: () => Promise<T>) => Promise<T>;

/**
 * Keep one local Runtime dispatch active per authenticated user while leaving
 * different users independent. The gate is intentionally process-local; the
 * operational Runtime remains responsible for any cross-process scheduling.
 */
export function createUserRuntimeDispatchGate(): UserRuntimeDispatchGate {
  const tails = new Map<string, Promise<void>>();
  return async function dispatchForUser<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const previous = tails.get(userId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    tails.set(userId, queued);
    await previous;
    try {
      return await task();
    } finally {
      release?.();
      if (tails.get(userId) === queued) tails.delete(userId);
    }
  };
}
