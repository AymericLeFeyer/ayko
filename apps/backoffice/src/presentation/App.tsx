import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { authApi } from '@/infrastructure/api';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { CachePage } from './pages/CachePage';
import { ConversationsPage } from './pages/ConversationsPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { LogsPage } from './pages/LogsPage';
import { McpPage } from './pages/McpPage';
import { McpServerPage } from './pages/McpServerPage';
import { MemoryPage } from './pages/MemoryPage';
import { OllamaPage } from './pages/OllamaPage';
import { PersonasPage } from './pages/PersonasPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { RoomsPage } from './pages/RoomsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TracePage } from './pages/TracePage';
import { VoicePage } from './pages/VoicePage';

export function App() {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ['auth', 'status'], queryFn: authApi.status });
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: authApi.me, retry: false });

  if (status.isPending || me.isPending) return null;
  if (status.isError) {
    return (
      <main className="grid min-h-dvh place-items-center p-4 text-center">
        <div role="alert">
          <h1 className="text-2xl font-semibold">Ayko Core ne répond pas</h1>
          <p className="text-muted-foreground mt-1">{status.error.message}</p>
        </div>
      </main>
    );
  }
  if (me.isError) {
    return (
      <LoginPage
        needsSetup={status.data.needsSetup}
        onAuthenticated={() => void client.invalidateQueries({ queryKey: ['auth'] })}
      />
    );
  }

  return (
    <Routes>
      <Route element={<AppShell user={me.data.name} mock={status.data.mock} />}>
        <Route index element={<DashboardPage />} />
        <Route path="ollama" element={<OllamaPage />} />
        <Route path="mcp" element={<McpPage />} />
        <Route path="mcp/:id" element={<McpServerPage />} />
        <Route path="personas" element={<PersonasPage />} />
        <Route path="terrain-de-jeu" element={<PlaygroundPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="traces/:id" element={<TracePage />} />
        <Route path="pieces" element={<RoomsPage />} />
        <Route path="voix" element={<VoicePage />} />
        <Route path="historique" element={<HistoryPage />} />
        <Route path="raccourcis" element={<CachePage />} />
        <Route path="souvenirs" element={<MemoryPage />} />
        <Route path="journaux" element={<LogsPage />} />
        <Route path="reglages" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
