import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { AdminEvent } from '@ayko/contracts';

const KEYS: Record<AdminEvent['topic'], string[][]> = {
  'mcp.changed': [['mcp'], ['metrics']],
  'ollama.changed': [['ollama'], ['metrics']],
  'devices.changed': [['rooms'], ['devices'], ['metrics']],
  'pairing.changed': [['pairing']],
  'cache.changed': [['cache']],
  'request.changed': [['metrics'], ['conversations'], ['history']],
  log: [['logs']],
};

const THROTTLE_MS = 800;
const RECONNECT_MS = 2000;

/** Live link to Core: events refresh the matching screens; a lost link shows a banner. */
export function useAdminSocket() {
  const client = useQueryClient();
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const pending = new Set<AdminEvent['topic']>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      for (const topic of pending) {
        for (const queryKey of KEYS[topic]) void client.invalidateQueries({ queryKey });
      }
      pending.clear();
    };

    const open = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/ws/admin`);
      socket.onopen = () => setConnected(true);
      socket.onmessage = (message) => {
        pending.add((JSON.parse(message.data as string) as AdminEvent).topic);
        flushTimer ??= setTimeout(flush, THROTTLE_MS);
      };
      socket.onclose = () => {
        if (stopped) return;
        setConnected(false);
        timer = setTimeout(open, RECONNECT_MS);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (flushTimer) clearTimeout(flushTimer);
      socket?.close();
    };
  }, [client]);

  return connected;
}
