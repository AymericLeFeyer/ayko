import type { UseQueryResult } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/presentation/components/ui/alert-dialog';
import { Input } from '@/presentation/components/ui/input';
import { Skeleton } from '@/presentation/components/ui/skeleton';
import { cn } from '@/shared/utils';

export function PageHeader(props: { title: string; intro?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{props.title}</h1>
        {props.intro && <p className="text-muted-foreground mt-1 max-w-2xl">{props.intro}</p>}
      </div>
      {props.actions && <div className="flex flex-wrap gap-2">{props.actions}</div>}
    </header>
  );
}

export function Section(props: {
  title: string;
  intro?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-8', props.className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{props.title}</h2>
          {props.intro && <p className="text-muted-foreground text-sm">{props.intro}</p>}
        </div>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('bg-card rounded-md border p-4', className)}>{children}</div>;
}

export type Led = 'up' | 'warn' | 'down' | 'off';

export const Light = ({ state, label }: { state: Led; label?: string }) => (
  <span className="inline-flex items-center gap-2">
    <span className={cn('led', state !== 'off' && `led-${state}`)} aria-hidden />
    {label && <span>{label}</span>}
  </span>
);

export function EmptyState(props: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center">
      <p className="text-foreground font-medium">{props.title}</p>
      {props.hint && <p className="mt-1 text-sm">{props.hint}</p>}
      {props.action && <div className="mt-3">{props.action}</div>}
    </div>
  );
}

/** Loading, error and empty handling shared by every data screen. */
export function QueryState<T>(props: {
  query: UseQueryResult<T>;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const { query } = props;
  if (query.isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="border-destructive/50 rounded-md border p-4" role="alert">
        <p className="font-medium">Chargement impossible</p>
        <p className="text-muted-foreground text-sm">{query.error.message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
          <RefreshCw /> Réessayer
        </Button>
      </div>
    );
  }
  if (props.isEmpty?.(query.data) && props.empty) return <>{props.empty}</>;
  return <>{props.children(query.data)}</>;
}

/** Wraps its control in a <label>; `group` is for several controls sharing one caption. */
export function Field(props: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
  group?: boolean;
}) {
  const className = cn('block space-y-1.5', props.className);
  const body = (
    <>
      <span className="text-sm font-medium">{props.label}</span>
      <span className="block">{props.children}</span>
      {props.hint && <span className="text-muted-foreground block text-xs">{props.hint}</span>}
    </>
  );
  if (props.group) {
    return (
      <div role="group" aria-label={props.label} className={className}>
        {body}
      </div>
    );
  }
  return (
    <label htmlFor={props.htmlFor} className={className}>
      {body}
    </label>
  );
}

export function NumberField(props: {
  label: string;
  hint?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
}) {
  return (
    <Field label={props.label} hint={props.hint}>
      <Input
        type="number"
        step={props.step}
        min={props.min}
        value={props.value ?? ''}
        placeholder="Par défaut"
        onChange={(event) =>
          props.onChange(event.target.value === '' ? null : Number(event.target.value))
        }
      />
    </Field>
  );
}

export function ConfirmButton(props: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {props.trigger(() => setOpen(true))}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{props.title}</AlertDialogTitle>
            <AlertDialogDescription>{props.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={props.onConfirm}>{props.confirmLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export const JsonView = ({ value, className }: { value: unknown; className?: string }) => (
  <pre
    className={cn(
      'bg-muted max-h-96 overflow-auto rounded-md p-3 font-mono text-xs break-words whitespace-pre-wrap',
      className,
    )}
  >
    {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
  </pre>
);

export const Stat = (props: { label: string; value: ReactNode }) => (
  <div>
    <p className="text-muted-foreground text-sm">{props.label}</p>
    <p className="font-display text-2xl font-semibold">{props.value}</p>
  </div>
);

export function KeyValueEditor(props: {
  label: string;
  hint?: string;
  existingKeys: string[];
  value: { key: string; value: string }[];
  onChange: (value: { key: string; value: string }[]) => void;
  keyPlaceholder: string;
}) {
  const { value, onChange } = props;
  const update = (index: number, patch: Partial<{ key: string; value: string }>) =>
    onChange(value.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  return (
    <Field group label={props.label} hint={props.hint}>
      {props.existingKeys.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {props.existingKeys.map((key) => (
            <Badge variant="secondary" key={key}>
              {key} : enregistré
            </Badge>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {value.map((item, index) => (
          <div className="flex gap-2" key={index}>
            <Input
              aria-label="Nom"
              placeholder={props.keyPlaceholder}
              value={item.key}
              onChange={(event) => update(index, { key: event.target.value })}
            />
            <Input
              aria-label="Valeur"
              type="password"
              autoComplete="off"
              placeholder="Valeur"
              value={item.value}
              onChange={(event) => update(index, { value: event.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(value.filter((_, at) => at !== index))}
            >
              Retirer
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, { key: '', value: '' }])}
        >
          Ajouter
        </Button>
      </div>
    </Field>
  );
}

export const pairsToMap = (pairs: { key: string; value: string }[]) =>
  pairs.length === 0
    ? undefined
    : Object.fromEntries(pairs.filter((pair) => pair.key).map((pair) => [pair.key, pair.value]));
