import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { McpTool, Room, ToolCallResult, ToolPolicy } from '@ayko/contracts';
import { mcpApi, roomApi } from '@/infrastructure/api';
import {
  ConfirmButton,
  EmptyState,
  Field,
  JsonView,
  Light,
  NumberField,
  PageHeader,
  Panel,
  QueryState,
  Section,
} from '@/presentation/components/common';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Checkbox } from '@/presentation/components/ui/checkbox';
import { Input } from '@/presentation/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select';
import { Switch } from '@/presentation/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs';
import { Textarea } from '@/presentation/components/ui/textarea';
import { useAction } from '@/presentation/hooks/useAction';
import { formatMs } from '@/shared/format';
import { ServerDialog } from './McpPage';

const POLICY_LABELS: Record<ToolPolicy, string> = {
  auto: 'Automatique',
  confirm: 'Confirmation requise',
  forbidden: 'Interdit',
};
const INHERIT = '__inherit';

interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
}

/** Form built from the tool's JSON schema; anything exotic falls back on raw JSON. */
function ToolTester({ tool }: { tool: McpTool }) {
  const schema = tool.inputSchema as {
    properties?: Record<string, SchemaProperty>;
    required?: string[];
  };
  const properties = Object.entries(schema.properties ?? {});
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<ToolCallResult | null>(null);
  const call = useAction(() => mcpApi.callTool(tool.id, values), {
    invalidate: ['mcp'],
    onDone: setResult,
  });
  const set = (name: string, value: unknown) =>
    setValues((current) => {
      const next = { ...current };
      if (value === '' || value === undefined) delete next[name];
      else next[name] = value;
      return next;
    });

  return (
    <div className="space-y-3">
      {properties.map(([name, property]) => {
        const label = `${name}${schema.required?.includes(name) ? ' (requis)' : ''}`;
        if (property.enum) {
          return (
            <Field key={name} label={label} hint={property.description}>
              <Select onValueChange={(value) => set(name, value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {property.enum.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          );
        }
        if (property.type === 'boolean') {
          return (
            <label key={name} className="flex items-center gap-2 text-sm">
              <Checkbox onCheckedChange={(value) => set(name, value === true)} /> {label}
            </label>
          );
        }
        if (property.type === 'number' || property.type === 'integer') {
          return (
            <NumberField
              key={name}
              label={label}
              hint={property.description}
              value={(values[name] as number) ?? null}
              onChange={(value) => set(name, value ?? undefined)}
            />
          );
        }
        if (property.type === 'string' || !property.type) {
          return (
            <Field key={name} label={label} hint={property.description}>
              <Input onChange={(event) => set(name, event.target.value)} />
            </Field>
          );
        }
        return (
          <Field key={name} label={label} hint="Valeur JSON">
            <Textarea
              rows={3}
              onChange={(event) => {
                try {
                  set(name, JSON.parse(event.target.value));
                } catch {
                  set(name, undefined);
                }
              }}
            />
          </Field>
        );
      })}
      <Button size="sm" disabled={call.isPending} onClick={() => call.mutate()}>
        Exécuter l'outil
      </Button>
      {result && (
        <div className="space-y-1">
          <Light
            state={result.isError ? 'down' : 'up'}
            label={`${result.isError ? 'Erreur' : 'Succès'}, ${formatMs(result.durationMs)}`}
          />
          <JsonView value={result.raw ?? result.text} />
        </div>
      )}
    </div>
  );
}

function ToolPolicyEditor({ tool, rooms }: { tool: McpTool; rooms: Room[] }) {
  const [alias, setAlias] = useState(tool.aliasName ?? '');
  const [description, setDescription] = useState(tool.customDescription ?? '');
  const [ttl, setTtl] = useState<number | null>(tool.cacheTtlSeconds);
  const update = useAction(
    (change: Parameters<typeof mcpApi.updatePolicy>[1]) => mcpApi.updatePolicy(tool.id, change),
    { success: 'Outil enregistré', invalidate: ['mcp'] },
  );
  const setOverride = (roomId: string, value: string) => {
    const others = tool.roomOverrides.filter((item) => item.roomId !== roomId);
    update.mutate({
      roomOverrides:
        value === INHERIT ? others : [...others, { roomId, policy: value as ToolPolicy }],
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={tool.enabled}
            onCheckedChange={(enabled) => update.mutate({ enabled })}
          />
          Outil activé
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={tool.cacheEnabled}
            onCheckedChange={(cacheEnabled) => update.mutate({ cacheEnabled })}
          />
          Raccourcis autorisés
        </label>
        <Field label="Autorisation" className="w-56">
          <Select
            value={tool.policy}
            onValueChange={(value) => update.mutate({ policy: value as ToolPolicy })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(POLICY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {rooms.length > 0 && (
        <Field
          group
          label="Règles par pièce"
          hint="Ex. : serrure autorisée seulement depuis l'entrée."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {rooms.map((room) => (
              <div key={room.id} className="flex items-center justify-between gap-2 text-sm">
                {room.name}
                <Select
                  value={
                    tool.roomOverrides.find((item) => item.roomId === room.id)?.policy ?? INHERIT
                  }
                  onValueChange={(value) => setOverride(room.id, value)}
                >
                  <SelectTrigger aria-label={`Règle pour ${room.name}`} className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT}>Règle générale</SelectItem>
                    {Object.entries(POLICY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </Field>
      )}
      <Field label="Nom présenté au modèle">
        <Input
          placeholder={tool.name}
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
        />
      </Field>
      <Field label="Description pour le modèle">
        <Textarea
          rows={2}
          placeholder={tool.description ?? ''}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      {tool.readOnly && (
        <NumberField
          label="Durée de vie du résultat (secondes)"
          hint="Vide : l'outil est toujours rappelé en direct."
          value={ttl}
          min={1}
          onChange={setTtl}
        />
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          update.mutate({
            aliasName: alias || null,
            customDescription: description || null,
            cacheTtlSeconds: ttl,
          })
        }
      >
        Enregistrer le nom et la description
      </Button>
    </div>
  );
}

export function McpServerPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const servers = useQuery({ queryKey: ['mcp', 'servers'], queryFn: mcpApi.servers });
  const explorer = useQuery({
    queryKey: ['mcp', 'explore', id],
    queryFn: () => mcpApi.explore(id),
  });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomApi.list });
  const server = servers.data?.find((item) => item.id === id);
  const remove = useAction(() => mcpApi.deleteServer(id), {
    success: 'Serveur supprimé',
    invalidate: ['mcp'],
    onDone: () => navigate('/mcp'),
  });

  return (
    <>
      <PageHeader
        title={server?.name ?? 'Serveur MCP'}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={!server}>
              Modifier
            </Button>
            <ConfirmButton
              title="Supprimer ce serveur ?"
              description="Ses outils et les raccourcis qui les utilisent seront invalidés."
              confirmLabel="Supprimer"
              onConfirm={() => remove.mutate()}
              trigger={(open) => (
                <Button variant="outline" size="sm" onClick={open}>
                  <Trash2 /> Supprimer
                </Button>
              )}
            />
          </>
        }
      />
      <QueryState query={explorer}>
        {(data) => (
          <>
            <Section title={`Outils (${data.tools.length})`}>
              {data.tools.length === 0 ? (
                <EmptyState title="Ce serveur n'expose aucun outil" />
              ) : (
                <div className="space-y-3">
                  {data.tools.map((tool) => (
                    <Panel key={tool.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{tool.aliasName ?? tool.name}</h3>
                        <Badge variant={tool.policy === 'auto' ? 'secondary' : 'default'}>
                          {POLICY_LABELS[tool.policy]}
                        </Badge>
                        {tool.readOnly && <Badge variant="outline">Lecture</Badge>}
                        {!tool.enabled && <Badge variant="destructive">Désactivé</Badge>}
                      </div>
                      <p className="text-muted-foreground mb-3 text-sm">
                        {tool.customDescription ?? tool.description}
                      </p>
                      <Tabs defaultValue="policy">
                        <TabsList>
                          <TabsTrigger value="policy">Politique</TabsTrigger>
                          <TabsTrigger value="test">Tester</TabsTrigger>
                          <TabsTrigger value="schema">Schéma</TabsTrigger>
                        </TabsList>
                        <TabsContent value="policy" className="pt-3">
                          <ToolPolicyEditor tool={tool} rooms={rooms.data ?? []} />
                        </TabsContent>
                        <TabsContent value="test" className="pt-3">
                          <ToolTester tool={tool} />
                        </TabsContent>
                        <TabsContent value="schema" className="pt-3">
                          <JsonView value={tool.inputSchema} />
                        </TabsContent>
                      </Tabs>
                    </Panel>
                  ))}
                </div>
              )}
            </Section>
            <Section title={`Ressources (${data.resources.length})`}>
              {data.resources.length > 0 && <JsonView value={data.resources} />}
            </Section>
            <Section title={`Prompts (${data.prompts.length})`}>
              {data.prompts.length > 0 && <JsonView value={data.prompts} />}
            </Section>
          </>
        )}
      </QueryState>
      {editing && server && <ServerDialog server={server} onClose={() => setEditing(false)} />}
    </>
  );
}
