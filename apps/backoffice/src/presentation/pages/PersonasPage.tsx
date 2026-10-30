import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Persona, PersonaFields } from '@ayko/contracts';
import { personaApi, roomApi } from '@/infrastructure/api';
import {
  ConfirmButton,
  Field,
  JsonView,
  PageHeader,
  Panel,
  QueryState,
  Section,
} from '@/presentation/components/common';
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
import { Textarea } from '@/presentation/components/ui/textarea';
import { useAction } from '@/presentation/hooks/useAction';
import { formatDate } from '@/shared/format';

const NO_ROOM = '__none';
const VARIABLES = ['date', 'time', 'room', 'user', 'devices', 'language', 'length', 'address'];

function Editor({ persona }: { persona: Persona }) {
  const [draft, setDraft] = useState<PersonaFields>(persona);
  const [roomId, setRoomId] = useState(NO_ROOM);
  useEffect(() => setDraft(persona), [persona]);

  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomApi.list });
  const versions = useQuery({
    queryKey: ['personas', persona.id, 'versions'],
    queryFn: () => personaApi.versions(persona.id),
  });
  const preview = useQuery({
    queryKey: ['personas', 'preview', persona.id, draft, roomId],
    queryFn: () =>
      personaApi.preview(persona.id, { draft, roomId: roomId === NO_ROOM ? null : roomId }),
  });
  const set = (patch: Partial<PersonaFields>) => setDraft((current) => ({ ...current, ...patch }));
  const save = useAction(() => personaApi.update(persona.id, draft), {
    success: 'Persona enregistrée, les tablettes sont prévenues',
    invalidate: ['personas'],
  });
  const makeDefault = useAction(() => personaApi.setDefault(persona.id), {
    success: 'Persona active par défaut',
    invalidate: ['personas'],
  });
  const remove = useAction(() => personaApi.remove(persona.id), {
    success: 'Persona supprimée',
    invalidate: ['personas'],
  });
  const rollback = useAction((version: number) => personaApi.rollback(persona.id, version), {
    success: 'Version restaurée',
    invalidate: ['personas'],
  });

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <Field label="Nom">
          <Input value={draft.name} onChange={(event) => set({ name: event.target.value })} />
        </Field>
        <Field
          label="Prompt système"
          hint={`Variables : ${VARIABLES.map((name) => `{{${name}}}`).join(' ')}`}
        >
          <Textarea
            rows={12}
            value={draft.systemPrompt}
            onChange={(event) => set({ systemPrompt: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Langue">
            <Input
              value={draft.language}
              onChange={(event) => set({ language: event.target.value })}
            />
          </Field>
          <Field label="Longueur">
            <Select
              value={draft.responseLength}
              onValueChange={(value) =>
                set({ responseLength: value as PersonaFields['responseLength'] })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Courte</SelectItem>
                <SelectItem value="normal">Normale</SelectItem>
                <SelectItem value="detailed">Détaillée</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Adresse">
            <Select
              value={draft.address}
              onValueChange={(value) => set({ address: value as PersonaFields['address'] })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tu">Tutoiement</SelectItem>
                <SelectItem value="vous">Vouvoiement</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
          {!persona.isDefault && (
            <>
              <Button variant="outline" onClick={() => makeDefault.mutate()}>
                Activer par défaut
              </Button>
              <ConfirmButton
                title={`Supprimer ${persona.name} ?`}
                description="Ses versions seront supprimées avec elle."
                confirmLabel="Supprimer"
                onConfirm={() => remove.mutate()}
                trigger={(open) => (
                  <Button variant="ghost" onClick={open}>
                    Supprimer
                  </Button>
                )}
              />
            </>
          )}
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-semibold">Prompt final</h3>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger aria-label="Pièce simulée" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROOM}>Sans pièce</SelectItem>
                {rooms.data?.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preview.data && <JsonView value={preview.data.prompt} />}
          {preview.data && preview.data.unknownVariables.length > 0 && (
            <p className="text-destructive mt-1 text-sm">
              Variables inconnues : {preview.data.unknownVariables.join(', ')}
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-2 font-semibold">Versions</h3>
          <ul className="divide-y rounded-md border text-sm">
            {versions.data?.map((version) => (
              <li key={version.id} className="flex items-center justify-between px-3 py-1.5">
                <span>
                  Version {version.version}, {formatDate(version.createdAt)}
                </span>
                {version.version !== persona.version && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => rollback.mutate(version.version)}
                  >
                    Restaurer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function PersonasPage() {
  const personas = useQuery({ queryKey: ['personas'], queryFn: personaApi.list });
  const [selected, setSelected] = useState<string | null>(null);
  const create = useAction(
    () => personaApi.create({ name: 'Nouvelle persona', systemPrompt: 'Tu es Ayko.' }),
    { invalidate: ['personas'], onDone: (persona) => setSelected(persona.id) },
  );
  return (
    <>
      <PageHeader
        title="Personas"
        intro="La personnalité d'Ayko. Chaque pièce peut avoir la sienne."
        actions={
          <Button size="sm" onClick={() => create.mutate()}>
            <Plus /> Nouvelle persona
          </Button>
        }
      />
      <QueryState query={personas}>
        {(data) => {
          const current = data.find((item) => item.id === selected) ?? data[0];
          return (
            <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
              <Panel className="h-fit p-1">
                {data.map((persona) => (
                  <button
                    key={persona.id}
                    onClick={() => setSelected(persona.id)}
                    aria-current={persona.id === current?.id}
                    className="hover:bg-accent aria-[current=true]:bg-accent flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left"
                  >
                    <span className="truncate">{persona.name}</span>
                    {persona.isDefault && <Badge variant="secondary">Défaut</Badge>}
                  </button>
                ))}
              </Panel>
              <Section title={`Version ${current?.version ?? ''}`} className="min-w-0">
                {current && <Editor key={current.id} persona={current} />}
              </Section>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
