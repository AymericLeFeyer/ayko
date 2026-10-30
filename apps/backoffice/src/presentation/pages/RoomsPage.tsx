import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Device, HomeWidget, McpTool, Persona, Room, RoomConfig } from '@ayko/contracts';
import { mcpApi, personaApi, roomApi } from '@/infrastructure/api';
import {
  ConfirmButton,
  EmptyState,
  Field,
  Light,
  NumberField,
  PageHeader,
  QueryState,
  Section,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/presentation/components/ui/dropdown-menu';
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
import { Switch } from '@/presentation/components/ui/switch';
import { Textarea } from '@/presentation/components/ui/textarea';
import { useAction } from '@/presentation/hooks/useAction';
import { formatDate } from '@/shared/format';

const WIDGETS: Record<HomeWidget, string> = {
  clock: 'Heure',
  calendar: 'Calendrier',
  weather: 'Météo',
  home_state: 'États de la maison',
  suggestions: 'Suggestions',
};
const DEFAULT = '__default';
const WIDGET_SOURCES: HomeWidget[] = ['calendar', 'weather', 'home_state'];

function RoomDialog(props: {
  room: Room | null;
  personas: Persona[];
  tools: McpTool[];
  onClose: () => void;
}) {
  const { room } = props;
  const [name, setName] = useState(room?.name ?? '');
  const [icon, setIcon] = useState(room?.icon ?? 'home');
  const [config, setConfig] = useState<Partial<RoomConfig>>(
    room?.config ?? { widgets: ['clock', 'calendar', 'weather'], nightBrightness: 30 },
  );
  const widgets = config.widgets ?? [];
  const patch = (change: Partial<RoomConfig>) => setConfig((value) => ({ ...value, ...change }));
  const save = useAction(
    () =>
      room
        ? roomApi.update(room.id, { name, icon, config })
        : roomApi.create({ name, icon, config }),
    { success: 'Pièce enregistrée', invalidate: ['rooms'], onDone: props.onClose },
  );
  return (
    <Dialog open onOpenChange={props.onClose}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{room ? `Modifier ${room.name}` : 'Ajouter une pièce'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Icône">
              <Input value={icon} onChange={(event) => setIcon(event.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Persona">
              <Select
                value={config.personaId ?? DEFAULT}
                onValueChange={(value) => patch({ personaId: value === DEFAULT ? null : value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT}>Persona par défaut</SelectItem>
                  {props.personas.map((persona) => (
                    <SelectItem key={persona.id} value={persona.id}>
                      {persona.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Thème">
              <Select
                value={config.theme ?? 'dark'}
                onValueChange={(value) => patch({ theme: value as RoomConfig['theme'] })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Sombre</SelectItem>
                  <SelectItem value="midnight">Minuit</SelectItem>
                  <SelectItem value="light">Clair</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field group label="Widgets de l'écran d'accueil">
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(WIDGETS).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={widgets.includes(key as HomeWidget)}
                    onCheckedChange={(checked) =>
                      patch({
                        widgets:
                          checked === true
                            ? [...widgets, key as HomeWidget]
                            : widgets.filter((item) => item !== key),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Suggestions" hint="Une par ligne">
            <Textarea
              rows={3}
              value={(config.suggestions ?? []).join('\n')}
              onChange={(event) =>
                patch({ suggestions: event.target.value.split('\n').filter(Boolean) })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Luminosité de nuit (%)"
              min={0}
              value={config.nightBrightness ?? 30}
              onChange={(value) => patch({ nightBrightness: value ?? 0 })}
            />
            <NumberField
              label="Retour à l'accueil (s)"
              min={5}
              value={config.idleTimeoutSeconds ?? 60}
              onChange={(value) => patch({ idleTimeoutSeconds: value ?? 60 })}
            />
            <Field label="Début de la nuit">
              <Input
                type="time"
                value={config.nightStart ?? '22:00'}
                onChange={(event) => patch({ nightStart: event.target.value })}
              />
            </Field>
            <Field label="Fin de la nuit">
              <Input
                type="time"
                value={config.nightEnd ?? '07:00'}
                onChange={(event) => patch({ nightEnd: event.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={config.lightMode ?? false}
              onCheckedChange={(lightMode) => patch({ lightMode })}
            />
            Mode léger, sans effets coûteux
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={config.dashboardMode ?? false}
              onCheckedChange={(dashboardMode) => patch({ dashboardMode })}
            />
            Tableau de bord : afficher l'activité de toute la maison
          </label>
          <Field group label="Sources des widgets" hint="Outils en lecture, en mode automatique.">
            <div className="space-y-2">
              {WIDGET_SOURCES.map((widget) => (
                <div key={widget} className="flex items-center justify-between gap-2 text-sm">
                  {WIDGETS[widget]}
                  <Select
                    value={config.widgetTools?.[widget] ?? DEFAULT}
                    onValueChange={(value) => {
                      const widgetTools = { ...config.widgetTools };
                      if (value === DEFAULT) delete widgetTools[widget];
                      else widgetTools[widget] = value;
                      patch({ widgetTools });
                    }}
                  >
                    <SelectTrigger aria-label={`Source ${WIDGETS[widget]}`} className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT}>Aucune</SelectItem>
                      {props.tools
                        .filter((tool) => tool.readOnly)
                        .map((tool) => (
                          <SelectItem key={tool.id} value={tool.id}>
                            {tool.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={!name || save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pairing({ rooms }: { rooms: Room[] }) {
  const pending = useQuery({
    queryKey: ['pairing'],
    queryFn: roomApi.pendingPairings,
    refetchInterval: 10_000,
  });
  const [code, setCode] = useState('');
  const [roomId, setRoomId] = useState('');
  const confirm = useAction(() => roomApi.confirmPairing({ code, roomId }), {
    success: 'Tablette appairée',
    invalidate: ['pairing', 'devices', 'rooms'],
    onDone: () => setCode(''),
  });
  return (
    <Section
      title="Appairer une tablette"
      intro="Saisissez le code à 6 chiffres affiché sur l'écran de la tablette."
    >
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          confirm.mutate();
        }}
      >
        <Field label="Code">
          <Input
            className="w-32"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="Pièce">
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Choisir" />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" disabled={code.length !== 6 || !roomId || confirm.isPending}>
          Appairer
        </Button>
      </form>
      {pending.data && pending.data.length > 0 && (
        <p className="text-muted-foreground mt-2 text-sm">
          En attente : {pending.data.map((item) => item.deviceName ?? item.code).join(', ')}
        </p>
      )}
    </Section>
  );
}

function DeviceRow({ device, rooms }: { device: Device; rooms: Room[] }) {
  const invalidate = ['devices', 'rooms'];
  const command = useAction(
    (name: 'reload' | 'clear_cache' | 'go_home') => roomApi.command(device.id, name),
    {
      success: 'Commande envoyée',
    },
  );
  const update = useAction(
    (change: Parameters<typeof roomApi.updateDevice>[1]) => roomApi.updateDevice(device.id, change),
    { invalidate },
  );
  const remove = useAction(() => roomApi.removeDevice(device.id), {
    success: 'Tablette supprimée',
    invalidate,
  });
  return (
    <TableRow>
      <TableCell>
        <Light state={device.online ? 'up' : 'off'} label={device.name} />
        {device.revoked && (
          <Badge variant="destructive" className="ml-2">
            Révoquée
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Select
          value={device.roomId ?? undefined}
          onValueChange={(roomId) => update.mutate({ roomId })}
        >
          <SelectTrigger aria-label={`Pièce de ${device.name}`} className="w-40">
            <SelectValue placeholder="Aucune" />
          </SelectTrigger>
          <SelectContent>
            {rooms.map((room) => (
              <SelectItem key={room.id} value={room.id}>
                {room.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>{formatDate(device.lastSeenAt)}</TableCell>
      <TableCell>{device.uiVersion ?? '–'}</TableCell>
      <TableCell className="space-x-1 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!device.online}>
              Actions à distance
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => command.mutate('reload')}>Recharger</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => command.mutate('clear_cache')}>
              Vider le cache
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => command.mutate('go_home')}>
              Forcer l'écran d'accueil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmButton
          title={`Révoquer ${device.name} ?`}
          description="La tablette est déconnectée et devra être appairée à nouveau."
          confirmLabel="Révoquer"
          onConfirm={() => update.mutate({ revoked: true })}
          trigger={(open) => (
            <Button variant="ghost" size="sm" onClick={open} disabled={device.revoked}>
              Révoquer
            </Button>
          )}
        />
        <ConfirmButton
          title={`Supprimer ${device.name} ?`}
          description="Cette action est définitive."
          confirmLabel="Supprimer"
          onConfirm={() => remove.mutate()}
          trigger={(open) => (
            <Button variant="ghost" size="icon" aria-label="Supprimer" onClick={open}>
              <Trash2 />
            </Button>
          )}
        />
      </TableCell>
    </TableRow>
  );
}

export function RoomsPage() {
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomApi.list });
  const devices = useQuery({ queryKey: ['devices'], queryFn: roomApi.devices });
  const personas = useQuery({ queryKey: ['personas'], queryFn: personaApi.list });
  const tools = useQuery({ queryKey: ['mcp', 'tools'], queryFn: mcpApi.allTools });
  const [editing, setEditing] = useState<Room | 'new' | null>(null);
  const remove = useAction((id: string) => roomApi.remove(id), {
    success: 'Pièce supprimée',
    invalidate: ['rooms', 'devices'],
  });
  return (
    <>
      <PageHeader
        title="Pièces et tablettes"
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> Ajouter une pièce
          </Button>
        }
      />
      <Section title="Pièces">
        <QueryState
          query={rooms}
          isEmpty={(data) => data.length === 0}
          empty={
            <EmptyState title="Aucune pièce" hint="Créez-en une pour y appairer une tablette." />
          }
        >
          {(data) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pièce</TableHead>
                  <TableHead>Identifiant</TableHead>
                  <TableHead>Tablettes en ligne</TableHead>
                  <TableHead>Widgets</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className="font-medium">{room.name}</TableCell>
                    <TableCell>{room.slug}</TableCell>
                    <TableCell>
                      {room.onlineCount} / {room.deviceCount}
                    </TableCell>
                    <TableCell>
                      {room.config.widgets.map((item) => WIDGETS[item]).join(', ')}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(room)}>
                        Modifier
                      </Button>
                      <ConfirmButton
                        title={`Supprimer ${room.name} ?`}
                        description="Ses tablettes seront détachées et ses raccourcis invalidés."
                        confirmLabel="Supprimer"
                        onConfirm={() => remove.mutate(room.id)}
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
      <Pairing rooms={rooms.data ?? []} />
      <Section title="Tablettes">
        <QueryState
          query={devices}
          isEmpty={(data) => data.length === 0}
          empty={<EmptyState title="Aucune tablette appairée" />}
        >
          {(data) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tablette</TableHead>
                  <TableHead>Pièce</TableHead>
                  <TableHead>Dernière activité</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((device) => (
                  <DeviceRow key={device.id} device={device} rooms={rooms.data ?? []} />
                ))}
              </TableBody>
            </Table>
          )}
        </QueryState>
      </Section>
      {editing && (
        <RoomDialog
          room={editing === 'new' ? null : editing}
          personas={personas.data ?? []}
          tools={tools.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
