import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LogLevel } from '@ayko/contracts';
import { systemApi } from '@/infrastructure/api';
import { EmptyState, PageHeader } from '@/presentation/components/common';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select';
import { formatDate } from '@/shared/format';

const ALL = '__all';
const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export function LogsPage() {
  const [level, setLevel] = useState(ALL);
  const [component, setComponent] = useState('');
  const [requestId, setRequestId] = useState('');
  const [search, setSearch] = useState('');
  const filter = {
    level: level === ALL ? undefined : level,
    component,
    requestId,
    search,
  };
  const logs = useInfiniteQuery({
    queryKey: ['logs', filter],
    queryFn: ({ pageParam }) => systemApi.logs({ ...filter, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = logs.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <PageHeader
        title="Journaux"
        intro="Mis à jour en direct. La rétention se règle dans Réglages."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger aria-label="Niveau" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les niveaux</SelectItem>
            {LEVELS.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Composant"
          className="w-40"
          placeholder="Composant"
          value={component}
          onChange={(event) => setComponent(event.target.value)}
        />
        <Input
          aria-label="Identifiant de requête"
          className="w-72"
          placeholder="Identifiant de requête"
          value={requestId}
          onChange={(event) => setRequestId(event.target.value.trim())}
        />
        <Input
          aria-label="Rechercher"
          className="w-56"
          placeholder="Rechercher"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {logs.isError && <p role="alert">{logs.error.message}</p>}
      {!logs.isPending && items.length === 0 ? (
        <EmptyState title="Aucun journal pour ces filtres" />
      ) : (
        <ul className="bg-card divide-y rounded-md border text-sm">
          {items.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-1.5">
              <span className="text-muted-foreground whitespace-nowrap">
                {formatDate(entry.ts)}
              </span>
              <Badge variant={entry.level === 'error' ? 'destructive' : 'outline'}>
                {entry.level}
              </Badge>
              <span className="text-muted-foreground">{entry.component}</span>
              <span className="min-w-0 flex-1 break-words">{entry.message}</span>
              {entry.requestId && (
                <Link className="hover:underline" to={`/traces/${entry.requestId}`}>
                  Trace {entry.requestId.slice(0, 8)}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {logs.hasNextPage && (
        <Button variant="ghost" className="mt-2" onClick={() => void logs.fetchNextPage()}>
          Afficher plus
        </Button>
      )}
    </>
  );
}
