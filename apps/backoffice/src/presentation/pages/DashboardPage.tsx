import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ComponentHealth } from '@ayko/contracts';
import { systemApi } from '@/infrastructure/api';
import {
  EmptyState,
  HostLoad,
  Light,
  PageHeader,
  Panel,
  QueryState,
  Section,
  Stat,
  type Led,
} from '@/presentation/components/common';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/presentation/components/ui/table';
import { useAction } from '@/presentation/hooks/useAction';
import { formatDate, formatMs, formatPercent, formatRate } from '@/shared/format';

const LED: Record<ComponentHealth['status'], Led> = {
  up: 'up',
  degraded: 'warn',
  down: 'down',
  disabled: 'off',
};

function SetupChecklist() {
  const wizard = useQuery({ queryKey: ['wizard'], queryFn: systemApi.wizard });
  const finish = useAction(() => systemApi.completeWizard(), { invalidate: ['wizard'] });
  if (!wizard.data || wizard.data.completed) return null;
  const steps = [
    { done: wizard.data.hasEndpoint, label: 'Ajouter un endpoint Ollama', to: '/ollama' },
    {
      done: wizard.data.hasConversationModel,
      label: 'Choisir le modèle de conversation',
      to: '/ollama',
    },
    { done: wizard.data.hasMcpServer, label: 'Brancher un serveur MCP', to: '/mcp' },
    { done: wizard.data.hasRoom, label: 'Créer une pièce', to: '/pieces' },
  ];
  return (
    <Section
      title="Premier démarrage"
      actions={
        <Button variant="ghost" size="sm" onClick={() => finish.mutate()}>
          Terminer l'assistant
        </Button>
      }
    >
      <Panel>
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <li key={step.label} className="flex items-center gap-3">
              <span className="w-5 text-center">
                {step.done ? <Check className="size-4" /> : index + 1}
              </span>
              <Link to={step.to} className="underline-offset-4 hover:underline">
                {step.label}
              </Link>
            </li>
          ))}
        </ol>
      </Panel>
    </Section>
  );
}

export function DashboardPage() {
  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: systemApi.metrics,
    refetchInterval: 30_000,
  });
  return (
    <>
      <PageHeader title="Tableau de bord" />
      <SetupChecklist />
      <QueryState query={metrics}>
        {(data) => (
          <>
            <Section title="Composants">
              <Panel className="p-0">
                <ul className="divide-y">
                  {data.components.map((component) => (
                    <li key={component.id} className="flex items-center gap-3 px-4 py-2">
                      <Light state={LED[component.status]} />
                      <span className="font-medium">{component.name}</span>
                      <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                        {component.detail}
                      </span>
                      {component.host && <HostLoad host={component.host} />}
                      <span className="text-muted-foreground text-sm">
                        {formatMs(component.latencyMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </Section>

            <Section title="Dernières 24 heures">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <Stat label="Requêtes" value={data.requests24h} />
                <Stat label="Erreurs" value={data.errors24h} />
                <Stat label="Débit moyen" value={formatRate(data.avgTokensPerSecond)} />
                <Stat label="Raccourcis utilisés" value={formatPercent(data.cacheHitRate)} />
                <Stat label="En file d'attente" value={data.queueDepth} />
              </div>
            </Section>

            <Section title="Requêtes récentes">
              {data.recentRequests.length === 0 ? (
                <EmptyState
                  title="Aucune requête pour l'instant"
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link to="/terrain-de-jeu">Essayer le terrain de jeu</Link>
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Demande</TableHead>
                      <TableHead>Pièce</TableHead>
                      <TableHead>Durée</TableHead>
                      <TableHead>Débit</TableHead>
                      <TableHead>État</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentRequests.map((request) => (
                      <TableRow key={request.requestId}>
                        <TableCell className="max-w-72 truncate">
                          <Link className="hover:underline" to={`/traces/${request.requestId}`}>
                            {request.text}
                          </Link>
                        </TableCell>
                        <TableCell>{request.roomName ?? '–'}</TableCell>
                        <TableCell>{formatMs(request.durationMs)}</TableCell>
                        <TableCell>{formatRate(request.tokensPerSecond)}</TableCell>
                        <TableCell>
                          {request.cacheHit ? (
                            <Badge variant="secondary">Raccourci</Badge>
                          ) : (
                            <RequestStatus status={request.status} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>

            {data.recentErrors.length > 0 && (
              <Section title="Erreurs récentes">
                <Panel className="p-0">
                  <ul className="divide-y">
                    {data.recentErrors.map((error) => (
                      <li key={error.id} className="px-4 py-2 text-sm">
                        <span className="text-muted-foreground">
                          {formatDate(error.ts)}, {error.component} :
                        </span>{' '}
                        {error.message}
                      </li>
                    ))}
                  </ul>
                </Panel>
              </Section>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}

const STATUS_LABEL = {
  running: 'En cours',
  done: 'Terminée',
  error: 'Erreur',
  cancelled: 'Annulée',
};

export const RequestStatus = ({ status }: { status: keyof typeof STATUS_LABEL }) => (
  <Badge variant={status === 'error' ? 'destructive' : 'outline'}>{STATUS_LABEL[status]}</Badge>
);
