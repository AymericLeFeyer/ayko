const TIMEOUT_MS = 2000;

/** Reads a node_exporter page. A slow machine must not make the dashboard wait. */
export async function fetchHostMetrics(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Métriques ${response.status}`);
  return response.text();
}
