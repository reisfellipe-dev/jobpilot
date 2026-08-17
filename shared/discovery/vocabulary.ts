/**
 * Vocabulário usado para inferência determinística sobre o texto da vaga.
 *
 * Tudo que sai daqui é marcado como `inferred` (§4): são deduções do sistema a
 * partir do texto, não campos entregues pela fonte.
 */

/**
 * Tecnologias reconhecidas. Cada entrada é a forma canônica; as variações são
 * resolvidas por `canonicalSkill` do motor de matching, que já é compartilhado
 * com o score — as duas pontas falam o mesmo vocabulário.
 */
export const TECH_VOCABULARY: string[] = [
  // Linguagens
  'javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'go', 'rust', 'ruby', 'php',
  'kotlin', 'swift', 'scala', 'elixir', 'dart', 'r', 'perl', 'lua', 'clojure', 'haskell',
  // Front-end
  'react', 'next.js', 'vue', 'nuxt', 'angular', 'svelte', 'solid.js', 'astro', 'remix',
  'html', 'css', 'sass', 'tailwind', 'bootstrap', 'styled-components', 'material ui',
  'redux', 'zustand', 'react-query', 'webpack', 'vite', 'babel', 'storybook',
  // Back-end
  'node.js', 'express', 'nest.js', 'fastify', 'django', 'flask', 'fastapi', 'rails',
  'laravel', 'symfony', 'springboot', 'spring', 'quarkus', '.net', 'asp.net', 'phoenix',
  'graphql', 'rest', 'grpc', 'websocket', 'microservicos', 'serverless',
  // Dados
  'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb',
  'sqlserver', 'oracle', 'sqlite', 'firebase', 'supabase', 'snowflake', 'bigquery',
  'databricks', 'spark', 'hadoop', 'kafka', 'rabbitmq', 'airflow', 'dbt', 'etl',
  'sql', 'nosql', 'pandas', 'numpy', 'power bi', 'tableau', 'looker',
  // Infra e DevOps
  'aws', 'azure', 'google cloud', 'docker', 'kubernetes', 'terraform', 'ansible',
  'jenkins', 'github actions', 'gitlab ci', 'circleci', 'ci/cd', 'linux', 'nginx',
  'prometheus', 'grafana', 'datadog', 'sentry', 'cloudflare', 'vercel', 'heroku',
  // Mobile
  'react-native', 'flutter', 'android', 'ios', 'swiftui', 'jetpack compose', 'expo',
  // IA e ML
  'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'scikit-learn',
  'langchain', 'llm', 'nlp', 'computer vision', 'mlops',
  // Testes e qualidade
  'jest', 'vitest', 'cypress', 'playwright', 'selenium', 'junit', 'pytest',
  'testing-library', 'tdd', 'bdd', 'testes unitarios',
  // Práticas e ferramentas
  'git', 'github', 'gitlab', 'bitbucket', 'jira', 'scrum', 'kanban', 'agile',
  'oop', 'design patterns', 'clean architecture', 'ddd', 'solid', 'figma',
];

/**
 * Termos curtos que colidem com palavras comuns e por isso NÃO são extraídos
 * por busca simples. Ex.: "rest of the team" não é REST; "R$ 5.000" não é a
 * linguagem R; "go to production" não é Golang.
 * Só contam quando aparecem em um contexto inequívoco.
 */
export const AMBIGUOUS_TECH_PATTERNS: Record<string, RegExp> = {
  r: /\b(?:linguagem r|r language|\br\s*&\s*python\b)/i,
  go: /\b(?:golang|go lang|linguagem go|go\s+(?:developer|engineer|dev|backend))/i,
  rest: /\b(?:rest\s*api|restful|api\s*rest|web\s*services?\s*rest)/i,
};

interface SeniorityPattern {
  seniority: string;
  patterns: RegExp[];
}

/**
 * Ordem importa: o primeiro padrão que casar vence. Estágio e trainee vêm antes
 * porque "estágio em time sênior" deve ser lido como estágio.
 *
 * IMPORTANTE: os padrões são aplicados sobre texto JÁ NORMALIZADO
 * (minúsculo e sem acento), por isso são escritos sem acentuação.
 * Escrevê-los com acento faria "Estágio" nunca casar.
 */
export const SENIORITY_PATTERNS: SeniorityPattern[] = [
  { seniority: 'estagio', patterns: [/\bestagi(o|ario|aria|arios)\b/, /\bintern(ship)?\b/, /\bestagiar\b/] },
  { seniority: 'trainee', patterns: [/\btrainee\b/, /\baprendiz\b/, /\bgraduate program\b/] },
  { seniority: 'gerente', patterns: [/\bgerente\b/, /\bmanager\b/, /\bhead of\b/, /\bdiretor\b/, /\bdirector\b/] },
  { seniority: 'lead', patterns: [/\btech lead\b/, /\bteam lead\b/, /\blider tecnic/, /\bstaff engineer\b/, /\bprincipal\b/] },
  { seniority: 'especialista', patterns: [/\bespecialista\b/, /\bspecialist\b/, /\bexpert\b/] },
  { seniority: 'senior', patterns: [/\bsenior\b/, /\bsr\.?\b/, /\biii\b/] },
  { seniority: 'junior', patterns: [/\bjunior\b/, /\bjr\.?\b/, /\bentry[- ]level\b/] },
  { seniority: 'pleno', patterns: [/\bpleno\b/, /\bmid[- ]?level\b/, /\bmid\b/, /\bii\b/] },
];

export const REMOTE_PATTERNS = [
  /\bremoto?\b/i, /\bremote\b/i, /\b100% remoto\b/i, /\banywhere\b/i,
  /\bhome[- ]office\b/i, /\btrabalho remoto\b/i, /\bfully remote\b/i, /\bwork from home\b/i,
];

export const HYBRID_PATTERNS = [/\bh[ií]brido\b/i, /\bhybrid\b/i, /\bsemi[- ]presencial\b/i];

export const ONSITE_PATTERNS = [/\bpresencial\b/i, /\bon[- ]?site\b/i, /\bin[- ]office\b/i];

/** Normalização de tipo de contratação vindo das fontes. */
export const EMPLOYMENT_TYPE_PATTERNS: Array<{ type: string; patterns: RegExp[] }> = [
  { type: 'estagio', patterns: [/\bintern(ship)?\b/i, /\best[aá]gi/i] },
  { type: 'clt', patterns: [/\bclt\b/i, /\bcarteira assinada\b/i, /\befetivo\b/i] },
  { type: 'pj', patterns: [/\bpj\b/i, /\bpessoa jur[ií]dica\b/i, /\bcontractor\b/i] },
  { type: 'freelance', patterns: [/\bfreelance\b/i, /\bfreela\b/i] },
  { type: 'temporario', patterns: [/\btempor[aá]ri/i, /\btemporary\b/i, /\bcontract\b/i] },
  { type: 'meio_periodo', patterns: [/\bpart[- ]?time\b/i, /\bmeio per[ií]odo\b/i] },
  { type: 'integral', patterns: [/\bfull[- ]?time\b/i, /\btempo integral\b/i] },
];

/** Cabeçalhos que iniciam a seção de requisitos obrigatórios. */
export const REQUIREMENT_HEADINGS = [
  'requisitos', 'requisitos obrigatorios', 'requisitos tecnicos', 'o que esperamos',
  'o que buscamos', 'o que voce precisa', 'quem procuramos', 'perfil desejado',
  'qualificacoes', 'requirements', 'qualifications', 'what you need', 'what we expect',
  'what you bring', 'who you are', 'must have', 'basic qualifications', 'skills',
  'você precisa ter', 'voce precisa ter', 'é necessário', 'e necessario',
];

/** Cabeçalhos que iniciam a seção de diferenciais. */
export const NICE_TO_HAVE_HEADINGS = [
  'diferenciais', 'desejavel', 'desejaveis', 'sera um diferencial', 'nice to have',
  'nice-to-have', 'preferred', 'preferred qualifications', 'bonus', 'bonus points',
  'plus', 'is a plus', 'valorizamos', 'conte pontos', 'good to have',
  'preferencial', 'opcional',
];

/** Cabeçalhos que encerram a seção de requisitos (benefícios, cultura etc.). */
export const CLOSING_HEADINGS = [
  'beneficios', 'benefits', 'o que oferecemos', 'what we offer', 'perks',
  'sobre a empresa', 'about us', 'about the company', 'nossa cultura', 'our culture',
  'processo seletivo', 'hiring process', 'como se candidatar', 'how to apply',
  'responsabilidades', 'responsibilities', 'suas atividades', 'o que voce vai fazer',
  'what you will do', 'day to day',
];
