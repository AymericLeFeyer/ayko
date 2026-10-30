import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { HouseActivity, RoomConfig } from '@ayko/contracts';
import { initialSession, sessionReducer } from '@/domain/session';
import { CoreSocket } from '@/infrastructure/CoreSocket';

const UI_VERSION = '0.1.0';
const FEED_LENGTH = 30;

async function clearLocalCache() {
  const keys = await caches?.keys();
  await Promise.all((keys ?? []).map((key) => caches.delete(key)));
}

/** One tablet's live session with Core. */
export function useConversation(options: {
  token: string;
  roomId: string | null;
  idleTimeoutSeconds: number;
  onConfig: (config: RoomConfig) => void;
  onRejected: () => void;
  onRoomChanged: () => void;
}) {
  const { token, roomId, idleTimeoutSeconds } = options;
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const [feed, setFeed] = useState<HouseActivity[]>([]);
  const socket = useRef<CoreSocket | null>(null);
  const handlers = useRef(options);
  handlers.current = options;

  useEffect(() => {
    const link = new CoreSocket(token, roomId, UI_VERSION, {
      onConnection: (connected) => dispatch({ type: 'connection', connected }),
      onRejected: () => handlers.current.onRejected(),
      onRoomChanged: () => handlers.current.onRoomChanged(),
      onFrame: (frame) => {
        if (frame.type === 'config.updated') {
          handlers.current.onConfig(frame.payload.roomConfig);
        } else if (frame.type === 'house.activity') {
          setFeed((current) =>
            [
              frame.payload,
              ...current.filter((item) => item.requestId !== frame.payload.requestId),
            ].slice(0, FEED_LENGTH),
          );
        } else if (frame.type === 'device.command') {
          const { command } = frame.payload;
          if (command === 'go_home') dispatch({ type: 'sleep' });
          else if (command === 'reload') location.reload();
          else void clearLocalCache().then(() => location.reload());
        } else {
          dispatch({ type: 'frame', frame });
        }
      },
    });
    socket.current = link;
    link.start();
    return () => link.stop();
  }, [token, roomId]);

  const busy = session.exchanges.at(-1)?.pending ?? false;

  useEffect(() => {
    if (session.screen === 'idle' || busy || session.confirm) return undefined;
    const timer = setTimeout(() => dispatch({ type: 'sleep' }), idleTimeoutSeconds * 1000);
    return () => clearTimeout(timer);
  }, [
    session.screen,
    session.exchanges,
    session.keystrokes,
    session.activity,
    session.confirm,
    busy,
    idleTimeoutSeconds,
  ]);

  const send = useCallback((text: string) => {
    const delivered = socket.current?.send({ type: 'user.text', payload: { text } });
    if (delivered) dispatch({ type: 'send', id: crypto.randomUUID(), text });
    return Boolean(delivered);
  }, []);

  const cancel = () => {
    if (session.requestId) {
      socket.current?.send({
        type: 'request.cancel',
        payload: { requestId: session.requestId },
      });
    }
  };

  const answerConfirm = (accepted: boolean) => {
    if (!session.confirm) return;
    socket.current?.send({
      type: 'confirm.answer',
      payload: { confirmId: session.confirm.confirmId, accepted },
    });
    dispatch({ type: 'confirm.closed' });
  };

  return {
    session,
    feed,
    busy,
    send,
    cancel,
    answerConfirm,
    wake: () => dispatch({ type: 'wake' }),
    typing: () => dispatch({ type: 'typing' }),
    activity: () => dispatch({ type: 'activity' }),
    goHome: () => dispatch({ type: 'sleep' }),
  };
}
