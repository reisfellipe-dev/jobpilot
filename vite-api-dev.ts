/**
 * Plugin de desenvolvimento: executa a função serverless da pasta `api/`
 * dentro do próprio servidor do Vite.
 *
 * Motivo: em produção a Vercel roda `api/index.ts` como Serverless Function.
 * Sem isto, `npm run dev` serviria apenas o frontend e toda chamada a `/api/*`
 * daria 404 — seria preciso um segundo processo (`vercel dev`) só para isso.
 *
 * O plugin traduz a requisição do Node para o formato que o handler espera
 * (mesmo contrato de `VercelRequest`/`VercelResponse`) e recarrega o código da
 * API a cada requisição, então editar o backend tem hot reload como o frontend.
 *
 * Só roda em `serve` (desenvolvimento). Não afeta o build de produção.
 */
import type { Connect, Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

type ApiHandler = (req: unknown, res: unknown) => Promise<void>;

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;

  const contentType = String(req.headers['content-type'] ?? '');
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      // Corpo inválido: o handler devolve 400/422 na validação, como em produção.
      return undefined;
    }
  }
  return raw;
}

function buildQuery(originalUrl: string): Record<string, string> {
  const url = new URL(originalUrl, 'http://localhost');
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');

  // Em produção este parâmetro vem do rewrite declarado em vercel.json.
  const query: Record<string, string> = { route: path };
  for (const [key, value] of url.searchParams) {
    if (key !== 'route') query[key] = value;
  }
  return query;
}

export function apiDevServer(): Plugin {
  return {
    name: 'jobpilot:api-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const middleware: Connect.NextHandleFunction = (req, res, next) => {
        void (async () => {
          const originalUrl = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '';
          if (!originalUrl.startsWith('/api')) {
            next();
            return;
          }

          try {
            const module = (await server.ssrLoadModule('/api/index.ts')) as { default: ApiHandler };

            const request = Object.assign(req, {
              query: buildQuery(originalUrl),
              body: await readBody(req as IncomingMessage),
              cookies: {},
            });

            const response = res as ServerResponse & {
              status: (code: number) => unknown;
              json: (payload: unknown) => unknown;
              send: (payload: unknown) => unknown;
            };
            response.status = (code: number) => {
              response.statusCode = code;
              return response;
            };
            response.json = (payload: unknown) => {
              if (!response.headersSent) response.setHeader('Content-Type', 'application/json; charset=utf-8');
              response.end(JSON.stringify(payload));
              return response;
            };
            response.send = (payload: unknown) => {
              response.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
              return response;
            };

            await module.default(request, response);
            if (!response.writableEnded) response.end();
          } catch (error) {
            server.config.logger.error(`[api-dev] falha em ${originalUrl}`);
            console.error(error);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            res.end(
              JSON.stringify({
                error: {
                  code: 'internal_error',
                  message: 'Erro ao executar a função de API em desenvolvimento. Veja o terminal.',
                  details: error instanceof Error ? error.message : null,
                },
              }),
            );
          }
        })();
      };

      // Antes dos middlewares internos do Vite, para /api não cair no SPA fallback.
      server.middlewares.use(middleware);
    },
  };
}
