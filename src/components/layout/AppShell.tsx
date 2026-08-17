import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  FileText,
  LayoutDashboard,
  LogOut,
  Send,
  Settings,
  User,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/providers/AuthProvider';
import { useOnline } from '@/hooks/useOnline';
import { initials } from '@/lib/format';

interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', shortLabel: 'Início', icon: LayoutDashboard },
  { to: '/vagas', label: 'Vagas', shortLabel: 'Vagas', icon: Briefcase },
  { to: '/curriculos', label: 'Currículos', shortLabel: 'CVs', icon: FileText },
  { to: '/candidaturas', label: 'Candidaturas', shortLabel: 'Candidat.', icon: Send },
  { to: '/perfil', label: 'Perfil', shortLabel: 'Perfil', icon: User },
];

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid size-7 place-items-center rounded-lg bg-accent text-[13px] font-bold text-white">J</div>
      {!compact && <span className="text-sm font-semibold tracking-tight text-ink">JobPilot</span>}
    </div>
  );
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  // Rolar para o topo ao trocar de página (importante no mobile).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate('/entrar', { replace: true });
  };

  const email = user?.email ?? '';

  return (
    <div className="min-h-dvh bg-base">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Ir para o conteúdo
      </a>

      {!online && (
        <div
          className="safe-top sticky top-0 z-40 flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-xs text-warning"
          role="status"
        >
          <WifiOff className="size-3.5" aria-hidden />
          Você está offline. Alterações não serão salvas até reconectar.
        </div>
      )}

      {/* --- Navegação lateral (desktop) --- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center px-4">
          <Logo />
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-muted hover:bg-elevated hover:text-ink',
                )
              }
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <NavLink
            to="/configuracoes"
            className={({ isActive }) =>
              cn(
                'mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-muted hover:bg-elevated hover:text-ink',
              )
            }
          >
            <Settings className="size-4 shrink-0" aria-hidden />
            Configurações
          </NavLink>

          <div className="mt-2 flex items-center gap-2 rounded-lg px-2 py-2">
            <div className="grid size-7 shrink-0 place-items-center rounded-full bg-elevated text-[11px] font-semibold text-ink-muted">
              {initials(email)}
            </div>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-muted" title={email}>
              {email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-md p-1.5 text-ink-faint transition hover:bg-elevated hover:text-danger disabled:opacity-50"
              aria-label="Sair da conta"
            >
              <LogOut className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      {/* --- Barra superior (mobile) --- */}
      <header className="safe-top sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-base/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <NavLink
            to="/configuracoes"
            className={({ isActive }) =>
              cn(
                'grid size-10 place-items-center rounded-lg transition-colors',
                isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-elevated',
              )
            }
            aria-label="Configurações"
          >
            <Settings className="size-4" aria-hidden />
          </NavLink>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="grid size-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-elevated hover:text-danger disabled:opacity-50"
            aria-label="Sair da conta"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      <main id="conteudo" className="lg:pl-56">
        <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:pb-10">
          <Outlet />
        </div>
      </main>

      {/* --- Navegação inferior (mobile) --- */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-base/95 backdrop-blur lg:hidden"
        aria-label="Navegação principal"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] transition-colors',
                  isActive ? 'text-accent-ink' : 'text-ink-faint',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn('size-5', isActive && 'text-accent')} aria-hidden />
                  <span className="truncate">{item.shortLabel}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
