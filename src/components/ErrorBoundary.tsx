import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Impede tela branca em erro de renderização (§40). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] erro não tratado:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-dvh place-items-center bg-base p-6">
        <div className="panel-elevated w-full max-w-md p-6 text-center">
          <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-danger-soft text-danger">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <h1 className="text-base font-semibold text-ink">Algo quebrou nesta tela</h1>
          <p className="mt-2 text-sm text-ink-muted">
            O erro foi registrado no console. Seus dados continuam salvos no servidor.
          </p>
          <p className="mt-3 break-words rounded-lg bg-elevated p-2 text-left font-mono text-[11px] text-ink-faint">
            {this.state.error.message}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => this.setState({ error: null })}>Tentar de novo</Button>
            <Button variant="primary" onClick={() => window.location.assign('/')}>
              Voltar ao início
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
