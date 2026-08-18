import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';
import { cn } from '@/lib/cn';

type Mode = 'signin' | 'signup' | 'reset';

export function LoginPage() {
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === 'signup' && password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        navigate(redirectTo, { replace: true });
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUp(email, password, fullName);
        if (needsConfirmation) {
          setNotice('Conta criada. Confirme o e-mail que enviamos para ativar o acesso.');
          setMode('signin');
        } else {
          navigate('/', { replace: true });
        }
      } else {
        await requestPasswordReset(email);
        setNotice('Se existir uma conta com este e-mail, o link de redefinição foi enviado.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, { title: string; subtitle: string; cta: string }> = {
    signin: { title: 'Entrar no JobPilot', subtitle: 'Seu Career OS pessoal.', cta: 'Entrar' },
    signup: {
      title: 'Criar sua conta',
      subtitle: 'Perfil, currículos e candidaturas em um só lugar.',
      cta: 'Criar conta',
    },
    reset: {
      title: 'Redefinir senha',
      subtitle: 'Enviaremos um link para o seu e-mail.',
      cta: 'Enviar link',
    },
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-base px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-accent text-base font-bold text-white">J</div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-ink">JobPilot</p>
            <p className="text-xs text-ink-faint">Career OS</p>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-ink">{titles[mode].title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{titles[mode].subtitle}</p>

        {mode !== 'reset' && (
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface p-1" role="tablist">
            {(['signin', 'signup'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => {
                  setMode(value);
                  setError(null);
                }}
                className={cn(
                  'rounded-md py-2 text-xs font-medium transition-colors',
                  mode === value ? 'bg-elevated text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                {value === 'signin' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === 'signup' && (
            <TextInput
              label="Nome completo"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
              maxLength={140}
            />
          )}

          <TextInput
            label="E-mail"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            maxLength={200}
          />

          {mode !== 'reset' && (
            <TextInput
              label="Senha"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              {...(mode === 'signup' ? { hint: 'Mínimo de 8 caracteres.' } : {})}
            />
          )}

          {error && <InlineError error={new Error(error)} />}
          {notice && (
            <p className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
              <MailCheck className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>{notice}</span>
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
            {titles[mode].cta}
          </Button>
        </form>

        <div className="mt-4 text-center">
          {mode === 'reset' ? (
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition hover:text-ink"
            >
              <ArrowLeft className="size-3" aria-hidden />
              Voltar para o login
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode('reset');
                setError(null);
              }}
              className="text-xs text-ink-muted transition hover:text-ink"
            >
              Esqueci minha senha
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs">
          <Link to="/como-funciona" className="text-accent-ink underline-offset-4 transition hover:underline">
            Como o JobPilot funciona
          </Link>
        </p>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-faint">
          Seus dados ficam no seu próprio projeto Supabase, isolados por Row Level Security.
          Nenhuma informação é enviada a um provedor de IA sem sua autorização explícita.
        </p>
      </div>
    </div>
  );
}
