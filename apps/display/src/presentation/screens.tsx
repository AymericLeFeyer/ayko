import { Mic, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Block, HouseActivity, RoomConfig, ScreenState } from '@ayko/contracts';
import type { Exchange, PendingConfirm, Step } from '@/domain/session';
import { BlockView } from './blocks/registry';
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

function ActivityPanel({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(true);
  if (steps.length === 0) return null;
  return (
    <section className="activity">
      <button className="activity-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Ce qu'Ayko fait
      </button>
      {open && (
        <ol>
          {steps.map((step) => (
            <li key={step.stepId} className={`step step-${step.status}`}>
              <span className="step-dot" />
              {step.label}
              {step.durationMs !== undefined && <small>{Math.round(step.durationMs)} ms</small>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ExchangeView({ exchange }: { exchange: Exchange }) {
  return (
    <article className="exchange">
      <p className="question">{exchange.question}</p>
      <ActivityPanel steps={exchange.steps} />
      {exchange.answer && <p className="answer">{exchange.answer}</p>}
      {exchange.blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
      {exchange.error && (
        <p role="alert" className="exchange-error">
          {exchange.error}
        </p>
      )}
    </article>
  );
}

const STATUS_LABEL: Record<ScreenState, string> = {
  idle: '',
  awake: 'À votre écoute',
  listening: 'Je vous écoute',
  thinking: 'Je réfléchis',
  answering: 'Je réponds',
  error: 'Un problème est survenu',
};

export function ConversationScreen(props: {
  state: ScreenState;
  keystrokes: number;
  exchanges: Exchange[];
  busy: boolean;
  suggestions: string[];
  onSend: (text: string) => boolean;
  onTyping: () => void;
  onCancel: () => void;
  onHome: () => void;
}) {
  const { exchanges, busy, onSend } = props;
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [exchanges]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() && onSend(text.trim())) setText('');
  };

  return (
    <div className="conversation">
      <aside className="conversation-orb">
        <Orb state={props.state} pulse={props.keystrokes} size="min(30vh, 24vw)" />
        <p className="status" role="status">
          {STATUS_LABEL[props.state]}
        </p>
        <button className="button button-ghost" onClick={props.onHome}>
          Accueil
        </button>
      </aside>
      <main className="conversation-main">
        <div className="exchanges">
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
          <div ref={end} />
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
      </main>
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
