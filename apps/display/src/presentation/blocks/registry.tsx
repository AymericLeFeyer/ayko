import { createContext, useContext, useEffect, useState, type ComponentType } from 'react';
import { knownBlock, type Block, type KnownBlock } from '@ayko/contracts';

type OfType<T extends KnownBlock['type']> = Extract<KnownBlock, { type: T }>;
type Registry = { [T in KnownBlock['type']]: ComponentType<{ block: OfType<T> }> };

/** Lets a card send a message, such as the quick action of a device. */
export const BlockActions = createContext<(text: string) => void>(() => {});

const Card = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <section className="card">
    {title && <h3 className="card-title">{title}</h3>}
    {children}
  </section>
);

function ActionButton({ action }: { action?: { label: string; text: string } }) {
  const send = useContext(BlockActions);
  if (!action) return null;
  return (
    <button className="button" onClick={() => send(action.text)}>
      {action.label}
    </button>
  );
}

/** Light Markdown: bold and line breaks are all a spoken-style answer needs. */
function RichText({ text }: { text: string }) {
  return (
    <p className="rich-text">
      {text
        .split(/(\*\*[^*]+\*\*)/)
        .map((part, index) =>
          part.startsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part,
        )}
    </p>
  );
}

const EntityRow = ({ item }: { item: Omit<OfType<'entity'>, 'type'> }) => (
  <div className="entity">
    <span className="entity-name">{item.name}</span>
    <span className="entity-state">
      {item.state}
      {item.unit && ` ${item.unit}`}
    </span>
    <ActionButton action={item.action} />
  </div>
);

function Timer({ block }: { block: OfType<'timer'> }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((new Date(block.endsAt).getTime() - now) / 1000));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  return (
    <Card title={block.label}>
      <p className="big-number">
        {minutes}:{String(seconds % 60).padStart(2, '0')}
      </p>
    </Card>
  );
}

const registry: Registry = {
  text: ({ block }) => <RichText text={block.text} />,
  entity: ({ block }) => (
    <Card>
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
    <Card>
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
    <Card title={block.location}>
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
    <Card title={block.title}>
      <ul className="plain-list">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  ),
  table: ({ block }) => (
    <Card title={block.title}>
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
  // Confirmations are driven by the dedicated event; this only keeps the question visible.
  confirm: ({ block }) => <Card>{block.label}</Card>,
  progress: ({ block }) => (
    <Card title={block.label}>
      <div className="progress" role="progressbar" aria-valuenow={block.value}>
        <span style={{ width: `${block.value}%` }} />
      </div>
    </Card>
  ),
  timer: Timer,
  error: ({ block }) => (
    <Card>
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
