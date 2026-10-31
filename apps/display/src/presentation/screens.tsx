import { ArrowDown, Flag, Mic, Send, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { Block, HouseActivity, RoomConfig, ScreenState } from '@ayko/contracts';
import type { ReportState } from '@/application/useConversation';
import type { Exchange, PendingConfirm, Satellite, Step } from '@/domain/session';
import { BlockView } from './blocks/registry';
import { Markdown } from './Markdown';
import { Orb } from './Orb';

const LOCALE = 'fr-FR';
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function HomeScreen(props: {
  now: Date;
  config: RoomConfig;
  widgets: { widget: string; blocks: Block[] }[];
  roomName: string;
  shift: { x: number; y: number };
  onWake: () => void;
  onSuggestion: (text: string) => void;
}) {
  const { config, now, shift } = props;
  const showSuggestions = config.widgets.includes('suggestions') && config.suggestions.length > 0;
  return (
    <div
      role="button"
      tabIndex={0}
      className="home"
      onClick={props.onWake}
      onKeyDown={(event) => event.key === 'Enter' && props.onWake()}
      aria-label="Réveiller Ayko"
      style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}
    >
      <div className="home-clock">
        {config.widgets.includes('clock') && (
          <>
            <p className="clock">{timeFormat.format(now)}</p>
            <p className="date">{dateFormat.format(now)}</p>
          </>
        )}
        <p className="room">{props.roomName}</p>
      </div>
      <div className="home-widgets">
        {props.widgets.flatMap(({ widget, blocks }) =>
          blocks.map((block, index) => <BlockView key={`${widget}-${index}`} block={block} />),
        )}
        {showSuggestions && (
          <div className="suggestions">
            {config.suggestions.map((text) => (
              <button
                key={text}
                className="chip"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onSuggestion(text);
                }}
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One line only: the latest step, or the state of the screen before the first step. */
function ActivityLine({ steps, status }: { steps: Step[]; status: string }) {
  const step = steps.at(-1);
  if (!step) {
    return (
      <p className="status" role="status">
        {status}
      </p>
    );
  }
  return (
    <ol className="log" aria-label="Ce qu'Ayko fait">
      <li className={`step step-${step.status}`}>
        <span className="step-dot" />
        <span className="step-label">{step.label}</span>
        {step.durationMs !== undefined && <small>{Math.round(step.durationMs)} ms</small>}
      </li>
    </ol>
  );
}

function ExchangeView({ exchange }: { exchange: Exchange }) {
  return (
    <article className="exchange">
      <p className="message message-user">{exchange.question}</p>
      {exchange.answer && (
        <div className="message message-ayko">
          <Markdown text={exchange.answer} />
        </div>
      )}
      {exchange.error && (
        <p role="alert" className="message exchange-error">
          {exchange.error}
        </p>
      )}
    </article>
  );
}

const END_MARGIN_PX = 80;
const ACTIVITY_THROTTLE_MS = 1000;

const STATUS_LABEL: Record<ScreenState, string> = {
  idle: '',
  awake: 'À votre écoute',
  listening: 'Je vous écoute',
  thinking: 'Je réfléchis',
  answering: 'Je réponds',
  error: 'Un problème est survenu',
};

const REPORT_LABEL: Record<ReportState, string> = {
  idle: 'Signaler',
  saving: 'Envoi…',
  saved: 'Signalé',
  failed: 'Échec, réessayer',
};

export function ConversationScreen(props: {
  state: ScreenState;
  keystrokes: number;
  exchanges: Exchange[];
  satellites: Satellite[];
  busy: boolean;
  suggestions: string[];
  onSend: (text: string) => boolean;
  onTyping: () => void;
  onActivity: () => void;
  onCancel: () => void;
  onHome: () => void;
  reportState: ReportState;
  onReport: () => void;
}) {
  const { exchanges, busy, onSend, reportState } = props;
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const lastActivity = useRef(0);
  const [atEnd, setAtEnd] = useState(true);

  const scrollToEnd = () => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  };

  // Follow the stream only while the reader is at the end: scrolling up must hold still.
  useLayoutEffect(() => {
    if (following.current) scrollToEnd();
  }, [exchanges]);

  const onScroll = () => {
    const element = list.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    following.current = distance < END_MARGIN_PX;
    setAtEnd(following.current);
    // Reading counts as activity, or a long answer would vanish mid-sentence.
    if (Date.now() - lastActivity.current > ACTIVITY_THROTTLE_MS) {
      lastActivity.current = Date.now();
      props.onActivity();
    }
  };

  const jumpToEnd = () => {
    following.current = true;
    setAtEnd(true);
    scrollToEnd();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() && onSend(text.trim())) {
      setText('');
      jumpToEnd();
    }
  };

  return (
    <div className="conversation">
      <div className="stage">
        <div className="stage-actions">
          <button className="button button-ghost" onClick={props.onHome}>
            Accueil
          </button>
          <button
            className="button button-ghost button-report"
            disabled={reportState === 'saving' || reportState === 'saved'}
            onClick={props.onReport}
          >
            <Flag /> {REPORT_LABEL[reportState]}
          </button>
        </div>
        <div className="orbit-center">
          <Orb state={props.state} pulse={props.keystrokes} size="var(--orb)" />
        </div>
        {props.satellites.map(({ id, slot, block }) => (
          <div key={id} className="satellite" data-slot={slot}>
            <div className="satellite-body">
              <BlockView block={block} />
            </div>
          </div>
        ))}
        <div className="thread">
          <div ref={list} className="exchanges" onScroll={onScroll}>
            {exchanges.length === 0 && (
              <div className="suggestions">
                {props.suggestions.map((suggestion) => (
                  <button key={suggestion} className="chip" onClick={() => onSend(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {exchanges.map((exchange) => (
              <ExchangeView key={exchange.id} exchange={exchange} />
            ))}
          </div>
          {!atEnd && (
            <button className="button jump-to-end" onClick={jumpToEnd}>
              <ArrowDown /> Aller à la fin
            </button>
          )}
        </div>
      </div>
      <div className="logs">
        <ActivityLine steps={exchanges.at(-1)?.steps ?? []} status={STATUS_LABEL[props.state]} />
      </div>
      <form className="composer" onSubmit={submit}>
        <button
          type="button"
          className="icon-button"
          disabled
          aria-label="Voix bientôt disponible"
          title="Voix bientôt disponible"
        >
          <Mic />
        </button>
        <input
          aria-label="Votre message"
          placeholder="Écrivez à Ayko"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            props.onTyping();
          }}
        />
        {busy ? (
          <button
            type="button"
            className="icon-button"
            aria-label="Annuler la requête"
            onClick={props.onCancel}
          >
            <X />
          </button>
        ) : (
          <button
            type="submit"
            className="icon-button icon-button-primary"
            aria-label="Envoyer"
            disabled={!text.trim()}
          >
            <Send />
          </button>
        )}
      </form>
    </div>
  );
}

export function ConfirmOverlay(props: {
  confirm: PendingConfirm;
  onAnswer: (accepted: boolean) => void;
}) {
  const { confirm, onAnswer } = props;
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () =>
      setRemaining(
        Math.max(0, Math.round((new Date(confirm.expiresAt).getTime() - Date.now()) / 1000)),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [confirm.expiresAt]);
  return (
    <div className="overlay" role="alertdialog" aria-label={confirm.label}>
      <p className="overlay-question">{confirm.label}</p>
      <div className="overlay-actions">
        <button className="button button-large button-primary" onClick={() => onAnswer(true)}>
          Oui
        </button>
        <button className="button button-large" onClick={() => onAnswer(false)}>
          Non
        </button>
      </div>
      <p className="overlay-timer">{remaining} s</p>
    </div>
  );
}

const FEED_STATUS = { running: 'En cours', done: 'Terminé', error: 'Erreur', cancelled: 'Annulé' };

export function DashboardScreen(props: { now: Date; feed: HouseActivity[] }) {
  return (
    <div className="dashboard">
      <header>
        <h1>Activité de la maison</h1>
        <p className="dashboard-clock">{timeFormat.format(props.now)}</p>
      </header>
      {props.feed.length === 0 ? (
        <p className="dashboard-empty">Les demandes de toutes les pièces s'afficheront ici.</p>
      ) : (
        <ul>
          {props.feed.map((item) => (
            <li key={item.requestId}>
              <span className="dashboard-room">{item.roomName ?? 'Sans pièce'}</span>
              <span className="dashboard-text">{item.text}</span>
              <span className={`dashboard-status status-${item.status}`}>
                {FEED_STATUS[item.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CenteredMessage(props: {
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
  code?: string;
}) {
  return (
    <div className="centered">
      <Orb state={props.code ? 'awake' : 'error'} pulse={0} size="min(30vh, 40vw)" />
      <h1>{props.title}</h1>
      {props.code && <p className="pairing-code">{props.code}</p>}
      {props.detail && <p className="centered-detail">{props.detail}</p>}
      {props.action && (
        <button className="button button-large button-primary" onClick={props.action.onClick}>
          {props.action.label}
        </button>
      )}
    </div>
  );
}
