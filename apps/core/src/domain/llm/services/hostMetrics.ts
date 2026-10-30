import type { HostMetrics } from '@ayko/contracts';

const NODE_EXPORTER_PORT = 9100;
/** A CPU model legitimately pins the CPU, so only memory marks a machine as struggling. */
const MEMORY_SATURATED_PERCENT = 90;

export interface HostSample {
  cpuBusySeconds: number;
  cpuTotalSeconds: number;
  cpuCount: number;
  memoryTotalBytes: number;
  memoryAvailableBytes: number;
  load1: number | null;
}

/** The exporter sits next to Ollama unless the admin configured another address. */
export function defaultMetricsUrl(ollamaUrl: string) {
  const { protocol, hostname } = new URL(ollamaUrl);
  return `${protocol}//${hostname}:${NODE_EXPORTER_PORT}/metrics`;
}

const gauge = (text: string, name: string) => {
  const match = new RegExp(`^${name}\\s+(\\S+)`, 'm').exec(text);
  return match ? Number(match[1]) : null;
};

/** Reads the few node_exporter series needed from its Prometheus text format. */
export function parseNodeMetrics(text: string): HostSample | null {
  const memoryTotalBytes = gauge(text, 'node_memory_MemTotal_bytes');
  const memoryAvailableBytes = gauge(text, 'node_memory_MemAvailable_bytes');
  if (!memoryTotalBytes || memoryAvailableBytes === null) return null;

  let cpuBusySeconds = 0;
  let cpuTotalSeconds = 0;
  const cpus = new Set<string>();
  for (const [, labels = '', value] of text.matchAll(
    /^node_cpu_seconds_total\{([^}]*)\}\s+(\S+)/gm,
  )) {
    const cpu = /cpu="([^"]+)"/.exec(labels)?.[1];
    const mode = /mode="([^"]+)"/.exec(labels)?.[1];
    if (cpu) cpus.add(cpu);
    cpuTotalSeconds += Number(value);
    if (mode !== 'idle' && mode !== 'iowait') cpuBusySeconds += Number(value);
  }

  return {
    cpuBusySeconds,
    cpuTotalSeconds,
    cpuCount: cpus.size,
    memoryTotalBytes,
    memoryAvailableBytes,
    load1: gauge(text, 'node_load1'),
  };
}

/** CPU counters only grow, so its percentage needs the previous sample. */
export function computeHostMetrics(
  sample: HostSample,
  previous: HostSample | null,
  sampledAt: string,
): HostMetrics {
  const total = previous ? sample.cpuTotalSeconds - previous.cpuTotalSeconds : 0;
  const busy = previous ? sample.cpuBusySeconds - previous.cpuBusySeconds : 0;
  const memoryUsedBytes = sample.memoryTotalBytes - sample.memoryAvailableBytes;
  return {
    cpuPercent: total > 0 ? Math.min(100, Math.max(0, (busy / total) * 100)) : null,
    memoryPercent: (memoryUsedBytes / sample.memoryTotalBytes) * 100,
    memoryUsedBytes,
    memoryTotalBytes: sample.memoryTotalBytes,
    load1: sample.load1,
    cpuCount: sample.cpuCount,
    sampledAt,
  };
}

export const isSaturated = (metrics: HostMetrics) =>
  metrics.memoryPercent >= MEMORY_SATURATED_PERCENT;
