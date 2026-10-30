import { useEffect, useState } from 'react';
import { roomConfig, type Room, type RoomConfig, type WidgetData } from '@ayko/contracts';
import { useConversation } from '@/application/useConversation';
import { useDevice } from '@/application/useDevice';
import { enterFullscreen, useBurnInShift, useNow, useWakeLock } from '@/application/useKiosk';
import { isNight } from '@/domain/session';
import { coreApi } from '@/infrastructure/coreApi';
import { BlockActions } from './blocks/registry';
import {
  CenteredMessage,
  ConfirmOverlay,
  ConversationScreen,
  DashboardScreen,
  HomeScreen,
} from './screens';

const WIDGET_REFRESH_MS = 5 * 60_000;
const DEFAULT_CONFIG = roomConfig.parse({});

function useWidgets(token: string, config: RoomConfig) {
  const [widgets, setWidgets] = useState<WidgetData['widgets']>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      coreApi
        .widgets(token)
        // A missing widget is not worth an error screen: the clock still shows.
        .then((data) => !cancelled && setWidgets(data.widgets))
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, WIDGET_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, config]);
  return widgets;
}

function Kiosk(props: {
  token: string;
  room: Room | null;
  onConfig: (config: RoomConfig) => void;
  onRejected: () => void;
  onRoomChanged: () => void;
}) {
  const { token, room } = props;
  const config = room?.config ?? DEFAULT_CONFIG;
  useWakeLock();
  const now = useNow();
  const shift = useBurnInShift();
  const widgets = useWidgets(token, config);
  const conversation = useConversation({
    token,
    roomId: room?.id ?? null,
    idleTimeoutSeconds: config.idleTimeoutSeconds,
    onConfig: props.onConfig,
    onRejected: props.onRejected,
    onRoomChanged: props.onRoomChanged,
  });
  const { session, send } = conversation;

  const sleeping = session.screen === 'idle';
  const night = isNight(now, config.nightStart, config.nightEnd);
  const dimmed = sleeping && night;

  return (
    <div
      className="kiosk"
      data-theme={config.theme}
      data-lite={config.lightMode}
      onPointerDown={enterFullscreen}
      style={{ opacity: dimmed ? Math.max(config.nightBrightness, 5) / 100 : 1 }}
    >
      {!session.connected && (
        <p role="status" className="banner">
          Reconnexion…
        </p>
      )}
      <BlockActions.Provider value={send}>
        {config.dashboardMode ? (
          <DashboardScreen now={now} feed={conversation.feed} />
        ) : sleeping ? (
          <HomeScreen
            now={now}
            config={config}
            widgets={widgets}
            roomName={room?.name ?? ''}
            shift={shift}
            onWake={conversation.wake}
            onSuggestion={send}
          />
        ) : (
          <ConversationScreen
            state={session.screen}
            keystrokes={session.keystrokes}
            exchanges={session.exchanges}
            busy={conversation.busy}
            suggestions={config.suggestions}
            onSend={send}
            onTyping={conversation.typing}
            onActivity={conversation.activity}
            onCancel={conversation.cancel}
            onHome={conversation.goHome}
          />
        )}
      </BlockActions.Provider>
      {session.confirm && (
        <ConfirmOverlay confirm={session.confirm} onAnswer={conversation.answerConfirm} />
      )}
    </div>
  );
}

export function App() {
  const { state, retry, forget, applyConfig } = useDevice();

  if (state.status === 'ready') {
    return (
      <Kiosk
        token={state.token}
        room={state.room}
        onConfig={applyConfig}
        onRejected={forget}
        onRoomChanged={retry}
      />
    );
  }

  return (
    <div className="kiosk" data-theme="dark">
      {state.status === 'loading' && <CenteredMessage title="Démarrage d'Ayko" />}
      {state.status === 'unreachable' && (
        <CenteredMessage
          title="Ayko Core ne répond pas"
          detail={`${state.message}. Nouvel essai automatique.`}
          action={{ label: 'Réessayer', onClick: retry }}
        />
      )}
      {state.status === 'pairing' &&
        (state.pairing ? (
          <CenteredMessage
            title="Appairer cette tablette"
            code={state.pairing.code}
            detail="Saisissez ce code dans le backoffice, page Pièces et tablettes."
          />
        ) : (
          <CenteredMessage title="Appairage impossible" detail={state.error ?? undefined} />
        ))}
    </div>
  );
}
