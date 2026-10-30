const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });

export const formatDate = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : 'jamais';

export function formatMs(ms: number | null | undefined) {
  if (ms == null) return '–';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return '–';
  if (bytes < 1e6) return `${Math.round(bytes / 1e3)} Ko`;
  if (bytes < 1e9) return `${Math.round(bytes / 1e6)} Mo`;
  return `${(bytes / 1e9).toFixed(1)} Go`;
}

export const formatPercent = (value: number | null | undefined) =>
  value == null ? '–' : `${Math.round(value * 100)} %`;

export const formatRate = (value: number | null | undefined) =>
  value == null ? '–' : `${value.toFixed(1)} j/s`;

export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
