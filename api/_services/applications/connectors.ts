/**
 * ApplicationConnectors (§16, §17).
 *
 * VERDADE INCÔMODA, DITA EXPLICITAMENTE: nenhuma das plataformas integradas
 * permite que um terceiro envie uma candidatura em nome do usuário sem uma
 * credencial privada do empregador.
 *
 *  - Greenhouse: o POST de candidatura exige a API key do board (do empregador).
 *  - Lever e Ashby: não publicam endpoint de submissão para terceiros.
 *  - Sites próprios: formulário arbitrário, protegido por anti-bot.
 *
 * Implementar "preenchimento automático" aqui exigiria automação de navegador
 * contra proteções — exatamente o que §2 e §33 proíbem. Então NENHUM conector
 * declara `canAutoSubmit`, e o motivo é mostrado ao usuário em vez de escondido.
 *
 * O que os conectores fazem de útil e honesto: quando a plataforma publica o
 * formulário (Greenhouse publica), buscam as PERGUNTAS REAIS da vaga para que o
 * mapeador prepare as respostas certas, na ordem certa, prontas para colar.
 */
import type { ApplicationMethod, SourceKind } from '../../../shared/discovery/types';
import { fetchGreenhouseQuestions } from '../discovery/connectors/greenhouse';
import { GENERIC_QUESTIONS, type QuestionInput } from './field-mapping';

export interface ApplicationConnectorContext {
  sourceJobId: string;
  /** Board/slug da empresa no ATS. */
  identifier: string;
  applicationUrl: string;
  signal?: AbortSignal;
}

export interface ApplicationFormResult {
  questions: QuestionInput[];
  /** `source` = perguntas reais da vaga; `generic` = conjunto padrão. */
  origin: 'source' | 'generic';
  warnings: string[];
}

export interface ApplicationConnector {
  readonly kind: SourceKind | 'generic';
  readonly label: string;
  /** Submissão automática nunca é oferecida — ver cabeçalho. */
  readonly canAutoSubmit: false;
  readonly autoSubmitReason: string;
  readonly applicationMethod: ApplicationMethod;
  loadForm(context: ApplicationConnectorContext): Promise<ApplicationFormResult>;
}

const NO_PUBLIC_SUBMIT =
  'Esta candidatura precisa ser concluída na plataforma da empresa. A submissão automática exigiria credenciais do empregador ou burlar proteções — o JobPilot não faz isso.';

function mapGreenhouseFieldType(type: string | undefined): string {
  switch (type) {
    case 'input_file':
      return 'input_file';
    case 'textarea':
      return 'textarea';
    case 'multi_value_single_select':
      return 'select';
    case 'multi_value_multi_select':
      return 'multiselect';
    default:
      return 'input_text';
  }
}

/**
 * Greenhouse é o único ATS integrado que publica o formulário da vaga.
 * Isso permite preparar respostas para as perguntas EXATAS do processo.
 */
export const greenhouseApplicationConnector: ApplicationConnector = {
  kind: 'greenhouse',
  label: 'Greenhouse',
  canAutoSubmit: false,
  autoSubmitReason: NO_PUBLIC_SUBMIT,
  applicationMethod: 'ats_form',

  async loadForm(context: ApplicationConnectorContext): Promise<ApplicationFormResult> {
    if (!context.identifier || !context.sourceJobId) {
      return { questions: GENERIC_QUESTIONS, origin: 'generic', warnings: [] };
    }

    try {
      const raw = await fetchGreenhouseQuestions(context.identifier, context.sourceJobId, context.signal);
      const questions: QuestionInput[] = [];

      for (const question of raw) {
        const label = question.label?.trim();
        if (!label) continue;
        const field = question.fields?.[0];
        questions.push({
          key: field?.name ?? label,
          label,
          required: question.required === true,
          type: mapGreenhouseFieldType(field?.type),
          options: (field?.values ?? [])
            .map((option) => option.label ?? String(option.value ?? ''))
            .filter(Boolean)
            .slice(0, 40),
          description: question.description ?? null,
        });
      }

      if (questions.length === 0) {
        return { questions: GENERIC_QUESTIONS, origin: 'generic', warnings: ['A vaga não publicou o formulário.'] };
      }
      return { questions, origin: 'source', warnings: [] };
    } catch (error) {
      // Falha ao buscar o formulário não impede preparar a candidatura.
      return {
        questions: GENERIC_QUESTIONS,
        origin: 'generic',
        warnings: [
          `Não foi possível ler o formulário publicado (${error instanceof Error ? error.message : 'erro desconhecido'}). Usando os campos mais comuns.`,
        ],
      };
    }
  },
};

/** Lever e Ashby não publicam o formulário; preparamos o conjunto padrão. */
function makeGenericAtsConnector(kind: SourceKind, label: string): ApplicationConnector {
  return {
    kind,
    label,
    canAutoSubmit: false,
    autoSubmitReason: NO_PUBLIC_SUBMIT,
    applicationMethod: 'ats_form',
    async loadForm(): Promise<ApplicationFormResult> {
      return {
        questions: GENERIC_QUESTIONS,
        origin: 'generic',
        warnings: [`${label} não publica as perguntas da vaga; os campos abaixo são os mais comuns.`],
      };
    },
  };
}

export const leverApplicationConnector = makeGenericAtsConnector('lever', 'Lever');
export const ashbyApplicationConnector = makeGenericAtsConnector('ashby', 'Ashby');

/** Vagas de agregadores levam ao site do empregador — formulário desconhecido. */
export const externalApplicationConnector: ApplicationConnector = {
  kind: 'generic',
  label: 'Site do empregador',
  canAutoSubmit: false,
  autoSubmitReason:
    'A candidatura acontece no site da empresa, com formulário próprio. O JobPilot prepara suas respostas para você colar lá.',
  applicationMethod: 'external_site',
  async loadForm(): Promise<ApplicationFormResult> {
    return { questions: GENERIC_QUESTIONS, origin: 'generic', warnings: [] };
  },
};

const REGISTRY: Partial<Record<SourceKind, ApplicationConnector>> = {
  greenhouse: greenhouseApplicationConnector,
  lever: leverApplicationConnector,
  ashby: ashbyApplicationConnector,
};

/** Conector de candidatura para a fonte da vaga; cai no genérico quando não há. */
export function getApplicationConnector(source: string | null | undefined): ApplicationConnector {
  if (!source) return externalApplicationConnector;
  return REGISTRY[source as SourceKind] ?? externalApplicationConnector;
}
