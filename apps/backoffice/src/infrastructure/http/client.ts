import type { ApiError } from '@ayko/contracts';

const BASE = '/api/v1';

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const toFailure = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return new ApiFailure(
    response.status,
    body?.code ?? 'unknown',
    body?.message ?? `Erreur ${response.status}`,
    body?.details,
  );
};

export async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiFailure(0, 'network', 'Ayko Core ne répond pas. Vérifiez que le service tourne.');
  });
  if (!response.ok) throw await toFailure(response);
  return (await response.json()) as T;
}

export const get = <T>(path: string) => http<T>('GET', path);

export const withQuery = (path: string, params: object) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== null) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `${path}?${text}` : path;
};

/** POST that answers with server-sent events (tokens, pull progress). */
export async function* streamEvents<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) throw await toFailure(response);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (line.startsWith('data: ')) yield JSON.parse(line.slice(6)) as T;
      boundary = buffer.indexOf('\n\n');
    }
  }
}
