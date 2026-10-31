import { describe, expect, it } from 'vitest';
import type { DisplayServerMessage } from '@ayko/contracts';
import {
  initialSession,
  isNight,
  sessionReducer,
  type Session,
  type SessionAction,
} from '../src/domain/session.js';

const envelope = { room: null, ts: '2026-10-30T10:00:00.000Z' };
const requestId = '00000000-0000-4000-8000-000000000001';

const frame = (value: unknown): SessionAction => ({
  type: 'frame',
  frame: { ...envelope, ...(value as object) } as DisplayServerMessage,
});

const run = (...actions: SessionAction[]) =>
  actions.reduce<Session>(sessionReducer, { ...initialSession, connected: true });

const sent: SessionAction = { type: 'send', id: 'one', text: 'Bonjour' };

describe('sessionReducer', () => {
  it('sends blocks into orbit, updating the card of the same device in place', () => {
    const entity = (name: string, state: string) =>
      frame({
        type: 'answer.blocks',
        payload: { requestId, blocks: [{ type: 'entity', name, state }] },
      });
    const session = run(sent, entity('Salon', 'Allumé'), entity('Salon', 'Éteint'));
    expect(session.satellites).toMatchObject([
      { id: 0, slot: 0, block: { name: 'Salon', state: 'Éteint' } },
    ]);
  });

  it('keeps three satellites, each staying in its slot', () => {
    const block = (text: string) =>
      frame({ type: 'answer.blocks', payload: { requestId, blocks: [{ type: 'text', text }] } });
    const session = run(sent, block('a'), block('b'), block('c'), block('d'));
    expect(session.satellites.map(({ slot }) => slot)).toEqual([1, 2, 0]);
  });

  it('keeps only the last three exchanges on screen', () => {
    const session = run(
      ...['a', 'b', 'c', 'd'].map((id): SessionAction => ({
        type: 'send',
        id,
        text: `Question ${id}`,
      })),
    );
    expect(session.exchanges.map((exchange) => exchange.id)).toEqual(['b', 'c', 'd']);
  });

  it('streams an answer into the current exchange', () => {
    const session = run(
      sent,
      frame({ type: 'state.changed', requestId, payload: { state: 'answering' } }),
      frame({ type: 'answer.delta', payload: { requestId, text: 'Bon' } }),
      frame({ type: 'answer.delta', payload: { requestId, text: 'jour' } }),
    );
    expect(session.screen).toBe('answering');
    expect(session.exchanges[0]?.answer).toBe('Bonjour');
    expect(session.exchanges[0]?.pending).toBe(true);
  });

  it('keeps the conversation on screen when Core returns to idle', () => {
    const session = run(
      sent,
      frame({ type: 'answer.done', payload: { requestId, stats: {} } }),
      frame({ type: 'state.changed', requestId, payload: { state: 'idle' } }),
    );
    expect(session.screen).toBe('awake');
    expect(session.exchanges).toHaveLength(1);
    expect(session.exchanges[0]?.pending).toBe(false);
  });

  it('updates a step in place', () => {
    const step = { stepId: 's', kind: 'thinking', label: 'Réflexion', status: 'running' };
    const session = run(
      sent,
      frame({ type: 'activity.step', requestId, payload: step }),
      frame({ type: 'activity.step', requestId, payload: { ...step, status: 'done' } }),
    );
    expect(session.exchanges[0]?.steps).toHaveLength(1);
    expect(session.exchanges[0]?.steps[0]?.status).toBe('done');
  });

  it('never leaves an answer waiting after a lost connection', () => {
    const session = run(sent, { type: 'connection', connected: false });
    expect(session.screen).toBe('error');
    expect(session.exchanges[0]?.pending).toBe(false);
    expect(session.exchanges[0]?.error).toContain('connexion');
  });

  it('stays quiet about a lost connection when nothing was in flight', () => {
    const session = run({ type: 'connection', connected: false });
    expect(session.screen).toBe('idle');
    expect(session.connected).toBe(false);
  });

  it('shows failures but not a cancellation', () => {
    const notice = (level: string) =>
      frame({ type: 'system.notice', requestId, payload: { level, message: 'Panne' } });
    expect(run(sent, notice('error')).exchanges[0]?.error).toBe('Panne');
    expect(run(sent, notice('info')).exchanges[0]?.error).toBeNull();
  });

  it('counts reading as activity without changing the screen', () => {
    const session = run(sent, { type: 'activity' });
    expect(session.activity).toBe(1);
    expect(session.screen).toBe('thinking');
  });

  it('forgets the conversation when going home, but not the connection', () => {
    const session = run(sent, { type: 'sleep' });
    expect(session.exchanges).toHaveLength(0);
    expect(session.screen).toBe('idle');
    expect(session.connected).toBe(true);
  });
});

describe('isNight', () => {
  const at = (hours: number, minutes = 0) => new Date(2026, 9, 30, hours, minutes);

  it('handles a window spanning midnight', () => {
    expect(isNight(at(23), '22:00', '07:00')).toBe(true);
    expect(isNight(at(3), '22:00', '07:00')).toBe(true);
    expect(isNight(at(7), '22:00', '07:00')).toBe(false);
    expect(isNight(at(12), '22:00', '07:00')).toBe(false);
  });

  it('handles a window within one day', () => {
    expect(isNight(at(14), '13:00', '15:00')).toBe(true);
    expect(isNight(at(16), '13:00', '15:00')).toBe(false);
  });
});

describe('camera cards', () => {
  const cameraBlock = (cameraId: string, fullscreen: boolean) =>
    frame({
      type: 'answer.blocks',
      requestId,
      payload: {
        requestId,
        blocks: [{ type: 'camera', cameraId, name: cameraId, fullscreen }],
      },
    });

  it('opens full screen when asked and stays a single card', () => {
    const session = run(cameraBlock('porte', false), cameraBlock('porte', true));
    expect(session.focusedCamera).toBe('porte');
    expect(session.satellites).toHaveLength(1);
    expect(session.satellites[0]?.id).toBe(0);
  });

  it('comes back to its card when an answer shows it as a card', () => {
    const session = run(cameraBlock('porte', true), cameraBlock('porte', false));
    expect(session.focusedCamera).toBeNull();
  });

  it('leaves another camera on screen', () => {
    const session = run(cameraBlock('porte', true), cameraBlock('salon', false));
    expect(session.focusedCamera).toBe('porte');
  });

  it('toggles on tap, counts as activity and ends with the session', () => {
    const open = run(cameraBlock('salon', false), { type: 'camera.focus', cameraId: 'salon' });
    expect(open.focusedCamera).toBe('salon');
    expect(open.activity).toBe(1);
    expect(sessionReducer(open, { type: 'camera.focus', cameraId: null }).focusedCamera).toBeNull();
    expect(sessionReducer(open, { type: 'sleep' }).focusedCamera).toBeNull();
  });
});
