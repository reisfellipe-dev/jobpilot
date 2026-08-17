import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { InlineError } from '@/components/ui/States';

/**
 * Destino do link de recuperação enviado por e-mail.
 * O Supabase entrega a sessão temporária pela URL; o AuthProvider a captura.
 */
export function ResetPasswordPage() {
  const { updatePassword, session, initializing } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => navigate('/', { replace: true }), 1600);
    return () => window.clearTimeout(timer);
  }, [done, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }

    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível alterar a senha.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-base px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Definir nova senha</h1>

        {!initializing && !session ? (
          <>
            <p className="mt-2 text-sm text-ink-muted">
              Este link expirou ou já foi usado. Peça um novo link de redefinição na tela de login.
            </p>
            <Button className="mt-5" fullWidth onClick={() => navigate('/entrar')}>
              Voltar para o login
            </Button>
          </>
        ) : done ? (
          <p className="mt-2 text-sm text-success">Senha alterada. Redirecionando…</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <TextInput
              label="Nova senha"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <TextInput
              label="Confirmar nova senha"
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            {error && <InlineError error={new Error(error)} />}
            <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
              Salvar nova senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
