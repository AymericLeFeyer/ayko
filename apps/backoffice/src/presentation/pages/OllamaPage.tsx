import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ModelRole, ModelTestEvent, OllamaEndpoint, OllamaModel } from '@ayko/contracts';
import { ollamaApi } from '@/infrastructure/api';
import {
  ConfirmButton,
  EmptyState,
  Field,
  HostLoad,
  JsonView,
  KeyValueEditor,
  Light,
  NumberField,
  PageHeader,
  pairsToMap,
  Panel,
  QueryState,
  Section,
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
import { Progress } from '@/presentation/components/ui/progress';
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
import { formatBytes, formatDate, formatMs, formatRate } from '@/shared/format';

export function OllamaPage() {
  const endpoints = useQuery({ queryKey: ['ollama', 'endpoints'], queryFn: ollamaApi.endpoints });
  if (endpoints.isPending) return null;
  return (
    <>
      <PageHeader title="Ollama" intro="Serveurs Ollama, modèles et rôles confiés à chacun." />
      {/* Nothing else works without a server, so a fresh install starts on that tab. */}
      <Tabs defaultValue={endpoints.data?.length ? 'models' : 'endpoints'}>
        <TabsList className="mb-4">
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="models">Modèles</TabsTrigger>
          <TabsTrigger value="roles">Rôles</TabsTrigger>
          <TabsTrigger value="test">Test de modèle</TabsTrigger>
        </TabsList>
        <TabsContent value="models">
          <Models />
        </TabsContent>
        <TabsContent value="roles">
          <Roles />
        </TabsContent>
        <TabsContent value="endpoints">
          <Endpoints />
        </TabsContent>
        <TabsContent value="test">
          <ModelTest />
        </TabsContent>
      </Tabs>
    </>
  );
}

const useModels = () => useQuery({ queryKey: ['ollama', 'models'], queryFn: ollamaApi.models });

function Models() {
  const models = useModels();
  const running = useQuery({
    queryKey: ['ollama', 'running'],
    queryFn: ollamaApi.running,
    refetchInterval: 10_000,
  });
  const [detail, setDetail] = useState<string | null>(null);
  const remove = useAction((name: string) => ollamaApi.deleteModel(name), {
    success: 'Modèle supprimé',
    invalidate: ['ollama'],
  });

  return (
    <>
      <Pull />
      <Section title="Modèles installés">
        <QueryState
          query={models}
          isEmpty={(data) => data.length === 0}
          empty={<EmptyState title="Aucun modèle installé" hint="Téléchargez-en un ci-dessus." />}
        >
          {(data) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modèle</TableHead>
                  <TableHead>Taille</TableHead>
                  <TableHead>Modifié</TableHead>
                  <TableHead>Capacités</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((model) => (
                  <TableRow key={model.name}>
                    <TableCell>
                      <button
                        className="font-medium hover:underline"
                        onClick={() => setDetail(model.name)}
                      >
                        {model.name}
                      </button>
                    </TableCell>
                    <TableCell>{formatBytes(model.sizeBytes)}</TableCell>
                    <TableCell>{formatDate(model.modifiedAt)}</TableCell>
                    <TableCell className="space-x-1">
                      <Capabilities model={model} />
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfirmButton
                        title={`Supprimer ${model.name} ?`}
                        description="Le modèle devra être retéléchargé pour être réutilisé."
                        confirmLabel="Supprimer"
                        onConfirm={() => remove.mutate(model.name)}
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
      </Section>
      <Section title="Chargés en mémoire">
        <QueryState
          query={running}
          isEmpty={(data) => data.length === 0}
          empty={<EmptyState title="Aucun modèle chargé" />}
        >
          {(data) => (
            <Panel className="p-0">
              <ul className="divide-y">
                {data.map((model) => (
                  <li key={model.name} className="flex justify-between gap-3 px-4 py-2">
                    <span className="font-medium">{model.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {formatBytes(model.sizeBytes)}, déchargé {formatDate(model.expiresAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </QueryState>
      </Section>
      {detail && <ModelDetail name={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

const Capabilities = ({ model }: { model: OllamaModel }) => (
  <>
    <Badge variant={model.supportsTools ? 'default' : 'outline'}>
      {model.supportsTools ? 'Outils natifs' : 'Outils par invite'}
    </Badge>
    {model.supportsVision && <Badge variant="secondary">Vision</Badge>}
    {model.supportsEmbedding && <Badge variant="secondary">Embeddings</Badge>}
  </>
);

function ModelDetail({ name, onClose }: { name: string; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['ollama', 'model', name],
    queryFn: () => ollamaApi.model(name),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>
        <QueryState query={detail}>
          {(data) => (
            <div className="space-y-3 text-sm">
              <p>
                Famille {data.family ?? 'inconnue'}, contexte maximal{' '}
                {data.contextLength ?? 'inconnu'}
              </p>
              <JsonView value={data.parameters ?? 'Aucun paramètre'} />
              <JsonView value={data.template ?? 'Aucun gabarit'} />
            </div>
          )}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}

function Pull() {
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<{ status: string; percent: number | null } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const models = useModels();

  const start = async () => {
    controller.current = new AbortController();
    setProgress({ status: 'Démarrage', percent: null });
    try {
      for await (const event of ollamaApi.pull(name, controller.current.signal)) {
        if (event.error) throw new Error(event.error);
        setProgress({
          status: event.status,
          percent: event.total ? ((event.completed ?? 0) / event.total) * 100 : null,
        });
      }
      toast.success(`${name} téléchargé`);
      setName('');
      void models.refetch();
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast.error((error as Error).message);
    }
    setProgress(null);
  };

  return (
    <Section title="Télécharger un modèle">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        <Input
          aria-label="Nom du modèle"
          className="max-w-sm"
          placeholder="qwen2.5:7b"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={progress !== null}
        />
        {progress ? (
          <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>
            Interrompre
          </Button>
        ) : (
          <Button type="submit" disabled={!name}>
            Télécharger
          </Button>
        )}
      </form>
      {progress && (
        <div className="mt-3 max-w-sm space-y-1" aria-live="polite">
          <Progress value={progress.percent ?? 0} />
          <p className="text-muted-foreground text-sm">
            {progress.status}
            {progress.percent !== null && `, ${Math.round(progress.percent)} %`}
          </p>
        </div>
      )}
    </Section>
  );
}

const ROLE_LABELS: Record<ModelRole['role'], { title: string; hint: string }> = {
  conversation: { title: 'Conversation', hint: 'Répond et appelle les outils.' },
  routing: { title: 'Routage', hint: 'Petit modèle rapide : décide si les outils sont utiles.' },
  embeddings: { title: 'Embeddings', hint: 'Sert à la correspondance approchée des raccourcis.' },
  vision: { title: 'Vision', hint: 'Optionnel.' },
};
const NONE = '__none';

function Roles() {
  const roles = useQuery({ queryKey: ['ollama', 'roles'], queryFn: ollamaApi.roles });
  const models = useModels();
  const [draft, setDraft] = useState<ModelRole[] | null>(null);
  useEffect(() => {
    if (roles.data) setDraft(roles.data);
  }, [roles.data]);
  const save = useAction((value: ModelRole[]) => ollamaApi.saveRoles(value), {
    success: 'Rôles enregistrés, actifs dès la prochaine requête',
    invalidate: ['ollama'],
  });
  const patch = (index: number, change: Partial<ModelRole>) =>
    setDraft(
      (current) =>
        current?.map((role, at) => (at === index ? { ...role, ...change } : role)) ?? null,
    );
  const patchParams = (index: number, change: Partial<ModelRole['params']>) => {
    const role = draft?.[index];
    if (role) patch(index, { params: { ...role.params, ...change } });
  };

  return (
    <QueryState query={roles}>
      {() => (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {draft?.map((role, index) => (
              <Panel key={role.role} className="space-y-3">
                <div>
                  <h3 className="font-semibold">{ROLE_LABELS[role.role].title}</h3>
                  <p className="text-muted-foreground text-sm">{ROLE_LABELS[role.role].hint}</p>
                </div>
                <Select
                  value={role.model ?? NONE}
                  onValueChange={(value) => patch(index, { model: value === NONE ? null : value })}
                >
                  <SelectTrigger
                    aria-label={`Modèle ${ROLE_LABELS[role.role].title}`}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Aucun</SelectItem>
                    {models.data?.map((model) => (
                      <SelectItem key={model.name} value={model.name}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Température"
                    step={0.1}
                    value={role.params.temperature}
                    onChange={(temperature) => patchParams(index, { temperature })}
                  />
                  <NumberField
                    label="num_ctx"
                    value={role.params.numCtx}
                    onChange={(numCtx) => patchParams(index, { numCtx })}
                  />
                  <NumberField
                    label="top_p"
                    step={0.05}
                    value={role.params.topP}
                    onChange={(topP) => patchParams(index, { topP })}
                  />
                  <NumberField
                    label="Jetons maximum"
                    value={role.params.maxTokens}
                    onChange={(maxTokens) => patchParams(index, { maxTokens })}
                  />
                  <Field label="keep_alive">
                    <Input
                      placeholder="5m"
                      value={role.params.keepAlive ?? ''}
                      onChange={(event) =>
                        patchParams(index, { keepAlive: event.target.value || null })
                      }
                    />
                  </Field>
                </div>
                <Field label="Prompt système spécifique">
                  <Textarea
                    rows={2}
                    value={role.params.systemPrompt ?? ''}
                    onChange={(event) =>
                      patchParams(index, { systemPrompt: event.target.value || null })
                    }
                  />
                </Field>
              </Panel>
            ))}
          </div>
          <Button
            className="mt-4"
            disabled={save.isPending}
            onClick={() => draft && save.mutate(draft)}
          >
            Enregistrer les rôles
          </Button>
        </>
      )}
    </QueryState>
  );
}

function EndpointDialog(props: { endpoint: OllamaEndpoint | null; onClose: () => void }) {
  const { endpoint } = props;
  const [name, setName] = useState(endpoint?.name ?? '');
  const [url, setUrl] = useState(endpoint?.url ?? 'http://localhost:11434');
  const [priority, setPriority] = useState<number | null>(endpoint?.priority ?? 0);
  const [timeout, setTimeoutMs] = useState<number | null>(endpoint?.connectTimeoutMs ?? 3000);
  const [metricsUrl, setMetricsUrl] = useState(endpoint?.metricsUrl ?? '');
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const save = useAction(
    () => {
      const input = {
        name,
        url,
        priority: priority ?? 0,
        connectTimeoutMs: timeout ?? 3000,
        metricsUrl: metricsUrl || null,
        headers: pairsToMap(headers),
      };
      return endpoint
        ? ollamaApi.updateEndpoint(endpoint.id, input)
        : ollamaApi.createEndpoint(input);
    },
    { success: 'Endpoint enregistré', invalidate: ['ollama'], onDone: props.onClose },
  );
  return (
    <Dialog open onOpenChange={props.onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{endpoint ? 'Modifier l’endpoint' : 'Ajouter un endpoint'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nom">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="URL">
            <Input value={url} onChange={(event) => setUrl(event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Priorité"
              hint="0 passe en premier"
              value={priority}
              onChange={setPriority}
            />
            <NumberField label="Délai de connexion (ms)" value={timeout} onChange={setTimeoutMs} />
          </div>
          <Field
            label="URL des métriques"
            hint="node_exporter, pour afficher le CPU et la RAM. Vide : même adresse qu'Ollama, port 9100."
          >
            <Input
              placeholder="http://192.168.1.20:9100/metrics"
              value={metricsUrl}
              onChange={(event) => setMetricsUrl(event.target.value)}
            />
          </Field>
          <KeyValueEditor
            label="En-têtes d'authentification"
            hint="Chiffrés. Remplir cette liste remplace les en-têtes enregistrés."
            keyPlaceholder="Authorization"
            existingKeys={endpoint?.headerNames ?? []}
            value={headers}
            onChange={setHeaders}
          />
        </div>
        <DialogFooter>
          <Button disabled={!name || !url || save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Endpoints() {
  const endpoints = useQuery({ queryKey: ['ollama', 'endpoints'], queryFn: ollamaApi.endpoints });
  const [editing, setEditing] = useState<OllamaEndpoint | 'new' | null>(null);
  const invalidate = ['ollama', 'metrics'];
  const test = useAction((id: string) => ollamaApi.testEndpoint(id), {
    invalidate,
    onDone: (result) => {
      if (result.ok)
        toast.success(`Connecté à Ollama ${result.version}, ${formatMs(result.latencyMs)}`);
      else toast.error(`Échec : ${result.error}`);
    },
  });
  const toggle = useAction(
    (input: { id: string; enabled: boolean }) =>
      ollamaApi.updateEndpoint(input.id, { enabled: input.enabled }),
    { invalidate },
  );
  const remove = useAction((id: string) => ollamaApi.deleteEndpoint(id), {
    success: 'Endpoint supprimé',
    invalidate,
  });
  return (
    <Section
      title="Endpoints"
      intro="En cas de panne, Ayko bascule sur le suivant par ordre de priorité."
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus /> Ajouter
        </Button>
      }
    >
      <QueryState
        query={endpoints}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title="Aucun endpoint" hint="Ajoutez l'adresse de votre serveur Ollama." />
        }
      >
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Latence</TableHead>
                <TableHead>Machine</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  <TableCell>
                    <Light
                      state={
                        endpoint.lastStatus === 'up'
                          ? 'up'
                          : endpoint.lastStatus === 'down'
                            ? 'down'
                            : 'off'
                      }
                      label={endpoint.name}
                    />
                  </TableCell>
                  <TableCell>{endpoint.url}</TableCell>
                  <TableCell>{endpoint.priority}</TableCell>
                  <TableCell>{formatMs(endpoint.lastLatencyMs)}</TableCell>
                  <TableCell>
                    {endpoint.host ? (
                      <HostLoad host={endpoint.host} />
                    ) : (
                      <span className="text-muted-foreground text-sm">Métriques indisponibles</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`Activer ${endpoint.name}`}
                      checked={endpoint.enabled}
                      onCheckedChange={(enabled) => toggle.mutate({ id: endpoint.id, enabled })}
                    />
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button variant="outline" size="sm" onClick={() => test.mutate(endpoint.id)}>
                      Tester
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(endpoint)}>
                      Modifier
                    </Button>
                    <ConfirmButton
                      title={`Supprimer ${endpoint.name} ?`}
                      description="Ayko ne pourra plus utiliser ce serveur."
                      confirmLabel="Supprimer"
                      onConfirm={() => remove.mutate(endpoint.id)}
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
      {editing && (
        <EndpointDialog
          key={editing === 'new' ? 'new' : editing.id}
          endpoint={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Section>
  );
}

type TestResult = {
  text: string;
  done?: Extract<ModelTestEvent, { type: 'done' }>;
  error?: string;
};

function ModelTest() {
  const models = useModels();
  const [left, setLeft] = useState('');
  const [right, setRight] = useState(NONE);
  const [prompt, setPrompt] = useState('Présente-toi en une phrase.');
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [running, setRunning] = useState(false);

  /** One after the other: a CPU box comparing two models in parallel measures nothing. */
  const run = async () => {
    setRunning(true);
    setResults({});
    for (const model of [left, right].filter((item) => item && item !== NONE)) {
      let current: TestResult = { text: '' };
      for await (const event of ollamaApi.test({ model, prompt })) {
        if (event.type === 'delta') current = { ...current, text: current.text + event.text };
        else if (event.type === 'done') current = { ...current, done: event };
        else current = { ...current, error: event.message };
        const snapshot = current;
        setResults((value) => ({ ...value, [model]: snapshot }));
      }
    }
    setRunning(false);
  };

  const pick = (
    value: string,
    onChange: (next: string) => void,
    label: string,
    optional = false,
  ) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-64">
        <SelectValue placeholder="Choisir un modèle" />
      </SelectTrigger>
      <SelectContent>
        {optional && <SelectItem value={NONE}>Pas de comparaison</SelectItem>}
        {models.data?.map((model) => (
          <SelectItem key={model.name} value={model.name}>
            {model.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Section
      title="Test de modèle"
      intro="Mesure le premier jeton, le débit et la mémoire utilisée."
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {pick(left, setLeft, 'Premier modèle')}
        {pick(right, setRight, 'Second modèle', true)}
      </div>
      <Textarea
        rows={3}
        aria-label="Prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <Button className="mt-3" disabled={!left || !prompt || running} onClick={() => void run()}>
        {running ? 'Test en cours…' : 'Lancer le test'}
      </Button>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {Object.entries(results).map(([model, result]) => (
          <Panel key={model}>
            <h3 className="font-semibold">{model}</h3>
            <p className="my-2 whitespace-pre-wrap">{result.text}</p>
            {result.error && <p className="text-destructive text-sm">{result.error}</p>}
            {result.done && (
              <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 text-sm">
                <dt>Premier jeton</dt>
                <dd>{formatMs(result.done.ttftMs)}</dd>
                <dt>Débit</dt>
                <dd>{formatRate(result.done.tokensPerSecond)}</dd>
                <dt>Durée totale</dt>
                <dd>{formatMs(result.done.totalMs)}</dd>
                <dt>Mémoire</dt>
                <dd>{formatBytes(result.done.memoryBytes)}</dd>
              </dl>
            )}
          </Panel>
        ))}
      </div>
    </Section>
  );
}
