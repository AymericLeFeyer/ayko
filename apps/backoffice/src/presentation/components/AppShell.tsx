import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { Metrics } from '@ayko/contracts';
import { authApi, systemApi } from '@/infrastructure/api';
import { useAdminSocket } from '@/presentation/hooks/useAdminSocket';
import { cn } from '@/shared/utils';
import { Light, type Led } from './common';
import { Button } from './ui/button';

type Kind = Metrics['components'][number]['kind'];

interface NavItem {
  to: string;
  label: string;
  /** Component family whose worst status lights this entry. */
  watches?: Kind;
}

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Supervision',
    items: [
      { to: '/', label: 'Tableau de bord', watches: 'database' },
      { to: '/journaux', label: 'Journaux' },
    ],
  },
  {
    title: 'Cerveau',
    items: [
      { to: '/ollama', label: 'Ollama', watches: 'ollama' },
      { to: '/personas', label: 'Personas' },
      { to: '/terrain-de-jeu', label: 'Terrain de jeu' },
      { to: '/conversations', label: 'Conversations' },
    ],
  },
  {
    title: 'Maison',
    items: [
      { to: '/mcp', label: 'Serveurs MCP', watches: 'mcp' },
      { to: '/pieces', label: 'Pièces et tablettes', watches: 'rooms' },
      { to: '/voix', label: 'Voix' },
    ],
  },
  {
    title: 'Mémoire',
    items: [
      { to: '/historique', label: 'Historique' },
      { to: '/souvenirs', label: 'Souvenirs' },
      { to: '/raccourcis', label: 'Raccourcis' },
    ],
  },
  { title: 'Système', items: [{ to: '/reglages', label: 'Réglages' }] },
];

function ledFor(metrics: Metrics | undefined, kind: Kind | undefined): Led | null {
  if (!kind) return null;
  const components = metrics?.components.filter(
    (item) => item.kind === kind && item.status !== 'disabled',
  );
  if (!components?.length) return 'off';
  if (components.some((item) => item.status === 'down')) return 'down';
  return components.some((item) => item.status === 'degraded') ? 'warn' : 'up';
}

export function AppShell({ user, mock }: { user: string; mock: boolean }) {
  const connected = useAdminSocket();
  const [menuOpen, setMenuOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const client = useQueryClient();
  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: systemApi.metrics,
    refetchInterval: 30_000,
  });

  const logout = async () => {
    await authApi.logout();
    await client.invalidateQueries({ queryKey: ['auth'] });
  };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:overflow-y-auto">
        <div className="flex items-center justify-between p-4">
          <NavLink to="/" className="font-display text-2xl font-bold tracking-tight text-white">
            Ayko
          </NavLink>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Menu />
          </Button>
        </div>
        <nav className={cn('px-2 pb-4 md:block', menuOpen ? 'block' : 'hidden')}>
          {NAV.map((group) => (
            <div key={group.title} className="mb-4">
              <p className="px-2 pb-1 text-sm opacity-60">{group.title}</p>
              {group.items.map((item) => {
                const led = ledFor(metrics.data, item.watches);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'hover:bg-sidebar-active flex items-center justify-between rounded-sm px-2 py-1.5',
                        isActive && 'bg-sidebar-active font-medium text-white',
                      )
                    }
                  >
                    {item.label}
                    {led && <Light state={led} />}
                  </NavLink>
                );
              })}
            </div>
          ))}
          <div className="mt-6 flex items-center justify-between px-2 text-sm">
            <span>{user}</span>
            <span className="flex">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Changer de thème"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              >
                {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Se déconnecter"
                onClick={() => void logout()}
              >
                <LogOut />
              </Button>
            </span>
          </div>
        </nav>
      </aside>
      <div className="min-w-0">
        {!connected && (
          <p role="status" className="bg-led-warn px-4 py-1 text-center text-sm text-[#18232c]">
            Reconnexion à Ayko Core…
          </p>
        )}
        {mock && (
          <p className="border-b px-4 py-1 text-center text-sm">
            Mode mock : Ollama et la maison sont simulés.
          </p>
        )}
        <main className="mx-auto max-w-6xl p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
