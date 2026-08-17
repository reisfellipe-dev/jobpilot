import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from './providers/AuthProvider';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';

/* Code splitting por rota: o bundle inicial carrega só o essencial (§42). */
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const ResumesPage = lazy(() => import('./pages/ResumesPage').then((m) => ({ default: m.ResumesPage })));
const ResumeDetailPage = lazy(() =>
  import('./pages/ResumeDetailPage').then((m) => ({ default: m.ResumeDetailPage })),
);
const JobsPage = lazy(() => import('./pages/JobsPage').then((m) => ({ default: m.JobsPage })));
const JobDetailPage = lazy(() => import('./pages/JobDetailPage').then((m) => ({ default: m.JobDetailPage })));
const ApplicationsPage = lazy(() =>
  import('./pages/ApplicationsPage').then((m) => ({ default: m.ApplicationsPage })),
);
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function FullScreenLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-base" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-ink-muted">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

/** Tela explícita quando faltam variáveis de ambiente do Supabase. */
function SetupRequired() {
  return (
    <div className="grid min-h-dvh place-items-center bg-base p-6">
      <div className="panel-elevated w-full max-w-lg p-6">
        <div className="mb-4 grid size-11 place-items-center rounded-xl bg-warning-soft text-warning">
          <AlertTriangle className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-ink">Configuração pendente</h1>
        <p className="mt-2 text-sm text-ink-muted">
          As variáveis <code className="rounded bg-elevated px-1 py-0.5 text-xs">VITE_SUPABASE_URL</code> e{' '}
          <code className="rounded bg-elevated px-1 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code> não foram definidas.
          Sem elas o app não consegue autenticar nem salvar dados.
        </p>
        <ol className="mt-4 space-y-2 text-sm text-ink-muted">
          <li>1. Copie <code className="rounded bg-elevated px-1 py-0.5 text-xs">.env.example</code> para <code className="rounded bg-elevated px-1 py-0.5 text-xs">.env.local</code>.</li>
          <li>2. Preencha os valores do seu projeto Supabase.</li>
          <li>3. Na Vercel, cadastre as mesmas variáveis em Settings → Environment Variables.</li>
        </ol>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <FullScreenLoader label="Recuperando sua sessão…" />;
  if (!session) return <Navigate to="/entrar" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { session, initializing } = useAuth();
  if (initializing) return <FullScreenLoader />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-semibold text-line-strong">404</p>
      <h1 className="mt-3 text-lg font-semibold text-ink">Página não encontrada</h1>
      <p className="mt-1 text-sm text-ink-muted">O endereço acessado não existe no JobPilot.</p>
    </div>
  );
}

export function App() {
  const { configured } = useAuth();
  if (!configured) return <SetupRequired />;

  return (
    <ErrorBoundary>
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route
            path="/entrar"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="perfil" element={<ProfilePage />} />
            <Route path="curriculos" element={<ResumesPage />} />
            <Route path="curriculos/:id" element={<ResumeDetailPage />} />
            <Route path="vagas" element={<JobsPage />} />
            <Route path="vagas/:id" element={<JobDetailPage />} />
            <Route path="candidaturas" element={<ApplicationsPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
