import type { CameraTicket, PairingCreated, PairingPoll, Room, WidgetData } from '@ayko/contracts';

const BASE = '/api/v1';

export class DeviceRejected extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (response.status === 401) throw new DeviceRejected('Tablette non reconnue');
  if (!response.ok) throw new Error(`Ayko Core a répondu ${response.status}`);
  return (await response.json()) as T;
}

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

export const coreApi = {
  requestPairing: () =>
    call<PairingCreated>('/pairing/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  pollPairing: (id: string) => call<PairingPoll>(`/pairing/${id}`),
  config: (token: string) =>
    call<{ deviceId: string; room: Room | null }>('/device/config', bearer(token)),
  widgets: (token: string) => call<WidgetData>('/device/widgets', bearer(token)),
  cameraTicket: (token: string, cameraId: string) =>
    call<CameraTicket>(`/device/cameras/${cameraId}/ticket`, { method: 'POST', ...bearer(token) }),
  report: (token: string) =>
    call<{ id: string }>('/device/reports', { method: 'POST', ...bearer(token) }),
};
