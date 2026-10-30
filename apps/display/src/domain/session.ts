import type {
  Block,
  DisplayServerMessage,
  ScreenState,
  StepKind,
  StepStatus,
} from '@ayko/contracts';

export interface Step {
  stepId: string;
  kind: StepKind;
  label: string;
  status: StepStatus;
  durationMs?: number;
}

export interface Exchange {
  id: string;
  question: string;
  answer: string;
  blocks: Block[];
  steps: Step[];
  error: string | null;
  pending: boolean;
}

export interface PendingConfirm {
  confirmId: string;
  label: string;
  expiresAt: string;
}

export interface Session {
  screen: ScreenState;
  exchanges: Exchange[];
  confirm: PendingConfirm | null;
  connected: boolean;
  requestId: string | null;
  /** Bumped on each keystroke so the orb can react to typing. */
  keystrokes: number;
  /** Bumped by anything that should postpone the return to the home screen. */
  activity: number;
}

export type SessionAction =
  | { type: 'send'; id: string; text: string }
  | { type: 'frame'; frame: DisplayServerMessage }
  | { type: 'wake' }
  | { type: 'typing' }
  | { type: 'activity' }
  | { type: 'sleep' }
  | { type: 'connection'; connected: boolean }
  | { type: 'confirm.closed' };

export const initialSession: Session = {
  screen: 'idle',
  exchanges: [],
  confirm: null,
  connected: false,
  requestId: null,
  keystrokes: 0,
  activity: 0,
};

const CONNECTION_LOST = 'La connexion a été coupée avant la fin de la réponse.';

const patchLast = (session: Session, update: (exchange: Exchange) => Exchange): Session => ({
  ...session,
  exchanges: session.exchanges.map((exchange, index) =>
    index === session.exchanges.length - 1 ? update(exchange) : exchange,
  ),
});

function applyFrame(session: Session, frame: DisplayServerMessage): Session {
  switch (frame.type) {
    case 'state.changed': {
      const { state } = frame.payload;
      // Core goes back to idle after each answer; the conversation stays on screen until
      // the inactivity timer sends the tablet home.
      const screen = state === 'idle' ? 'awake' : state;
      return { ...session, screen, requestId: frame.requestId ?? session.requestId };
    }
    case 'activity.step':
      return patchLast(session, (exchange) => {
        const known = exchange.steps.some((step) => step.stepId === frame.payload.stepId);
        return {
          ...exchange,
          steps: known
            ? exchange.steps.map((step) =>
                step.stepId === frame.payload.stepId ? frame.payload : step,
              )
            : [...exchange.steps, frame.payload],
        };
      });
    case 'answer.delta':
      return patchLast(session, (exchange) => ({
        ...exchange,
        answer: exchange.answer + frame.payload.text,
      }));
    case 'answer.blocks':
      return patchLast(session, (exchange) => ({
        ...exchange,
        blocks: [...exchange.blocks, ...frame.payload.blocks],
      }));
    case 'answer.done':
      return {
        ...patchLast(session, (exchange) => ({ ...exchange, pending: false })),
        confirm: null,
        requestId: null,
      };
    case 'confirm.request':
      return { ...session, confirm: frame.payload };
    case 'system.notice': {
      const hasPending = session.exchanges.at(-1)?.pending;
      if (!frame.requestId || !hasPending) return session;
      return {
        ...patchLast(session, (exchange) => ({
          ...exchange,
          pending: false,
          error: frame.payload.level === 'info' ? null : frame.payload.message,
        })),
        confirm: null,
        requestId: null,
      };
    }
    default:
      return session;
  }
}

export function sessionReducer(session: Session, action: SessionAction): Session {
  switch (action.type) {
    case 'send':
      return {
        ...session,
        screen: 'thinking',
        exchanges: [
          ...session.exchanges,
          {
            id: action.id,
            question: action.text,
            answer: '',
            blocks: [],
            steps: [],
            error: null,
            pending: true,
          },
        ],
      };
    case 'frame':
      return applyFrame(session, action.frame);
    case 'wake':
      return session.screen === 'idle' ? { ...session, screen: 'awake' } : session;
    case 'activity':
      return { ...session, activity: session.activity + 1 };
    case 'typing':
      return {
        ...session,
        screen: session.requestId ? session.screen : 'listening',
        keystrokes: session.keystrokes + 1,
      };
    case 'sleep':
      return { ...initialSession, connected: session.connected };
    case 'confirm.closed':
      return { ...session, confirm: null };
    case 'connection': {
      if (action.connected) return { ...session, connected: true };
      // An answer in flight cannot resume on a new socket: say so instead of waiting forever.
      const interrupted = session.exchanges.at(-1)?.pending;
      const next = { ...session, connected: false, confirm: null, requestId: null };
      if (!interrupted) return next;
      return {
        ...patchLast(next, (exchange) => ({
          ...exchange,
          pending: false,
          error: CONNECTION_LOST,
        })),
        screen: 'error',
      };
    }
    default:
      return session;
  }
}

/** Minutes since midnight of an `HH:MM` setting. */
const toMinutes = (value: string) => {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

/** True during the night window, which usually spans midnight. */
export function isNight(now: Date, start: string, end: string) {
  const current = now.getHours() * 60 + now.getMinutes();
  const from = toMinutes(start);
  const to = toMinutes(end);
  return from <= to ? current >= from && current < to : current >= from || current < to;
}
