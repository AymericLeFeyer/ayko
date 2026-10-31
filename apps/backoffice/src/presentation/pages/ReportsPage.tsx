import { useQuery } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { reportApi } from '@/infrastructure/api';
import {
  ConfirmButton,
  EmptyState,
  PageHeader,
  QueryState,
} from '@/presentation/components/common';
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
import { downloadFile, formatDate } from '@/shared/format';

const EXPORT_LENGTH = 10;

export function ReportsPage() {
  const reports = useQuery({ queryKey: ['reports'], queryFn: () => reportApi.list() });
  const exportLatest = useAction(() => reportApi.list(EXPORT_LENGTH), {
    onDone: (data) =>
      downloadFile(
        `ayko-signalements-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(data, null, 2),
      ),
  });
  const remove = useAction((id: string) => reportApi.remove(id), {
    success: 'Signalement supprimé',
    invalidate: ['reports'],
  });
  return (
    <>
      <PageHeader
        title="Signalements"
        intro="Les échanges bizarres gardés depuis une tablette, avec leur trace complète. Ils ne sont jamais purgés."
        actions={
          <Button size="sm" onClick={() => exportLatest.mutate()}>
            <Download /> Télécharger les {EXPORT_LENGTH} derniers
          </Button>
        }
      />
      <QueryState
        query={reports}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            title="Aucun signalement"
            hint="Touchez « Signaler » sur une tablette quand un échange vous semble bizarre."
          />
        }
      >
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Tablette</TableHead>
                <TableHead>Échanges</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((report) => (
                <TableRow key={report.id} className="align-top">
                  <TableCell>{formatDate(report.createdAt)}</TableCell>
                  <TableCell>
                    {report.deviceName}
                    {report.roomName && ` (${report.roomName})`}
                  </TableCell>
                  <TableCell className="max-w-xl space-y-2 whitespace-normal">
                    {report.traces.map((trace) => (
                      <div key={trace.requestId}>
                        <Link
                          className="font-medium hover:underline"
                          to={`/traces/${trace.requestId}`}
                        >
                          {trace.text}
                        </Link>
                        <p className="text-muted-foreground line-clamp-2">
                          {trace.error ?? trace.answer}
                        </p>
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmButton
                      title="Supprimer ce signalement ?"
                      description={formatDate(report.createdAt)}
                      confirmLabel="Supprimer"
                      onConfirm={() => remove.mutate(report.id)}
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
    </>
  );
}
