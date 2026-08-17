/**
 * Ponto de entrada único da API (Vercel Serverless).
 *
 * DECISÃO: uma única função com roteador interno, em vez de um arquivo por
 * endpoint. Motivos: o plano Hobby da Vercel limita o número de funções por
 * deploy, um único bundle reduz cold starts e o roteamento fica explícito e
 * testável em um só lugar.
 *
 * O caminho chega por um rewrite declarado em vercel.json:
 *   /api/qualquer/coisa  ->  /api/index?route=qualquer/coisa
 * Evitar um arquivo `[...route].ts` também evita que os colchetes do nome
 * sejam interpretados como glob na configuração de `functions`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleRequest, route, type Route } from './_lib/router';
import { describeEnv, getEnv } from './_lib/env';
import { profileRoutes } from './_routes/profile';
import { resumeRoutes } from './_routes/resumes';
import { jobRoutes } from './_routes/jobs';
import { applicationRoutes } from './_routes/applications';
import { aiRoutes } from './_routes/ai';
import { settingsRoutes } from './_routes/settings';
import { dataRoutes } from './_routes/data';
import { dashboardRoutes } from './_routes/dashboard';
import { discoveryRoutes } from './_routes/discovery';
import { applicationAssistRoutes } from './_routes/application-assist';

const healthRoutes: Route[] = [
  route(
    'GET',
    'health',
    async () => ({
      status: 'ok',
      time: new Date().toISOString(),
      config: describeEnv(getEnv()),
    }),
    true,
  ),
];

/**
 * Ordem de registro é significativa: o roteador usa a primeira rota que casa.
 * Exportada para o teste de regressão que garante que nenhuma rota literal seja
 * capturada por uma rota com parâmetro no mesmo nível.
 */
export const routes: Route[] = [
  ...healthRoutes,
  ...profileRoutes,
  ...resumeRoutes,
  ...jobRoutes,
  // Rotas literais precisam vir ANTES das que têm parâmetro no mesmo nível:
  // "applications/:id" casaria com "applications/field-answers".
  ...applicationAssistRoutes,
  ...applicationRoutes,
  ...discoveryRoutes,
  ...aiRoutes,
  ...settingsRoutes,
  ...dataRoutes,
  ...dashboardRoutes,
];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await handleRequest(req, res, routes);
}
