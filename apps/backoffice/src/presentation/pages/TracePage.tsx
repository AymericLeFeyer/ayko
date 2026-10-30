import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { chatApi } from '@/infrastructure/api';
import {
  JsonView,
  Light,
  PageHeader,
  Panel,
  QueryState,
  Section,
} from '@/presentation/components/common';
import { Button } from '@/presentation/components/ui/button';
import { formatDate, formatMs, formatRate } from '@/shared/format';
import { RequestStatus } from './DashboardPage';

export function TracePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const trace = useQuery({ queryKey: ['trace', id], queryFn: () => chatApi.trace(id) });
  return (
    <QueryState query={trace}>
      {(data) => (
        <>
          <PageHeader
            title={data.text}
            intro={`Requête ${data.requestId}, ${formatDate(data.createdAt)}`}
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/terrain-de-jeu', { state: { text: data.text } })}
              >
                Rejouer
              </Button>
            }
          />
          <Panel className="mb-6">
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['État', <RequestStatus key="status" status={data.status} />],
                ['Pièce', data.roomName ?? '–'],
                ['Modèle', data.model ?? 'Aucun (LLM évité)'],
                ['Persona', data.personaName ?? '–'],
                ['Premier jeton', formatMs(data.ttftMs)],
                ['Débit', formatRate(data.tokensPerSecond)],
                ['Durée totale', formatMs(data.durationMs)],
                [
                  'Cache',
                  data.cache.outcome === 'hit'
                    ? `Cache hit, ${data.cache.matchType === 'exact' ? 'exact' : 'approché'}, ${formatMs(data.cache.durationMs)}`
                    : data.cache.outcome === 'miss'
                      ? `Cache miss, ${formatMs(data.cache.durationMs)}`
                      : 'Non consulté',
                ],
              ].map(([label, value], index) => (
                <div key={index}>
                  <dt className="text-muted-foreground text-sm">{label}</dt>
                  <dd className="font-medium break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          {data.error && (
            <p role="alert" className="text-destructive mb-6">
              {data.error}
            </p>
          )}

          <Section title="Étapes">
            <Panel className="p-0">
              <ol className="divide-y">
                {data.steps.map((step) => (
                  <li key={step.id} className="px-4 py-2">
                    <details>
                      <summary className="flex cursor-pointer items-center justify-between gap-3">
                        <Light
                          state={
                            step.status === 'error'
                              ? 'down'
                              : step.status === 'running'
                                ? 'warn'
                                : 'up'
                          }
                          label={step.label}
                        />
                        <span className="text-muted-foreground text-sm">
                          {formatMs(step.durationMs)}
                        </span>
                      </summary>
                      {step.detail != null && <JsonView className="mt-2" value={step.detail} />}
                    </details>
                  </li>
                ))}
              </ol>
            </Panel>
          </Section>

          {data.toolCalls.length > 0 && (
            <Section title="Appels d'outils">
              <div className="space-y-3">
                {data.toolCalls.map((call) => (
                  <Panel key={call.id}>
                    <p className="flex justify-between gap-3 font-medium">
                      <Light
                        state={call.isError ? 'down' : 'up'}
                        label={`${call.serverName} : ${call.toolName}`}
                      />
                      <span className="text-muted-foreground text-sm">
                        {call.source === 'cache' ? 'Rejoué, ' : ''}
                        {formatMs(call.durationMs)}
                      </span>
                    </p>
                    <JsonView
                      className="mt-2"
                      value={{ arguments: call.arguments, result: call.result }}
                    />
                  </Panel>
                ))}
              </div>
            </Section>
          )}

          {data.reasoning && (
            <Section title="Raisonnement du modèle">
              <JsonView value={data.reasoning} />
            </Section>
          )}

          {data.answer && (
            <Section title="Réponse finale">
              <p className="whitespace-pre-wrap">{data.answer}</p>
            </Section>
          )}

          {data.prompt != null && (
            <Section title="Prompt envoyé">
              <JsonView value={data.prompt} />
            </Section>
          )}
        </>
      )}
    </QueryState>
  );
}
