import { useCallback, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/States';
import { useSettings, useUpdateSettings, useAIStatus } from '@/hooks/queries';

/**
 * Consentimento explícito antes de enviar dados a um provedor de IA (§12).
 * Exibe exatamente o que sai da aplicação e para onde vai, uma única vez —
 * depois disso a preferência fica registrada nas configurações.
 */
export function useAIGate() {
  const { data: settings } = useSettings();
  const { data: status } = useAIStatus();
  const updateSettings = useUpdateSettings();
  const [pending, setPending] = useState<((value: boolean) => void) | null>(null);

  const consented = settings?.aiConsent ?? false;
  const aiAvailable = status?.available ?? true;

  const ensureConsent = useCallback(async (): Promise<boolean> => {
    if (consented) return true;
    return new Promise<boolean>((resolve) => setPending(() => resolve));
  }, [consented]);

  const close = (value: boolean) => {
    pending?.(value);
    setPending(null);
  };

  const activeProvider = status?.providers.find((provider) => provider.configured);

  const dialog = pending ? (
    <Modal
      open
      onClose={() => close(false)}
      title="Autorizar envio de dados à IA"
      size="sm"
      footer={
        <>
          <Button onClick={() => close(false)} disabled={updateSettings.isPending}>
            Agora não
          </Button>
          <Button
            variant="primary"
            loading={updateSettings.isPending}
            onClick={() => {
              if (!settings) return close(false);
              updateSettings.mutate(
                { ...settings, aiConsent: true },
                {
                  onSuccess: () => close(true),
                },
              );
            }}
          >
            Autorizar
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-ink-muted">
        <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent-soft p-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <p className="text-xs text-accent-ink">
            Nada é enviado a serviços externos sem esta autorização.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-ink">O que é enviado</p>
          <ul className="mt-1.5 space-y-1 text-xs">
            <li>• O texto da vaga ou do currículo envolvido na operação.</li>
            <li>• Os dados do seu perfil necessários para aquela tarefa específica.</li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-medium text-ink">O que nunca é enviado</p>
          <ul className="mt-1.5 space-y-1 text-xs">
            <li>• Sua senha, tokens de sessão ou chaves de API.</li>
            <li>• Dados de outras vagas, currículos ou candidaturas não relacionados.</li>
          </ul>
        </div>

        <p className="text-xs">
          Provedor configurado: <span className="text-ink">{activeProvider?.name ?? 'nenhum'}</span>
          {activeProvider ? ` (modelo ${activeProvider.model})` : ''}. Você pode revogar a autorização a
          qualquer momento em Configurações → Privacidade.
        </p>

        {updateSettings.error && <InlineError error={updateSettings.error} />}
      </div>
    </Modal>
  ) : null;

  return { ensureConsent, dialog, consented, aiAvailable };
}
