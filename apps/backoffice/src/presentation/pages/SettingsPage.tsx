import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AgentSettings, ApiKeyCreated, LogLevel, SystemSettings } from '@ayko/contracts';
import { authApi, systemApi } from '@/infrastructure/api';
import {
  ConfirmButton,
  EmptyState,
  Field,
  JsonView,
  NumberField,
  PageHeader,
  QueryState,
  Section,
} from '@/presentation/components/common';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/presentation/components/ui/tabs';
import { useAction } from '@/presentation/hooks/useAction';
import { downloadFile, formatDate } from '@/shared/format';

function General() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: systemApi.settings });
  const [draft, setDraft] = useState<SystemSettings | null>(null);
  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);
  const save = useAction((value: SystemSettings) => systemApi.saveSettings(value), {
    success: 'Réglages enregistrés',
    invalidate: ['settings'],
  });
  const patch = (change: Partial<SystemSettings>) =>
    setDraft((value) => (value ? { ...value, ...change } : value));
  const agent = (change: Partial<AgentSettings>) =>
    setDraft((value) => (value ? { ...value, agent: { ...value.agent, ...change } } : value));
  return (
    <QueryState query={settings}>
      {() =>
        draft && (
          <div className="max-w-2xl">
            <Section title="Moteur">
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label="Itérations maximales"
                  min={1}
                  value={draft.agent.maxIterations}
                  onChange={(value) => agent({ maxIterations: value ?? 6 })}
                />
                <NumberField
                  label="Requêtes simultanées"
                  min={1}
                  hint="1 sur un modèle CPU"
                  value={draft.agent.maxConcurrentRequests}
                  onChange={(value) => agent({ maxConcurrentRequests: value ?? 1 })}
                />
                <NumberField
                  label="Délai par outil (ms)"
                  value={draft.agent.toolTimeoutMs}
                  onChange={(value) => agent({ toolTimeoutMs: value ?? 30000 })}
                />
                <NumberField
                  label="Délai total (ms)"
                  value={draft.agent.totalTimeoutMs}
                  onChange={(value) => agent({ totalTimeoutMs: value ?? 300000 })}
                />
                <NumberField
                  label="Délai de confirmation (s)"
                  value={draft.agent.confirmTimeoutSeconds}
                  onChange={(value) => agent({ confirmTimeoutSeconds: value ?? 60 })}
                />
                <NumberField
                  label="Messages d'historique envoyés"
                  min={0}
                  value={draft.agent.historyMessages}
                  onChange={(value) => agent({ historyMessages: value ?? 12 })}
                />
                <NumberField
                  label="Taille maximale d'un résultat d'outil"
                  value={draft.agent.toolResultMaxChars}
                  onChange={(value) => agent({ toolResultMaxChars: value ?? 4000 })}
                />
                <NumberField
                  label="Durée d'une session de tablette (min)"
                  hint="Une pièce reprend sa conversation dans ce délai"
                  min={1}
                  value={draft.agent.sessionMinutes}
                  onChange={(value) => agent({ sessionMinutes: value ?? 30 })}
                />
                <NumberField
                  label="Taille de la liste d'appareils"
                  hint="En caractères, envoyée avec chaque demande"
                  value={draft.agent.homeContextMaxChars}
                  onChange={(value) => agent({ homeContextMaxChars: value ?? 4000 })}
                />
                <NumberField
                  label="Souvenirs par demande"
                  min={1}
                  value={draft.agent.memoryMaxItems}
                  onChange={(value) => agent({ memoryMaxItems: value ?? 8 })}
                />
              </div>
              <label className="mt-3 flex items-center gap-2">
                <Switch
                  checked={draft.agent.routingEnabled}
                  onCheckedChange={(routingEnabled) => agent({ routingEnabled })}
                />
                Utiliser le modèle de routage
              </label>
              <label className="mt-3 flex items-center gap-2">
                <Switch
                  checked={draft.agent.memoryEnabled}
                  onCheckedChange={(memoryEnabled) => agent({ memoryEnabled })}
                />
                Utiliser les souvenirs
              </label>
            </Section>
            <Section title="Journaux et rétention">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Niveau de journal">
                  <Select
                    value={draft.logLevel}
                    onValueChange={(value) => patch({ logLevel: value as LogLevel })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['debug', 'info', 'warn', 'error'].map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Nom de l'occupant" hint="Variable {{user}} du prompt">
                  <Input
                    value={draft.ownerName}
                    onChange={(event) => patch({ ownerName: event.target.value })}
                  />
                </Field>
                <NumberField
                  label="Rétention des journaux (jours)"
                  min={1}
                  value={draft.logRetentionDays}
                  onChange={(value) => patch({ logRetentionDays: value ?? 14 })}
                />
                <NumberField
                  label="Rétention des traces (jours)"
                  min={1}
                  value={draft.traceRetentionDays}
                  onChange={(value) => patch({ traceRetentionDays: value ?? 30 })}
                />
              </div>
            </Section>
            <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
              Enregistrer
            </Button>
          </div>
        )
      }
    </QueryState>
  );
}

function Security() {
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: authApi.listKeys });
  const [name, setName] = useState('');
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const create = useAction((value: string) => authApi.createKey(value), {
    invalidate: ['api-keys'],
    onDone: (key) => {
      setCreated(key);
      setName('');
    },
  });
  const remove = useAction((id: string) => authApi.deleteKey(id), {
    success: 'Clé supprimée',
    invalidate: ['api-keys'],
  });
  const change = useAction(() => authApi.changePassword(current, next), {
    success: 'Mot de passe modifié',
    onDone: () => {
      setCurrent('');
      setNext('');
    },
  });
  return (
    <div className="max-w-2xl">
      <Section title="Mot de passe">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate();
          }}
        >
          <Field label="Mot de passe actuel">
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>
          <Field label="Nouveau mot de passe">
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="outline" disabled={!current || next.length < 8}>
            Modifier le mot de passe
          </Button>
        </form>
      </Section>
      <Section title="Clés d'API">
        <form
          className="mb-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(name);
          }}
        >
          <Input
            aria-label="Nom de la clé"
            placeholder="Nom de la clé"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={!name}>
            Créer la clé
          </Button>
        </form>
        {created && (
          <div className="mb-3">
            <p className="text-sm font-medium">Copiez cette clé, elle ne sera plus affichée :</p>
            <JsonView value={created.token} />
          </div>
        )}
        <QueryState
          query={keys}
          isEmpty={(data) => data.length === 0}
          empty={<EmptyState title="Aucune clé d'API" />}
        >
          {(data) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Préfixe</TableHead>
                  <TableHead>Dernier usage</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>{key.name}</TableCell>
                    <TableCell>{key.prefix}…</TableCell>
                    <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                    <TableCell className="text-right">
                      <ConfirmButton
                        title={`Supprimer ${key.name} ?`}
                        description="Les programmes qui l'utilisent perdront l'accès."
                        confirmLabel="Supprimer"
                        onConfirm={() => remove.mutate(key.id)}
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
    </div>
  );
}

function Backup() {
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [bundle, setBundle] = useState<unknown>(null);
  const input = useRef<HTMLInputElement>(null);
  const exportConfig = useAction(() => systemApi.exportConfig(includeSecrets), {
    onDone: (data) =>
      downloadFile(
        `ayko-config-${data.exportedAt.slice(0, 10)}.json`,
        JSON.stringify(data, null, 2),
      ),
  });
  const importConfig = useAction((value: unknown) => systemApi.importConfig(value), {
    success: 'Configuration restaurée',
    onDone: () => window.location.reload(),
  });
  const readFile = async (file: File | undefined) => {
    if (file) setBundle(JSON.parse(await file.text()));
  };
  return (
    <div className="max-w-2xl">
      <Section title="Sauvegarder" intro="Toute la configuration dans un fichier JSON.">
        <label className="mb-3 flex items-center gap-2 text-sm">
          <Checkbox
            checked={includeSecrets}
            onCheckedChange={(value) => setIncludeSecrets(value === true)}
          />
          Inclure les secrets, chiffrés : la même clé maîtresse sera nécessaire pour les relire
        </label>
        <Button onClick={() => exportConfig.mutate()}>Télécharger la sauvegarde</Button>
      </Section>
      <Section title="Restaurer" intro="Remplace la configuration actuelle.">
        <input
          ref={input}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => void readFile(event.target.files?.[0])}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => input.current?.click()}>
            Choisir un fichier
          </Button>
          <ConfirmButton
            title="Restaurer cette sauvegarde ?"
            description="La configuration actuelle sera remplacée et les serveurs MCP redémarrés."
            confirmLabel="Restaurer"
            onConfirm={() => importConfig.mutate(bundle)}
            trigger={(open) => (
              <Button variant="outline" disabled={!bundle} onClick={open}>
                Restaurer
              </Button>
            )}
          />
        </div>
      </Section>
    </div>
  );
}

function Audit() {
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => systemApi.audit() });
  return (
    <QueryState
      query={audit}
      isEmpty={(data) => data.items.length === 0}
      empty={<EmptyState title="Aucune action enregistrée" />}
    >
      {(data) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Auteur</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap">{formatDate(entry.ts)}</TableCell>
                <TableCell>{entry.actor}</TableCell>
                <TableCell>{entry.target ?? entry.action}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </QueryState>
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Réglages" />
      <Tabs defaultValue="general">
        <TabsList className="mb-4">
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="security">Sécurité</TabsTrigger>
          <TabsTrigger value="backup">Sauvegarde</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <General />
        </TabsContent>
        <TabsContent value="security">
          <Security />
        </TabsContent>
        <TabsContent value="backup">
          <Backup />
        </TabsContent>
        <TabsContent value="audit">
          <Audit />
        </TabsContent>
      </Tabs>
    </>
  );
}
