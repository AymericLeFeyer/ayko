import { useQuery } from '@tanstack/react-query';
import { Pin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Memory } from '@ayko/contracts';
import { memoryApi, roomApi } from '@/infrastructure/api';
import {
  ConfirmButton,
  EmptyState,
  Field,
  PageHeader,
  QueryState,
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
import { Textarea } from '@/presentation/components/ui/textarea';
import { useAction } from '@/presentation/hooks/useAction';
import { formatDate } from '@/shared/format';

const HOUSE = '__house';
const SOURCE: Record<Memory['source'], string> = {
  user: 'Demandé',
  learned: 'Appris',
  admin: 'Saisi ici',
};

function MemoryDialog({ memory, onClose }: { memory: Memory | null; onClose: () => void }) {
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomApi.list });
  const [content, setContent] = useState(memory?.content ?? '');
  const [roomId, setRoomId] = useState(memory?.roomId ?? HOUSE);
  const [pinned, setPinned] = useState(memory?.pinned ?? false);
  const save = useAction(
    () => {
      const input = { content, pinned, roomId: roomId === HOUSE ? null : roomId };
      return memory ? memoryApi.update(memory.id, input) : memoryApi.create(input);
    },
    { success: 'Souvenir enregistré', invalidate: ['memories'], onDone: onClose },
  );
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{memory ? 'Modifier le souvenir' : 'Ajouter un souvenir'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Ce qu'Ayko doit savoir">
            <Textarea
              rows={3}
              maxLength={500}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </Field>
          <Field label="Valable">
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HOUSE}>Dans toute la maison</SelectItem>
                {rooms.data?.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={pinned} onCheckedChange={setPinned} />
            Toujours le rappeler à Ayko, quelle que soit la demande
          </label>
        </div>
        <DialogFooter>
          <Button disabled={!content.trim() || save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MemoryPage() {
  const memories = useQuery({ queryKey: ['memories'], queryFn: memoryApi.list });
  const [editing, setEditing] = useState<Memory | 'new' | null>(null);
  const pin = useAction(
    (memory: Memory) => memoryApi.update(memory.id, { pinned: !memory.pinned }),
    { invalidate: ['memories'] },
  );
  const remove = useAction((id: string) => memoryApi.remove(id), {
    success: 'Souvenir supprimé',
    invalidate: ['memories'],
  });
  return (
    <>
      <PageHeader
        title="Souvenirs"
        intro="Ce qu'Ayko retient. Dites-lui « souviens-toi que… » ou « oublie que… », ou corrigez ici. Tout reste sur votre serveur."
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> Ajouter
          </Button>
        }
      />
      <QueryState
        query={memories}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            title="Aucun souvenir pour l'instant"
            hint="Essayez : souviens-toi que le soir je préfère une lumière douce."
          />
        }
      >
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Souvenir</TableHead>
                <TableHead>Valable</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead>Utilisé</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((memory) => (
                <TableRow key={memory.id}>
                  <TableCell className="max-w-md whitespace-normal">
                    <button
                      className="text-left hover:underline"
                      onClick={() => setEditing(memory)}
                    >
                      {memory.content}
                    </button>
                  </TableCell>
                  <TableCell>{memory.roomName ?? 'Toute la maison'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{SOURCE[memory.source]}</Badge>
                  </TableCell>
                  <TableCell>
                    {memory.useCount} fois, {formatDate(memory.lastUsedAt)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={memory.pinned ? 'Ne plus épingler' : 'Épingler'}
                      aria-pressed={memory.pinned}
                      onClick={() => pin.mutate(memory)}
                    >
                      <Pin className={memory.pinned ? 'fill-current' : undefined} />
                    </Button>
                    <ConfirmButton
                      title="Supprimer ce souvenir ?"
                      description={memory.content}
                      confirmLabel="Supprimer"
                      onConfirm={() => remove.mutate(memory.id)}
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
        <MemoryDialog
          key={editing === 'new' ? 'new' : editing.id}
          memory={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
