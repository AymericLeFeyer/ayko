import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePlaygroundRun, type Exchange } from '@/application/chat/usePlaygroundRun';
import { ollamaApi, personaApi, roomApi } from '@/infrastructure/api';
import { EmptyState, Field, Light, PageHeader, Panel } from '@/presentation/components/common';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Checkbox } from '@/presentation/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select';
import { Textarea } from '@/presentation/components/ui/textarea';
import { formatMs, formatRate } from '@/shared/format';

const DEFAULT = '__default';

function Choice(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  defaultLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={props.label} className="min-w-44 flex-1">
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT}>{props.defaultLabel}</SelectItem>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function ExchangeView({ exchange }: { exchange: Exchange }) {
  const { stats } = exchange;
  return (
    <article className="space-y-2">
      <p className="font-semibold">{exchange.question}</p>
      {exchange.steps.length > 0 && (
        <ol className="text-muted-foreground space-y-0.5 text-sm">
          {exchange.steps.map((step) => (
            <li key={step.stepId} className="flex items-center gap-2">
              <Light
                state={step.status === 'running' ? 'warn' : step.status === 'error' ? 'down' : 'up'}
                label={step.label}
              />
              {step.durationMs !== undefined && <span>{formatMs(step.durationMs)}</span>}
            </li>
          ))}
        </ol>
      )}
      {exchange.answer && <p className="whitespace-pre-wrap">{exchange.answer}</p>}
      {exchange.error && (
        <p role="alert" className="text-destructive text-sm">
          {exchange.error}
        </p>
      )}
      {stats && (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 text-sm">
          {stats.cacheHit && <Badge variant="secondary">Raccourci mémorisé</Badge>}
          {stats.model && <span>{stats.model}</span>}
          <span>Premier jeton {formatMs(stats.ttftMs)}</span>
          <span>{formatRate(stats.tokensPerSecond)}</span>
          <span>Total {formatMs(stats.durationMs)}</span>
        </p>
      )}
      {exchange.requestId && !exchange.pending && (
        <Link
          className="text-sm underline-offset-4 hover:underline"
          to={`/traces/${exchange.requestId}`}
        >
          Voir la trace
        </Link>
      )}
    </article>
  );
}

export function PlaygroundPage() {
  const replay = useLocation().state as { text?: string } | null;
  const [text, setText] = useState(replay?.text ?? '');
  const [model, setModel] = useState(DEFAULT);
  const [persona, setPersona] = useState(DEFAULT);
  const [room, setRoom] = useState(DEFAULT);
  const [bypassCache, setBypassCache] = useState(false);
  const { exchanges, confirm, send, cancel, answerConfirm, reset } = usePlaygroundRun();

  const models = useQuery({ queryKey: ['ollama', 'models'], queryFn: ollamaApi.models });
  const personas = useQuery({ queryKey: ['personas'], queryFn: personaApi.list });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomApi.list });
  const running = exchanges.at(-1)?.pending ?? false;

  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight });
  }, [exchanges]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || running) return;
    void send({
      text,
      model: model === DEFAULT ? null : model,
      personaId: persona === DEFAULT ? null : persona,
      roomId: room === DEFAULT ? null : room,
      bypassCache,
    });
    setText('');
  };

  return (
    <>
      <PageHeader
        title="Terrain de jeu"
        intro="Parlez à Ayko comme depuis une tablette, et voyez chaque étape."
        actions={
          <Button variant="outline" size="sm" onClick={reset} disabled={running}>
            Nouvelle conversation
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Choice
          label="Modèle"
          value={model}
          onChange={setModel}
          defaultLabel="Rôle conversation"
          options={(models.data ?? []).map((item) => ({ value: item.name, label: item.name }))}
        />
        <Choice
          label="Persona"
          value={persona}
          onChange={setPersona}
          defaultLabel="Persona de la pièce"
          options={(personas.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
        />
        <Choice
          label="Pièce simulée"
          value={room}
          onChange={setRoom}
          defaultLabel="Aucune pièce"
          options={(rooms.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
        />
      </div>

      <div className="mb-4 space-y-6">
        {exchanges.length === 0 ? (
          <EmptyState title="Posez une question" hint="Par exemple : allume la lumière du salon." />
        ) : (
          exchanges.map((exchange) => <ExchangeView key={exchange.id} exchange={exchange} />)
        )}
      </div>

      {confirm && (
        <Panel className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium">{confirm.label}</p>
          <span className="flex gap-2">
            <Button onClick={() => answerConfirm(true)}>Oui</Button>
            <Button variant="outline" onClick={() => answerConfirm(false)}>
              Non
            </Button>
          </span>
        </Panel>
      )}

      <form onSubmit={submit} className="bg-background sticky bottom-0 space-y-2 py-2">
        <Textarea
          aria-label="Votre message"
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) submit(event);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={bypassCache}
              onCheckedChange={(value) => setBypassCache(value === true)}
            />
            Ignorer les raccourcis
          </label>
          {running ? (
            <Button type="button" variant="outline" onClick={cancel}>
              Annuler la requête
            </Button>
          ) : (
            <Button type="submit" disabled={!text.trim()}>
              Envoyer
            </Button>
          )}
        </div>
      </form>
    </>
  );
}
