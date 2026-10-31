import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { Camera } from '@ayko/contracts';
import { cameraApi } from '@/infrastructure/api';
import { EmptyState, Field, PageHeader, QueryState } from '@/presentation/components/common';
import { Button } from '@/presentation/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/presentation/components/ui/dialog';
import { Input } from '@/presentation/components/ui/input';
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

const splitAliases = (value: string) =>
  value
    .split(',')
    .map((alias) => alias.trim())
    .filter(Boolean);

function CameraDialog({ camera, onClose }: { camera: Camera; onClose: () => void }) {
  const [name, setName] = useState(camera.name);
  const [aliases, setAliases] = useState(camera.aliases.join(', '));
  const [previewFailed, setPreviewFailed] = useState(false);
  const save = useAction(
    () => cameraApi.update(camera.id, { name, aliases: splitAliases(aliases) }),
    { success: 'Caméra enregistrée', invalidate: ['cameras'], onDone: onClose },
  );
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{camera.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {previewFailed ? (
            <p className="text-muted-foreground text-sm">Aperçu indisponible.</p>
          ) : (
            <img
              className="aspect-video w-full rounded-sm bg-black object-contain"
              src={cameraApi.snapshotUrl(camera.id)}
              alt={`Aperçu de ${camera.name}`}
              onError={() => setPreviewFailed(true)}
            />
          )}
          <Field label="Nom">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Autres noms, séparés par des virgules">
            <Input
              value={aliases}
              placeholder="entrée, sonnette"
              onChange={(event) => setAliases(event.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CamerasPage() {
  const cameras = useQuery({ queryKey: ['cameras', 'list'], queryFn: cameraApi.list });
  const source = useQuery({ queryKey: ['cameras', 'source'], queryFn: cameraApi.source });
  const [editing, setEditing] = useState<Camera | null>(null);
  const sync = useAction(() => cameraApi.sync(), {
    success: 'Caméras synchronisées',
    invalidate: ['cameras'],
  });
  const update = useAction(
    ({ id, ...change }: Pick<Camera, 'id'> & Partial<Camera>) => cameraApi.update(id, change),
    { invalidate: ['cameras'] },
  );
  return (
    <>
      <PageHeader
        title="Caméras"
        intro="Dites « montre-moi la porte », « caméra salon » ou « qui est devant la porte ». Les images restent sur votre réseau et ne sont jamais conservées."
        actions={
          <Button
            size="sm"
            disabled={!source.data?.url || sync.isPending}
            onClick={() => sync.mutate(undefined)}
          >
            <RefreshCw /> Synchroniser
          </Button>
        }
      />
      {source.data && !source.data.url && (
        <p className="mb-4 text-sm">
          Aucun serveur Home Assistant trouvé : ajoutez-le dans Serveurs MCP, son jeton sert aussi
          aux caméras.
        </p>
      )}
      {source.data?.refused && (
        <p role="alert" className="mb-4 text-sm">
          Home Assistant a refusé le jeton. Les caméras sont coupées pour éviter un bannissement :
          corrigez le jeton, puis synchronisez.
        </p>
      )}
      <QueryState
        query={cameras}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            title="Aucune caméra pour l'instant"
            hint="Synchronisez pour récupérer celles de Home Assistant."
          />
        }
      >
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Caméra</TableHead>
                <TableHead>Autres noms</TableHead>
                <TableHead>Plein écran par défaut</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((camera) => (
                <TableRow key={camera.id}>
                  <TableCell>
                    <button
                      className="text-left hover:underline"
                      onClick={() => setEditing(camera)}
                    >
                      {camera.name}
                    </button>
                    <p className="text-muted-foreground text-sm">{camera.entityId}</p>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {camera.aliases.join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`Plein écran par défaut pour ${camera.name}`}
                      checked={camera.fullscreenByDefault}
                      onCheckedChange={(fullscreenByDefault) =>
                        update.mutate({ id: camera.id, fullscreenByDefault })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`Activer ${camera.name}`}
                      checked={camera.enabled}
                      onCheckedChange={(enabled) => update.mutate({ id: camera.id, enabled })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </QueryState>
      {editing && (
        <CameraDialog key={editing.id} camera={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
