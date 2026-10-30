import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { McpServer, McpServerInput, McpTemplate, McpTransport } from '@ayko/contracts';
import { mcpApi } from '@/infrastructure/api';
import {
  EmptyState,
  Field,
  JsonView,
  KeyValueEditor,
  Light,
  PageHeader,
  pairsToMap,
  QueryState,
  Section,
  type Led,
} from '@/presentation/components/common';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
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
import { useAction } from '@/presentation/hooks/useAction';
import { formatDate, formatMs } from '@/shared/format';

const STATUS: Record<McpServer['status'], { led: Led; label: string }> = {
  connected: { led: 'up', label: 'Connecté' },
  connecting: { led: 'warn', label: 'Connexion…' },
  error: { led: 'down', label: 'Erreur' },
  disabled: { led: 'off', label: 'Désactivé' },
};

const pairsFromKeys = (keys: string[]) => keys.map((key) => ({ key, value: '' }));

export function ServerDialog(props: {
  server?: McpServer;
  template?: McpTemplate;
  onClose: () => void;
}) {
  const { server, template } = props;
  const initial: Partial<McpServerInput> = server ?? template?.input ?? {};
  const [name, setName] = useState(initial.name ?? '');
  const [transport, setTransport] = useState<McpTransport>(initial.transport ?? 'stdio');
  const [command, setCommand] = useState(initial.command ?? '');
  const [args, setArgs] = useState((initial.args ?? []).join(' '));
  const [url, setUrl] = useState(initial.url ?? '');
  const required = pairsFromKeys(template?.requiredSecrets ?? []);
  const [env, setEnv] = useState(transport === 'stdio' ? required : []);
  const [headers, setHeaders] = useState(transport === 'stdio' ? [] : required);

  const save = useAction(
    () => {
      const input: McpServerInput = {
        name,
        transport,
        command: transport === 'stdio' ? command : null,
        args: transport === 'stdio' ? args.split(/\s+/).filter(Boolean) : [],
        url: transport === 'stdio' ? null : url,
        env: pairsToMap(env),
        headers: pairsToMap(headers),
      };
      return server ? mcpApi.updateServer(server.id, input) : mcpApi.createServer(input);
    },
    { success: 'Serveur enregistré', invalidate: ['mcp'], onDone: props.onClose },
  );

  const stdio = transport === 'stdio';
  return (
    <Dialog open onOpenChange={props.onClose}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{server ? `Modifier ${server.name}` : 'Ajouter un serveur MCP'}</DialogTitle>
        </DialogHeader>
        {template && <p className="text-muted-foreground text-sm">{template.description}</p>}
        <div className="space-y-3">
          <Field label="Nom">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Transport">
            <Select
              value={transport}
              onValueChange={(value) => setTransport(value as McpTransport)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">stdio (commande locale)</SelectItem>
                <SelectItem value="http">HTTP streamable</SelectItem>
                <SelectItem value="sse">SSE</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {stdio ? (
            <>
              <Field label="Commande">
                <Input value={command} onChange={(event) => setCommand(event.target.value)} />
              </Field>
              <Field label="Arguments" hint="Séparés par des espaces">
                <Input value={args} onChange={(event) => setArgs(event.target.value)} />
              </Field>
              <KeyValueEditor
                label="Variables d'environnement"
                hint="Chiffrées. Remplir cette liste remplace les valeurs enregistrées."
                keyPlaceholder="API_KEY"
                existingKeys={server?.envNames ?? []}
                value={env}
                onChange={setEnv}
              />
            </>
          ) : (
            <>
              <Field label="URL">
                <Input value={url} onChange={(event) => setUrl(event.target.value)} />
              </Field>
              <KeyValueEditor
                label="En-têtes"
                hint="Chiffrés. Remplir cette liste remplace les valeurs enregistrées."
                keyPlaceholder="Authorization"
                existingKeys={server?.headerNames ?? []}
                value={headers}
                onChange={setHeaders}
              />
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={!name || (stdio ? !command : !url) || save.isPending}
            onClick={() => save.mutate()}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function McpPage() {
  const servers = useQuery({
    queryKey: ['mcp', 'servers'],
    queryFn: mcpApi.servers,
    refetchInterval: 15_000,
  });
  const templates = useQuery({ queryKey: ['mcp', 'templates'], queryFn: mcpApi.templates });
  const calls = useQuery({ queryKey: ['mcp', 'calls'], queryFn: () => mcpApi.calls({}) });
  const [dialog, setDialog] = useState<{ template?: McpTemplate } | null>(null);
  const toggle = useAction(
    (input: { id: string; enabled: boolean }) =>
      mcpApi.updateServer(input.id, { enabled: input.enabled }),
    { invalidate: ['mcp'] },
  );
  const restart = useAction((id: string) => mcpApi.restart(id), {
    success: 'Serveur redémarré',
    invalidate: ['mcp'],
  });

  return (
    <>
      <PageHeader
        title="Serveurs MCP"
        intro="Les outils qu'Ayko peut utiliser. Home Assistant est un serveur parmi d'autres."
        actions={
          <>
            {templates.data?.map((template) => (
              <Button
                key={template.id}
                variant="outline"
                size="sm"
                onClick={() => setDialog({ template })}
              >
                {template.name}
              </Button>
            ))}
            <Button size="sm" onClick={() => setDialog({})}>
              <Plus /> Ajouter
            </Button>
          </>
        }
      />
      <Section title="Serveurs">
        <QueryState
          query={servers}
          isEmpty={(data) => data.length === 0}
          empty={
            <EmptyState
              title="Aucun serveur MCP"
              hint="Partez d'un modèle ci-dessus ou ajoutez un serveur."
            />
          }
        >
          {(data) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serveur</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Outils</TableHead>
                  <TableHead>Latence</TableHead>
                  <TableHead>Actif</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((server) => (
                  <TableRow key={server.id}>
                    <TableCell>
                      <Link to={`/mcp/${server.id}`} className="font-medium hover:underline">
                        <Light state={STATUS[server.status].led} label={server.name} />
                      </Link>
                      {server.lastError && (
                        <p className="text-destructive max-w-md truncate text-xs">
                          {server.lastError}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{server.transport}</Badge>
                    </TableCell>
                    <TableCell>{server.toolCount}</TableCell>
                    <TableCell>{formatMs(server.latencyMs)}</TableCell>
                    <TableCell>
                      <Switch
                        aria-label={`Activer ${server.name}`}
                        checked={server.enabled}
                        onCheckedChange={(enabled) => toggle.mutate({ id: server.id, enabled })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => restart.mutate(server.id)}>
                        Redémarrer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </QueryState>
      </Section>
      <Section title="Journal des appels">
        <QueryState
          query={calls}
          isEmpty={(data) => data.items.length === 0}
          empty={<EmptyState title="Aucun appel d'outil pour l'instant" />}
        >
          {(data) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Outil</TableHead>
                  <TableHead>Origine</TableHead>
                  <TableHead>Durée</TableHead>
                  <TableHead>Requête</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(call.createdAt)}
                    </TableCell>
                    <TableCell>
                      <details>
                        <summary className="cursor-pointer">
                          <Light state={call.isError ? 'down' : 'up'} label={call.toolName} />
                        </summary>
                        <JsonView
                          className="mt-2 max-w-xl"
                          value={{ arguments: call.arguments, result: call.result }}
                        />
                      </details>
                    </TableCell>
                    <TableCell>
                      {call.roomName ?? (call.source === 'tester' ? 'Testeur' : '–')}
                    </TableCell>
                    <TableCell>{formatMs(call.durationMs)}</TableCell>
                    <TableCell>
                      {call.requestId ? (
                        <Link className="hover:underline" to={`/traces/${call.requestId}`}>
                          Voir la trace
                        </Link>
                      ) : (
                        '–'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </QueryState>
      </Section>
      {dialog && (
        <ServerDialog
          key={dialog.template?.id ?? 'custom'}
          template={dialog.template}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
