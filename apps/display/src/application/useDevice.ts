import { useCallback, useEffect, useState } from 'react';
import type { PairingCreated, Room, RoomConfig } from '@ayko/contracts';
import { coreApi, DeviceRejected } from '@/infrastructure/coreApi';
import { deviceStore } from '@/infrastructure/deviceStore';

const POLL_MS = 2000;
const RETRY_MS = 5000;

export type DeviceState =
  | { status: 'loading' }
  | { status: 'pairing'; pairing: PairingCreated | null; error: string | null }
  | { status: 'unreachable'; message: string }
  | { status: 'ready'; token: string; room: Room | null };

/** Pairing and configuration: everything that happens before the conversation. */
export function useDevice() {
  const [token, setToken] = useState(deviceStore.read);
  const [state, setState] = useState<DeviceState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const forget = useCallback(() => {
    deviceStore.clear();
    setToken(null);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    coreApi
      .config(token)
      .then(({ room }) => {
        if (!cancelled) setState({ status: 'ready', token, room });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        if (error instanceof DeviceRejected) return forget();
        setState({ status: 'unreachable', message: error.message });
        timer = setTimeout(retry, RETRY_MS);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, attempt, forget, retry]);

  useEffect(() => {
    if (token) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (work: () => void, delay: number) => {
      timer = setTimeout(work, delay);
    };
    const request = () => {
      coreApi
        .requestPairing()
        .then((pairing) => {
          if (cancelled) return;
          setState({ status: 'pairing', pairing, error: null });
          schedule(() => poll(pairing), POLL_MS);
        })
        .catch(() => {
          if (cancelled) return;
          setState({
            status: 'pairing',
            pairing: null,
            error: 'Ayko Core ne répond pas. Nouvel essai dans quelques secondes.',
          });
          schedule(request, RETRY_MS);
        });
    };
    const poll = (pairing: PairingCreated) => {
      coreApi
        .pollPairing(pairing.pairingId)
        .then((result) => {
          if (cancelled) return;
          if (result.status === 'confirmed' && result.deviceToken) {
            deviceStore.write(result.deviceToken);
            setToken(result.deviceToken);
          } else if (result.status === 'expired') {
            request();
          } else {
            schedule(() => poll(pairing), POLL_MS);
          }
        })
        .catch(() => {
          if (!cancelled) schedule(() => poll(pairing), RETRY_MS);
        });
    };
    request();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  const applyConfig = useCallback((roomConfig: RoomConfig) => {
    setState((current) =>
      current.status === 'ready' && current.room
        ? { ...current, room: { ...current.room, config: roomConfig } }
        : current,
    );
  }, []);

  return { state, retry, forget, applyConfig };
}
