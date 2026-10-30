import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Metrics, OllamaEndpoint } from '@ayko/contracts';
import {
  computeHostMetrics,
  defaultMetricsUrl,
  isSaturated,
  parseNodeMetrics,
} from '../src/domain/llm/services/hostMetrics.js';
import { startHarness, type Harness } from './harness.js';

const page = (idle: number, user: number, available = 4e9) => `
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} ${idle}
node_cpu_seconds_total{cpu="0",mode="iowait"} 0
node_cpu_seconds_total{cpu="0",mode="user"} ${user}
node_cpu_seconds_total{cpu="1",mode="idle"} ${idle}
node_cpu_seconds_total{cpu="1",mode="user"} ${user}
node_load1 1.5
node_memory_MemAvailable_bytes ${available}
node_memory_MemTotal_bytes 1.6e+10
`;

describe('host metrics', () => {
  it('derives the exporter address from the Ollama one', () => {
    expect(defaultMetricsUrl('http://192.168.1.20:11434')).toBe('http://192.168.1.20:9100/metrics');
  });

  it('computes memory, and CPU between two samples', () => {
    const first = parseNodeMetrics(page(100, 100))!;
    const second = parseNodeMetrics(page(110, 130))!;
    expect(computeHostMetrics(first, null, 'now').cpuPercent).toBeNull();
    const metrics = computeHostMetrics(second, first, 'now');
    expect(metrics.cpuPercent).toBeCloseTo(75);
    expect(metrics.memoryPercent).toBeCloseTo(75);
    expect(metrics).toMatchObject({ cpuCount: 2, load1: 1.5, memoryTotalBytes: 1.6e10 });
  });

  it('does not treat a busy CPU as saturation, only full memory', () => {
    const sample = (available: number) =>
      computeHostMetrics(parseNodeMetrics(page(0, 0, available))!, null, 'now');
    expect(isSaturated(sample(4e9))).toBe(false);
    expect(isSaturated(sample(1e9))).toBe(true);
  });

  it('refuses a page that is not node_exporter', () => {
    expect(parseNodeMetrics('<html>nope</html>')).toBeNull();
  });
});

describe('host metrics in the API', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());

  it('exposes the load of the machine on endpoints and on the dashboard', async () => {
    await h.container.ollama.pollHostMetrics();
    await h.container.ollama.pollHostMetrics();
    const [endpoint] = await h.api<OllamaEndpoint[]>('GET', '/ollama/endpoints');
    expect(endpoint?.host?.cpuPercent).toBeGreaterThanOrEqual(0);
    const metrics = await h.api<Metrics>('GET', '/metrics');
    const component = metrics.components.find((item) => item.kind === 'ollama');
    expect(component?.host?.memoryPercent).toBeGreaterThan(0);
  });

  it('stays usable when the exporter is unreachable', async () => {
    const [endpoint] = await h.api<OllamaEndpoint[]>('GET', '/ollama/endpoints');
    await h.api('PATCH', `/ollama/endpoints/${endpoint?.id}`, {
      metricsUrl: 'http://127.0.0.1:9/metrics',
    });
    await h.container.ollama.pollHostMetrics();
    const [updated] = await h.api<OllamaEndpoint[]>('GET', '/ollama/endpoints');
    expect(updated?.host).toBeNull();
    expect(updated?.lastStatus).toBe('up');
  });
});
