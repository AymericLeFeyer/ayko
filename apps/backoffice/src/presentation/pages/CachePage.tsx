import { useQuery } from '@tanstack/react-query';
import { Pin, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CacheEntry, CacheSettings, CacheStatus } from '@ayko/contracts';
import { cacheApi, mcpApi, roomApi } from '@/infrastructure/api';
import {
  ConfirmButton,
  EmptyState,
  Field,
  JsonView,
  NumberField,
  PageHeader,
  Panel,
  QueryState,
  Section,
  Stat,
} from '@/presentation/components/common';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Checkbox } from '@/presentation/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/presentation/components/ui/dialog';
import { Input } from '@/presentation/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select';
import { Switch } from '@/presentation/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs';
import { Textarea } from '@/presentation/components/ui/textarea';
import { useAction } from '@/presentation/hooks/useAction';
import { formatDate, formatMs, formatPercent } from '@/shared/format';

const STATUS: Record<CacheStatus, string> = {
  active: 'Actif',
  pinned: 'Épinglé',
  excluded: 'Exclu',
  doubtful: 'Douteux',
  invalidated: 'Invalidé',
};
const ALL = '__all';

function EntryDialog({ entry, onClose }: { entry: CacheEntry; onClose: () => void }) {
  const [aliases, setAliases] = useState(entry.aliases.join('\n'));
  const [response, setResponse] = useState(entry.response);
  const [ttl, setTtl] = useState(entry.ttlSeconds);
  const [status, setStatus] = useState(entry.status);
  const [global, setGlobal] = useState(entry.global);
  const [calls, setCalls] = useState(JSON.stringify(entry.calls, null, 2));
  const [callsError, setCallsError] = useState(false);
  const save = useAction(
    async () =>
      cacheApi.updateEntry(entry.id, {
        aliases: aliases.split('\n').filter(Boolean),
        response,
        ttlSeconds: ttl,
        status,
        global,
        calls: JSON.parse(calls) as CacheEntry['calls'],
      }),
    { success: 'Raccourci enregistré', invalidate: ['cache'], onDone: onClose },
  );
  const submit = () => {
    try {
      JSON.parse(calls);
      setCallsError(false);
      save.mutate();
    } catch {
      setCallsError(true);
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry.sampleText}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">Forme normalisée : {entry.normalizedText}</p>
        <div className="space-y-3">
          <Field label="Phrases équivalentes" hint="Une par ligne">
            <Textarea
              rows={3}
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
            />
          </Field>
          <Field
            label="Réponse mémorisée"
            hint={
              entry.kind === 'read'
                ? "Pour une lecture, c'est le résultat de l'outil qui est affiché."
                : undefined
            }
          >
            <Input value={response} onChange={(event) => setResponse(event.target.value)} />
          </Field>
          <Field label="Appels mémorisés (JSON)">
            <Textarea
              rows={6}
              className="font-mono text-xs"
              value={calls}
              aria-invalid={callsError}
              onChange={(event) => setCalls(event.target.value)}
            />
            {callsError && <p className="text-destructive text-sm">JSON invalide.</p>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Statut">
              <Select value={status} onValueChange={(value) => setStatus(value as CacheStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <NumberField label="Durée de vie (s)" value={ttl} min={1} onChange={setTtl} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={global} onCheckedChange={setGlobal} /> Valable pour toutes les pièces
          </label>
        </div>
        <DialogFooter>
          <Button disabled={save.isPending} onClick={submit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Entries() {
  const [roomId, setRoomId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CacheEntry | null>(null);
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomApi.list });
  const filter = {
    roomId: roomId === ALL ? undefined : roomId,
    status: status === ALL ? undefined : status,
    search,
  };
  const entries = useQuery({
    queryKey: ['cache', 'entries', filter],
    queryFn: () => cacheApi.entries(filter),
  });
  const pin = useAction((id: string) => cacheApi.pin(id), { invalidate: ['cache'] });
  const remove = useAction((id: string) => cacheApi.deleteEntry(id), {
    success: 'Raccourci supprimé',
    invalidate: ['cache'],
  });
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          aria-label="Rechercher"
          className="max-w-xs"
          placeholder="Rechercher une phrase"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select value={roomId} onValueChange={setRoomId}>
          <SelectTrigger aria-label="Pièce" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les pièces</SelectItem>
            {rooms.data?.map((room) => (
              <SelectItem key={room.id} value={room.id}>
                {room.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Statut" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les statuts</SelectItem>
            {Object.entries(STATUS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <QueryState
        query={entries}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            title="Aucun raccourci"
            hint="Ayko en crée un après chaque action réussie via le modèle."
          />
        }
      >
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phrase</TableHead>
                <TableHead>Pièce</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Utilisations</TableHead>
                <TableHead>Dernière fois</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="max-w-72 truncate">
                    <button className="hover:underline" onClick={() => setEditing(entry)}>
                      {entry.sampleText}
                    </button>
                  </TableCell>
                  <TableCell>{entry.global ? 'Toutes' : (entry.roomName ?? '–')}</TableCell>
                  <TableCell>{entry.kind === 'action' ? 'Action' : 'Lecture'}</TableCell>
                  <TableCell className="space-x-1">
                    <Badge variant={entry.status === 'doubtful' ? 'destructive' : 'secondary'}>
                      {STATUS[entry.status]}
                    </Badge>
                    {entry.inTopN && <Badge variant="outline">En mémoire</Badge>}
                  </TableCell>
                  <TableCell>{entry.hits}</TableCell>
                  <TableCell>{formatDate(entry.lastHitAt)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={entry.status === 'pinned' ? 'Désépingler' : 'Épingler'}
                      aria-pressed={entry.status === 'pinned'}
                      onClick={() => pin.mutate(entry.id)}
                    >
                      <Pin />
                    </Button>
                    <ConfirmButton
                      title="Supprimer ce raccourci ?"
                      description="La prochaine demande repassera par le modèle. L'historique est conservé."
                      confirmLabel="Supprimer"
                      onConfirm={() => remove.mutate(entry.id)}
                      trigger={(open) => (
                        <Button variant="ghost" size="icon" aria-label="Supprimer" onClick={open}>
                          <Trash2 />
                        </Button>
                      )}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </QueryState>
      {editing && <EntryDialog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function SettingsForm() {
  const settings = useQuery({ queryKey: ['cache', 'settings'], queryFn: cacheApi.settings });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomApi.list });
  const [draft, setDraft] = useState<CacheSettings | null>(null);
  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);
  const save = useAction((value: CacheSettings) => cacheApi.saveSettings(value), {
    success: 'Réglages enregistrés',
    invalidate: ['cache'],
  });
  const patch = (change: Partial<CacheSettings>) =>
    setDraft((value) => (value ? { ...value, ...change } : value));

  return (
    <QueryState query={settings}>
      {() =>
        draft && (
          <div className="max-w-2xl space-y-4">
            <label className="flex items-center gap-2">
              <Switch checked={draft.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
              Utiliser les raccourcis
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={draft.approximateEnabled}
                onCheckedChange={(approximateEnabled) => patch({ approximateEnabled })}
              />
              Reconnaître les phrases proches (modèle d'embeddings)
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                label="Seuil de similarité"
                step={0.01}
                value={draft.similarityThreshold}
                onChange={(value) => patch({ similarityThreshold: value ?? 0.88 })}
              />
              <NumberField
                label="Raccourcis prioritaires en mémoire"
                value={draft.topN}
                onChange={(value) => patch({ topN: value ?? 50 })}
              />
              <NumberField
                label="Occurrences avant promotion"
                value={draft.minOccurrences}
                min={1}
                onChange={(value) => patch({ minOccurrences: value ?? 3 })}
              />
              <NumberField
                label="Échecs avant invalidation"
                value={draft.maxFailures}
                min={1}
                onChange={(value) => patch({ maxFailures: value ?? 3 })}
              />
              <NumberField
                label="Rétention de l'historique (jours)"
                value={draft.historyRetentionDays}
                min={1}
                onChange={(value) => patch({ historyRetentionDays: value ?? 90 })}
              />
              <Field label="Réponse par défaut">
                <Input
                  value={draft.defaultResponse}
                  onChange={(event) => patch({ defaultResponse: event.target.value })}
                />
              </Field>
            </div>
            <Field group label="Pièces sans raccourcis">
              <div className="grid grid-cols-2 gap-1">
                {rooms.data?.map((room) => (
                  <label key={room.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.disabledRoomIds.includes(room.id)}
                      onCheckedChange={(checked) =>
                        patch({
                          disabledRoomIds:
                            checked === true
                              ? [...draft.disabledRoomIds, room.id]
                              : draft.disabledRoomIds.filter((id) => id !== room.id),
                        })
                      }
                    />
                    {room.name}
                  </label>
                ))}
              </div>
            </Field>
            <p className="text-muted-foreground text-sm">
              Les interrupteurs par outil se trouvent sur la page de chaque serveur MCP.
            </p>
            <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
              Enregistrer
            </Button>
          </div>
        )
      }
    </QueryState>
  );
}

function ClearSection() {
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomApi.list });
  const servers = useQuery({ queryKey: ['mcp', 'servers'], queryFn: mcpApi.servers });
  const tools = useQuery({ queryKey: ['mcp', 'tools'], queryFn: mcpApi.allTools });
  const [roomId, setRoomId] = useState(ALL);
  const [serverId, setServerId] = useState(ALL);
  const [toolId, setToolId] = useState(ALL);
  const [includeHistory, setIncludeHistory] = useState(false);
  const clear = useAction(
    () =>
      cacheApi.clear({
        roomId: roomId === ALL ? undefined : roomId,
        serverId: serverId === ALL ? undefined : serverId,
        toolId: toolId === ALL ? undefined : toolId,
        includeHistory,
      }),
    { success: 'Raccourcis vidés', invalidate: ['cache', 'history'] },
  );
  const pick = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    options: { id: string; name: string }[],
  ) => (
    <Field label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
  return (
    <Section
      title="Vider les raccourcis"
      intro="Par défaut, l'historique et ses compteurs sont conservés."
    >
      <div className="flex flex-wrap items-end gap-3">
        {pick('Pièce', roomId, setRoomId, rooms.data ?? [])}
        {pick('Serveur MCP', serverId, setServerId, servers.data ?? [])}
        {pick('Outil', toolId, setToolId, tools.data ?? [])}
        <ConfirmButton
          title="Vider ces raccourcis ?"
          description={
            includeHistory
              ? "Les raccourcis et l'historique correspondant seront définitivement supprimés."
              : "Les prochaines demandes repasseront par le modèle. L'historique est conservé."
          }
          confirmLabel="Vider"
          onConfirm={() => clear.mutate()}
          trigger={(open) => (
            <Button variant="outline" onClick={open}>
              Vider
            </Button>
          )}
        />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <Checkbox
          checked={includeHistory}
          onCheckedChange={(value) => setIncludeHistory(value === true)}
        />
        Supprimer aussi l'historique
      </label>
    </Section>
  );
}

export function CachePage() {
  const stats = useQuery({ queryKey: ['cache', 'stats'], queryFn: cacheApi.stats });
  return (
    <>
      <PageHeader
        title="Raccourcis"
        intro="Les demandes fréquentes rejouées sans repasser par le modèle."
      />
      <Section title="Statistiques">
        <QueryState query={stats}>
          {(data) => (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <Stat label="Taux de succès" value={formatPercent(data.hitRate)} />
                <Stat label="Utilisés / manqués" value={`${data.hits} / ${data.misses}`} />
                <Stat label="Temps gagné en moyenne" value={formatMs(data.avgSavedMs)} />
                <Stat label="Raccourcis" value={data.entries} />
                <Stat label="En mémoire" value={data.inMemory} />
              </div>
              {data.doubtful.length > 0 && (
                <Panel className="mt-4">
                  <p className="font-medium">Raccourcis douteux</p>
                  <JsonView value={data.doubtful.map((entry) => entry.sampleText)} />
                </Panel>
              )}
            </>
          )}
        </QueryState>
      </Section>
      <Tabs defaultValue="entries">
        <TabsList className="mb-4">
          <TabsTrigger value="entries">Raccourcis</TabsTrigger>
          <TabsTrigger value="settings">Réglages</TabsTrigger>
          <TabsTrigger value="clear">Vidage</TabsTrigger>
        </TabsList>
        <TabsContent value="entries">
          <Entries />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsForm />
        </TabsContent>
        <TabsContent value="clear">
          <ClearSection />
        </TabsContent>
      </Tabs>
    </>
  );
}
