import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { cacheApi, mcpApi, roomApi } from '@/infrastructure/api';
import { EmptyState, Field, JsonView, PageHeader } from '@/presentation/components/common';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table';
import { useAction } from '@/presentation/hooks/useAction';
import { formatDate, formatMs } from '@/shared/format';

const ALL = '__all';

function Filter(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={props.label}>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous</SelectItem>
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

export function HistoryPage() {
  const [roomId, setRoomId] = useState(ALL);
  const [tool, setTool] = useState(ALL);
  const [server, setServer] = useState(ALL);
  const [from, setFrom] = useState('');
  const [sort, setSort] = useState<'occurrences' | 'recent'>('occurrences');

  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomApi.list });
  const tools = useQuery({ queryKey: ['mcp', 'tools'], queryFn: mcpApi.allTools });
  const filter = {
    roomId: roomId === ALL ? undefined : roomId,
    tool: tool === ALL ? undefined : tool,
    server: server === ALL ? undefined : server,
    from: from ? new Date(from).toISOString() : undefined,
    sort,
  };
  const history = useInfiniteQuery({
    queryKey: ['history', filter],
    queryFn: ({ pageParam }) => cacheApi.history({ ...filter, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const promote = useAction((id: string) => cacheApi.promote(id), {
    success: 'Raccourci épinglé',
    invalidate: ['history', 'cache'],
  });
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const servers = [...new Set(tools.data?.map((item) => item.serverName))];

  return (
    <>
      <PageHeader
        title="Historique"
        intro="Les demandes qui ont abouti à des appels d'outils, regroupées quand elles sont identiques."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Filter
          label="Pièce"
          value={roomId}
          onChange={setRoomId}
          options={(rooms.data ?? []).map((room) => ({ value: room.id, label: room.name }))}
        />
        <Filter
          label="Outil"
          value={tool}
          onChange={setTool}
          options={(tools.data ?? []).map((item) => ({ value: item.name, label: item.name }))}
        />
        <Filter
          label="Serveur MCP"
          value={server}
          onChange={setServer}
          options={servers.map((name) => ({ value: name, label: name }))}
        />
        <Field label="Depuis le">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="Tri">
          <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="occurrences">Les plus fréquentes</SelectItem>
              <SelectItem value="recent">Les plus récentes</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {history.isError && <p role="alert">{history.error.message}</p>}
      {!history.isPending && items.length === 0 ? (
        <EmptyState
          title="Aucune demande"
          hint="Les demandes avec appels d'outils apparaîtront ici."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Demande</TableHead>
              <TableHead>Pièce</TableHead>
              <TableHead>Occurrences</TableHead>
              <TableHead>Durée moyenne</TableHead>
              <TableHead>Dernière fois</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="max-w-96">
                  <details>
                    <summary className="cursor-pointer">{item.rawText}</summary>
                    <JsonView className="mt-2" value={item.calls} />
                  </details>
                </TableCell>
                <TableCell>{item.roomName ?? '–'}</TableCell>
                <TableCell>{item.occurrences}</TableCell>
                <TableCell>{formatMs(item.avgDurationMs)}</TableCell>
                <TableCell>{formatDate(item.lastSeenAt)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => promote.mutate(item.id)}>
                    Promouvoir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {history.hasNextPage && (
        <Button variant="ghost" className="mt-2" onClick={() => void history.fetchNextPage()}>
          Afficher plus
        </Button>
      )}
    </>
  );
}
