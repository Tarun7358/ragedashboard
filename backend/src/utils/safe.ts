/**
 * safe(): await a promise without letting it throw, but never hide the failure.
 * Replaces blanket `.catch(() => null)` so permission/API failures show up in logs.
 */
export async function safe<T>(label: string, p: Promise<T> | T, fallback: T | null = null): Promise<T | null> {
  try {
    return await p;
  } catch (err: any) {
    const code = err?.code ? ` code=${err.code}` : '';
    console.warn(`[safe] ${label} failed:${code} ${err?.message || err}`);
    return fallback;
  }
}

