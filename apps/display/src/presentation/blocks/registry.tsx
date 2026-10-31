import {
  Blinds,
  CalendarDays,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  DoorClosed,
  Droplets,
  Fan,
  Gauge,
  Lightbulb,
  ListChecks,
  type LucideIcon,
  Plug,
  Power,
  ShieldQuestion,
  Speaker,
  Sun,
  Table2,
  Thermometer,
  Timer as TimerIcon,
  TriangleAlert,
  Tv,
} from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ComponentType } from 'react';
import { knownBlock, type Block, type EntityAction, type KnownBlock } from '@ayko/contracts';
import {
  entityKind,
  entityTone,
  weatherKind,
  type EntityKind,
  type Tone,
  type WeatherKind,
} from '@/domain/blockLook';
import { Markdown } from '../Markdown';
import { CameraCard } from './Camera';

type OfType<T extends KnownBlock['type']> = Extract<KnownBlock, { type: T }>;
type Registry = { [T in KnownBlock['type']]: ComponentType<{ block: OfType<T> }> };

/** Lets a card send a message, such as the quick action of a device. */
export const BlockActions = createContext<(action: Pick<EntityAction, 'text' | 'call'>) => void>(
  () => {},
);

/** Long enough for a tool to answer; a refused action leaves the state as it was. */
const ACTION_WAIT_MS = 5000;

const ENTITY_ICONS: Record<EntityKind, LucideIcon> = {
  light: Lightbulb,
  heating: Thermometer,
  shutter: Blinds,
  plug: Plug,
  screen: Tv,
  door: DoorClosed,
  speaker: Speaker,
  fan: Fan,
  humidity: Droplets,
  power: Power,
};

const WEATHER_ICONS: Record<WeatherKind, LucideIcon> = {
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  fog: CloudFog,
};

const ToneIcon = ({ icon: Icon }: { icon: LucideIcon }) => (
  <span className="tone-icon">
    <Icon size={24} aria-hidden />
  </span>
);

function Card(props: {
  title?: string;
  icon?: LucideIcon;
  tone?: Tone;
  children: React.ReactNode;
}) {
  const { title, icon, tone, children } = props;
  return (
    <section className="card" data-tone={tone}>
      {(title || icon) && (
        <div className="card-header">
          {icon && <ToneIcon icon={icon} />}
          {title && <h3 className="card-title">{title}</h3>}
        </div>
      )}
      {children}
    </section>
  );
}

function ActionButton({ action }: { action?: { label: string; text: string } }) {
  const send = useContext(BlockActions);
  if (!action) return null;
  return (
    <button className="button" onClick={() => send(action)}>
      {action.label}
    </button>
  );
}

function EntityRow({ item }: { item: Omit<OfType<'entity'>, 'type'> }) {
  const send = useContext(BlockActions);
  const { action, state } = item;
  const [waiting, setWaiting] = useState(false);

  // A second tap before the answer would undo the first one.
  useEffect(() => setWaiting(false), [state]);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => setWaiting(false), ACTION_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  const content = (
    <>
      <ToneIcon icon={ENTITY_ICONS[entityKind(item.name, item.unit)]} />
      <span className="entity-text">
        <span className="entity-name">{item.name}</span>
        <span className="entity-state">
          {item.state}
          {item.unit && ` ${item.unit}`}
        </span>
      </span>
    </>
  );
  const tone = entityTone(item.state);
  if (!action) {
    return (
      <div className="entity" data-tone={tone}>
        {content}
      </div>
    );
  }
  return (
    <button
      className="entity entity-action"
      data-tone={tone}
      aria-busy={waiting}
      disabled={waiting}
      onClick={() => {
        // Without a tool, the tap becomes a message and the card has nothing to wait for.
        setWaiting(Boolean(action.call));
        send(action);
      }}
    >
      {content}
      <span className="entity-cta">{action.label}</span>
    </button>
  );
}

function Timer({ block }: { block: OfType<'timer'> }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((new Date(block.endsAt).getTime() - now) / 1000));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  return (
    <Card title={block.label} icon={TimerIcon} tone={seconds === 0 ? 'ok' : 'on'}>
      <p className="big-number">
        {minutes}:{String(seconds % 60).padStart(2, '0')}
      </p>
    </Card>
  );
}

const registry: Registry = {
  text: ({ block }) => <Markdown text={block.text} />,
  entity: ({ block }) => (
    <Card tone={entityTone(block.state)}>
      <EntityRow item={block} />
    </Card>
  ),
  entity_list: ({ block }) => (
    <Card title={block.title}>
      {block.items.map((item) => (
        <EntityRow key={item.name} item={item} />
      ))}
    </Card>
  ),
  calendar_events: ({ block }) => (
    <Card title="Agenda" icon={CalendarDays} tone="info">
      <ul className="events">
        {block.events.map((event) => (
          <li key={`${event.start}-${event.title}`}>
            <span className="event-dot" style={{ background: event.color ?? 'var(--lamp)' }} />
            <span className="event-time">{event.start}</span>
            <span>
              {event.title}
              {event.location && <small>{event.location}</small>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  ),
  weather: ({ block }) => (
    <Card
      title={block.location ?? 'Météo'}
      icon={WEATHER_ICONS[weatherKind(block.condition)]}
      tone={weatherKind(block.condition) === 'sun' ? 'on' : 'info'}
    >
      <p className="big-number">{Math.round(block.temperature)} °C</p>
      <p>{block.condition}</p>
      {block.forecast && (
        <ul className="forecast">
          {block.forecast.map((day) => (
            <li key={day.label}>
              {day.label} : {Math.round(day.temperature)} °C, {day.condition}
            </li>
          ))}
        </ul>
      )}
    </Card>
  ),
  list: ({ block }) => (
    <Card title={block.title} icon={ListChecks} tone="info">
      <ul className="plain-list">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  ),
  table: ({ block }) => (
    <Card title={block.title} icon={Table2} tone="info">
      <table>
        <thead>
          <tr>
            {block.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, at) => (
                <td key={at}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  ),
  image: ({ block }) => (
    <Card>
      <img className="image" src={block.url} alt={block.alt ?? ''} />
    </Card>
  ),
  camera: CameraCard,
  // Confirmations are driven by the dedicated event; this only keeps the question visible.
  confirm: ({ block }) => (
    <Card title="À confirmer" icon={ShieldQuestion} tone="on">
      {block.label}
    </Card>
  ),
  progress: ({ block }) => (
    <Card title={block.label} icon={Gauge} tone={block.value === 100 ? 'ok' : 'on'}>
      <div className="progress" role="progressbar" aria-valuenow={block.value}>
        <span style={{ width: `${block.value}%` }} />
      </div>
    </Card>
  ),
  timer: Timer,
  error: ({ block }) => (
    <Card title="Problème" icon={TriangleAlert} tone="alert">
      <p>{block.message}</p>
      <ActionButton action={block.action} />
    </Card>
  ),
};

/** Unknown or malformed blocks must never break the screen: they show as raw text. */
export function BlockView({ block }: { block: Block }) {
  const parsed = knownBlock.safeParse(block);
  if (!parsed.success) {
    const fallback = typeof block.text === 'string' ? block.text : JSON.stringify(block);
    return <p className="raw-block">{fallback}</p>;
  }
  const Component = registry[parsed.data.type] as ComponentType<{ block: KnownBlock }>;
  return <Component block={parsed.data} />;
}
