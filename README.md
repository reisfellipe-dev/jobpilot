# LippzAutoApply — Career OS

Plataforma pessoal de inteligência para candidaturas profissionais.
Um perfil como fonte de verdade, vários currículos derivados dele, análise de vagas
com score explicável, adaptação de currículo sem invenção de fatos e acompanhamento
das candidaturas — tudo usável do celular.

---

## Sumário

- [Visão geral](#visão-geral)
- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Discovery Engine](#discovery-engine)
- [Candidatura assistida](#candidatura-assistida)
- [Como o score é calculado](#como-o-score-é-calculado)
- [Política anti-alucinação](#política-anti-alucinação)
- [Setup](#setup)
  - [1. Supabase](#1-supabase)
  - [2. Provedores de IA](#2-provedores-de-ia)
  - [3. Variáveis de ambiente](#3-variáveis-de-ambiente)
  - [4. Desenvolvimento local](#4-desenvolvimento-local)
- [Deploy na Vercel](#deploy-na-vercel)
- [Testes](#testes)
- [Segurança e privacidade](#segurança-e-privacidade)
- [Decisões de arquitetura](#decisões-de-arquitetura)
- [Referência da API](#referência-da-api)
- [Troubleshooting](#troubleshooting)
- [Limites conhecidos](#limites-conhecidos)

---

## Visão geral

| Área | O que faz |
|---|---|
| **Perfil** | Fonte única de verdade: dados, experiências, projetos, skills, formação, certificações, idiomas, objetivo de carreira. |
| **Currículos** | Várias versões do mesmo profissional (Front-end, Back-end, Estágio…). Importação de PDF/DOCX, criação manual, edição completa, duplicação, exportação. |
| **Descobrir** | Busca vagas em APIs públicas (Greenhouse, Lever, Ashby, Remotive, Remote OK, Arbeitnow), normaliza, deduplica entre fontes e ranqueia por aderência + recência. |
| **Vagas** | Cadastro por texto colado, manual ou com link de referência. A IA separa requisitos obrigatórios, diferenciais e tecnologias. |
| **Análise** | Estrutura a vaga, calcula o score de **todos** os currículos, aponta o recomendado e explica o porquê. |
| **Adaptação** | Reescreve e reordena um currículo para a vaga, com verificação automática contra invenção de fatos. |
| **Textos** | Carta de apresentação, mensagem para recrutador, "fale sobre você", por que a empresa, por que a vaga, pretensão salarial e perguntas do processo. |
| **Candidatura assistida** | Lê as perguntas reais do formulário (quando a plataforma as publica), preenche o que existe no perfil e marca explicitamente o que exige sua revisão. |
| **Candidaturas** | Kanban de 7 etapas, respostas salvas, observações, histórico. |

---

## Stack

**Frontend** — React 18, TypeScript (strict), Vite 5, Tailwind CSS 4, React Router 6, TanStack Query 5, Zod, lucide-react.
**Backend** — Vercel Serverless Functions (Node, TypeScript).
**Dados** — Supabase PostgreSQL com Row Level Security · Supabase Auth · Supabase Storage.
**IA** — Groq (principal) e NVIDIA NIM (fallback), atrás de uma abstração de provider.
**Descoberta** — conectores para APIs públicas de vagas, sem SDK proprietário (fetch nativo).
**PWA** — manifest, ícones, service worker de app shell.

> A aplicação **não depende da Anthropic em runtime**. Não há `@anthropic-ai/sdk`,
> `ANTHROPIC_API_KEY` nem qualquer chamada à Anthropic no código publicado.
> Isso é verificado automaticamente por `npm run audit:secrets`.

---

## Arquitetura

```
Navegador (React SPA)
   │  JWT do Supabase em cada requisição
   ▼
/api/* — função serverless única com roteador interno
   │
   ├── AuthService      (valida o JWT no Supabase)
   ├── ResumeService    (currículos e versões adaptadas)
   ├── JobService       (vagas)
   ├── MatchingService  (score determinístico + camada semântica)
   ├── DiscoveryService (conectores → normalização → dedupe → ranking)
   │     └── connectors/  greenhouse · lever · ashby · remotive · remoteok · arbeitnow
   ├── ApplicationService (plano de candidatura + mapeamento de campos)
   ├── FileService      (upload direto do navegador ao Storage)
   └── AIService
         ├── GroqProvider   ─┐
         └── NvidiaProvider ─┴─ mesma interface AIProvider
   ▼
Supabase — PostgreSQL (RLS) + Storage (bucket privado)
```

### Camada de IA

```ts
interface AIProvider {
  isConfigured(): boolean;
  supportsJsonMode(): boolean;
  generate(request): Promise<AIResult>;
  generateStructured<T>(request): Promise<AIStructuredResult<T>>;
  analyze<T>(request): Promise<AIStructuredResult<T>>;  // temperatura baixa
}
```

Groq e NVIDIA NIM expõem a mesma API compatível com OpenAI, então ambos herdam de
`OpenAICompatibleProvider` — a diferença entre providers é apenas configuração.
Adicionar um terceiro provider compatível é uma classe de 4 linhas; nenhum
componente React muda.

**Nenhum componente React conhece Groq ou NVIDIA.** Todo acesso a provider passa
por `/api/ai/*`, que roda no servidor.

### Fallback (§6)

| Situação | Faz fallback? |
|---|---|
| Provider principal fora do ar (5xx), timeout, rede | Sim |
| Credencial recusada (401/403) | Sim |
| Limite de requisições do provider (429) | Sim |
| Resposta inválida após 2 tentativas | Sim |
| **Conteúdo maior que o contexto do modelo** | **Não** — falharia igual no outro |
| **Operação pesada e usuário desativou o fallback** | **Não** — evita custo sem controle |
| `AI_PROVIDER` fixado em `groq` ou `nvidia` | Não |

O provider realmente usado é gravado em `ai_usage` e mostrado na interface.

---

## Discovery Engine

Busca vagas em fontes públicas, normaliza, deduplica e ranqueia — **sem nenhuma
chamada de IA**. Descobrir e ordenar centenas de vagas por sincronização com IA
seria caro e lento; aqui tudo é determinístico, reproduzível e explicável. A IA
entra depois, sob demanda, quando você abre uma vaga específica.

```
Connector → Raw Job → Normalizer → Pré-filtro → Deduplicador
         → Repositório → Matching determinístico → Ranking
```

### Fontes integradas

Todas com **API pública documentada, sem autenticação e sem contornar nada**.
Cada uma foi verificada de verdade — veja `tests/connectors.integration.test.ts`.

| Fonte | Tipo | Endpoint | Precisa configurar |
|---|---|---|---|
| Greenhouse | ATS por empresa | `boards-api.greenhouse.io/v1/boards/{board}/jobs` | board da empresa |
| Lever | ATS por empresa | `api.lever.co/v0/postings/{slug}` | slug da empresa |
| Ashby | ATS por empresa | `api.ashbyhq.com/posting-api/job-board/{board}` | board da empresa |
| Remotive | Quadro aberto | `remotive.com/api/remote-jobs` | nada |
| Remote OK | Quadro aberto | `remoteok.com/api` | nada |
| Arbeitnow | Quadro aberto | `arbeitnow.com/api/job-board-api` | nada |

Os três quadros abertos são ativados sozinhos no primeiro uso. Para acompanhar
uma empresa específica, cole a URL da página de carreiras: o sistema identifica o
ATS, **valida contra a API de verdade** e só então cadastra a fonte. Slug errado
resulta em erro imediato, não em fonte fantasma que nunca traz nada.

### O que NÃO é suportado — e por quê

Isto está na interface, não escondido no código:

| Plataforma | Motivo |
|---|---|
| LinkedIn | Sem API pública de vagas; automação proibida nos Termos de Uso e protegida por anti-bot |
| Gupy | Sem API pública documentada para terceiros |
| Indeed | API de publicação descontinuada para novos parceiros; raspagem bloqueada |
| Catho, Vagas.com, InfoJobs, Glassdoor | Sem API pública acessível |

Vagas dessas plataformas continuam totalmente utilizáveis: cadastre manualmente
colando a descrição. Análise, matching, adaptação e geração de textos funcionam
igual. **Nenhuma linha do projeto tenta burlar CAPTCHA, autenticação, bloqueio ou
rate limit** — isso é verificado na revisão e declarado aqui de propósito.

### Deduplicação entre fontes

A mesma vaga aparece no site da empresa, no ATS e em agregadores. Duas camadas:

1. **Impressão digital exata** — empresa normalizada (sem "Ltda", "Inc") + título
   normalizado ("Sr." = "Senior", "Front-End" = "frontend") + agrupador de local.
2. **Similaridade** — mesma empresa e títulos equivalentes acima de 82%.

O resultado é uma vaga com todas as URLs preservadas: *"Encontrada em 3 fontes"*.
Detalhe que os testes protegem: a mesma vaga em **cidades diferentes** continua
sendo duas vagas.

### Relevância = aderência + recência

```
relevância = 72% × match determinístico + 28% × recência
```

Recência decai por faixas (≤6h = 1,0 · ≤24h = 0,95 · ≤7d = 0,7 · ≤30d = 0,4 · +60d = 0,1).
Vaga sem data recebe valor **neutro**, nunca penalidade. O card mostra o cálculo:

```
MATCH 93%   ·   publicada há 4 horas   ·   relevância muito alta
✓ React   ✓ TypeScript   ✓ Frontend   ✓ Remoto
! Next.js
```

### Controle de custo e respeito às fontes

- **Pré-filtro determinístico** descarta o que não tem relação com o perfil antes
  de qualquer processamento caro.
- **Busca incremental**: cada fonte guarda `last_sync_at` e só traz o que mudou.
- **Cache por impressão digital**: vaga inalterada não é reprocessada.
- Timeout, retry com backoff exponencial, `Retry-After` obedecido, concorrência
  limitada a 3 fontes e circuit breaker por host.
- Falha de uma fonte **não derruba as outras** — a tela informa quais falharam.

### Sincronização automática

Existe, e é **client-side** por decisão de segurança: ao abrir o app, se a opção
estiver ligada e a última busca tiver mais de 12 horas, a sincronização dispara em
segundo plano.

Não há cron no servidor porque um agendamento sem o usuário presente precisaria de
uma credencial administrativa capaz de ler dados de qualquer usuário, contornando a
Row Level Security. Este projeto não usa esse tipo de credencial em lugar nenhum —
e essa garantia vale mais do que a conveniência de um cron.

---

## Candidatura assistida

Ao tocar em **Preparar candidatura**, o LippzAutoApply monta o formulário com base no
perfil, no currículo recomendado e nas perguntas reais da vaga.

### Estados de cada campo

Nenhuma resposta aparece sem procedência declarada:

| Estado | Significado | Exemplo |
|---|---|---|
| `KNOWN` | Existe no perfil, textualmente | E-mail, LinkedIn, "tem experiência com React?" → Sim |
| `INFERRED` | Calculado pelo sistema — confira | "Anos de experiência" = 3, somando períodos sem sobreposição |
| `UNKNOWN` | Sem base no perfil | Telefone não cadastrado |
| `USER_REQUIRED` | Só você pode responder | Visto, pretensão salarial, autodeclaração, upload de arquivo |

Pergunta específica da vaga que não se encaixa em nada disso vai para **revisão
obrigatória** — o sistema não responde por você sem base (§18).

Pergunta do tipo *"você tem experiência com X?"* consulta as suas skills: se X está
no perfil, responde **Sim com a evidência**; se não está, responde **Não marcado
como dedução**, explicando que a ausência é do perfil e não da sua vida. Respostas
que você revisa podem ser salvas e são reaproveitadas nas próximas vagas.

### Por que não existe envio automático

O Greenhouse é o único ATS integrado que publica o formulário da vaga — por isso
conseguimos preparar as perguntas **exatas** do processo. Mas **nenhuma** das
plataformas permite que um terceiro submeta a candidatura sem credencial privada
do empregador:

- Greenhouse: o POST de candidatura exige a API key do board (do empregador);
- Lever e Ashby: não publicam endpoint de submissão para terceiros;
- Sites próprios: formulário arbitrário, atrás de anti-bot.

Implementar "preenchimento automático" exigiria automação de navegador contra essas
proteções. O produto não faz isso. Então a tela diz, com todas as letras: *"O envio
é feito por você, na plataforma da empresa"* — e entrega tudo pronto para colar,
com botão direto para o formulário. Prometer o contrário seria mentira.

---

## Como o score é calculado

O score é **determinístico e auditável**. A IA não o calcula.

| Componente | Peso | Como é medido |
|---|---:|---|
| Requisitos obrigatórios | 40 | Cobertura das skills exigidas (match parcial vale 0,6) |
| Requisitos desejáveis | 12 | Mesma lógica, sobre os diferenciais |
| Aderência ao cargo | 14 | Similaridade F1 entre o título da vaga e os cargos-alvo/histórico |
| Senioridade | 12 | Distância ordinal; abaixo do pedido pesa mais que acima |
| Tempo de experiência | 10 | Anos reais (união de intervalos) vs. mínimo exigido |
| Modalidade e local | 6 | Remoto sempre casa; presencial confronta preferências |
| Palavras-chave / ATS | 6 | Presença dos termos que um ATS buscaria |
| **Total** | **100** | |

Quando a vaga não informa um critério, ele recebe valor **neutro (0,7)** — não pune
nem premia. Cada componente aparece na interface com pontos, motivo e o que faltou.

Depois disso, a IA pode propor um **ajuste semântico de no máximo ±10 pontos**
(equivalência real não capturada por palavra-chave, ou palavra que bate mas contexto
que não sustenta). O ajuste é sempre exibido separado do score base:

```
Base 78 · ajuste da IA +6 → 84
```

Se a camada semântica falhar, o resultado determinístico continua válido e é exibido.

---

## Política anti-alucinação

Duas camadas independentes:

**1. Prompt** — toda operação sobre dados profissionais carrega uma política que
proíbe inventar empresas, cargos, experiências, tecnologias, certificações,
formação, idiomas, projetos, métricas, resultados e responsabilidades. Informação
inexistente é reportada como ausente, nunca preenchida por inferência.

**2. Verificação determinística** — depois que a IA adapta um currículo,
`enforceResumeIntegrity()` compara a saída com o original e **remove** o que não
existir na fonte de verdade:

- empresa que não está no currículo original → experiência descartada;
- cargo alterado → restaurado;
- datas alteradas → restauradas;
- tecnologia acrescentada a uma experiência → removida;
- skill, certificação, formação, idioma ou projeto inventado → removido;
- experiência omitida pela IA → reinserida (o histórico não pode sumir);
- nome e contato nunca vêm da IA.

Cada correção aplicada é mostrada ao usuário antes de salvar. Prompt é instrução;
esta verificação é garantia. Coberta por 12 testes em `tests/resume-integrity.test.ts`.

---

## Setup

Pré-requisitos: **Node 20+** e uma conta no Supabase.

```bash
npm install
```

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** e execute, **nesta ordem**:
   - `supabase/migrations/0001_init.sql` — tabelas, índices, triggers, RLS, bucket
     privado `resumes` e funções de rate limit;
   - `supabase/migrations/0002_discovery.sql` — fontes, sincronizações, empresas,
     deduplicação, matches, notificações e respostas reutilizáveis.
   Ambas são idempotentes: rodar de novo não quebra nada.
3. Em **Authentication → Providers**, mantenha *Email* habilitado.
   Para uso pessoal, considere desabilitar novos cadastros depois de criar sua conta
   (*Authentication → Sign In / Providers → Allow new users to sign up*).
4. Em **Authentication → URL Configuration**, adicione a URL da Vercel em
   *Site URL* e em *Redirect URLs* inclua `https://SEU-APP.vercel.app/redefinir-senha`.
5. Copie **Project URL** e **anon public key** em *Settings → API*.

A `anon key` é pública por design — ela apenas identifica o projeto. O isolamento
entre usuários vem inteiramente da RLS.

### 2. Provedores de IA

**Groq (principal)** — crie uma chave em [console.groq.com/keys](https://console.groq.com/keys).
Modelo sugerido: `llama-3.3-70b-versatile`.

**NVIDIA NIM (fallback, opcional)** — crie uma chave em [build.nvidia.com](https://build.nvidia.com).
Modelo sugerido: `meta/llama-3.3-70b-instruct`.

Nenhum modelo está fixo no código. Se o modelo configurado não suportar JSON mode,
a aplicação detecta o erro, repete sem `response_format` e continua funcionando.

### 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

| Variável | Onde | Obrigatória | Descrição |
|---|---|:---:|---|
| `VITE_SUPABASE_URL` | navegador | ✅ | URL do projeto |
| `VITE_SUPABASE_ANON_KEY` | navegador | ✅ | Chave anônima (pública por design) |
| `SUPABASE_URL` | servidor | ✅ | Mesmo valor, sem prefixo |
| `SUPABASE_ANON_KEY` | servidor | ✅ | Mesmo valor, sem prefixo |
| `AI_PROVIDER` | servidor | — | `auto` (padrão), `groq` ou `nvidia` |
| `AI_FALLBACK_ENABLED` | servidor | — | `true` (padrão) |
| `GROQ_API_KEY` | servidor | ▲ | Necessária se usar Groq |
| `GROQ_MODEL` | servidor | — | Padrão `llama-3.3-70b-versatile` |
| `NVIDIA_API_KEY` | servidor | ▲ | Necessária se usar NVIDIA |
| `NVIDIA_MODEL` | servidor | — | Padrão `meta/llama-3.3-70b-instruct` |
| `AI_TIMEOUT_MS` | servidor | — | Padrão `45000` |
| `AI_MAX_OUTPUT_TOKENS` | servidor | — | Padrão `4000` |

▲ Pelo menos um dos dois provedores precisa estar configurado para as funções de IA.
Sem nenhum, o resto da aplicação continua funcionando e a interface avisa.

**Proibido por arquitetura:** `VITE_GROQ_API_KEY`, `VITE_NVIDIA_API_KEY`,
`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. O script de auditoria falha o
build se alguma dessas aparecer.

### 4. Desenvolvimento local

```bash
npm run dev         # front + API em http://localhost:5173
```

Um comando serve tudo: o plugin `vite-api-dev.ts` executa `api/index.ts` dentro do
servidor do Vite, com hot reload também no backend. Não é preciso `vercel dev`
nem um segundo processo.

O servidor escuta em todas as interfaces, então dá para abrir do celular pelo
endereço `Network` que aparece no terminal (mesma rede Wi-Fi) — útil para testar
o layout mobile de verdade.

Variáveis sem o prefixo `VITE_` (as do servidor) são lidas de `.env.local` e
injetadas em `process.env`, igual à Vercel. **Alterou `.env.local`? Reinicie o
`npm run dev`** — o arquivo é lido na inicialização.

```bash
npm run typecheck       # TypeScript strict em src/, api/, shared/ e tests/
npm test                # 165 testes
npm run build           # typecheck + build + auditoria de segredos (falha o deploy se algo escapar)
npm run audit:secrets   # só a auditoria
npm run icons           # regenera os ícones do PWA
```

---

## Deploy na Vercel

1. Suba o repositório para o GitHub.
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
   O framework Vite é detectado; `vercel.json` já define build, rewrites e headers.
3. Em **Settings → Environment Variables**, cadastre todas as variáveis da tabela
   acima (Production e Preview).
4. Deploy.
5. Volte ao Supabase e adicione a URL da Vercel em *Authentication → URL Configuration*.
6. Abra `https://SEU-APP.vercel.app/api/health` para confirmar a configuração:

```json
{
  "status": "ok",
  "config": {
    "supabaseConfigured": true,
    "aiProvider": "auto",
    "providers": { "groq": { "configured": true, "model": "llama-3.3-70b-versatile" } }
  }
}
```

Esse endpoint nunca devolve valores de chave — apenas se estão presentes.

**Instalar no celular:** abra o site, use *Adicionar à tela de início*.
O app abre em tela cheia, com ícone próprio.

### Compatibilidade com serverless

- Nenhum processo Node persistente; sem `setInterval` de background.
- Nenhuma escrita em disco: arquivos vão para o Supabase Storage.
- Rate limit em Postgres, não em memória — vale para todas as instâncias.
- Uma única função (`api/index.ts`), bem abaixo do limite do plano Hobby.
- `maxDuration: 60s`, suficiente para a análise (duas chamadas de LLM em sequência).

---

## Testes

```bash
npm test
```

276 testes cobrindo:

| Arquivo | Cobertura |
|---|---|
| `router.test.ts` | Despacho real da função serverless: rota pública, 404 vs 405, e **toda rota protegida rejeitando requisição sem sessão** |
| `normalize.test.ts` | Canonicalização de skills, sinônimos, tokenização, datas, união de períodos, extração de "X anos" |
| `score.test.ts` | Pesos somando 100, match exato/parcial/ausente, senioridade, currículo vazio, vaga vazia, score sempre em 0–100, soma dos componentes = score, ranking, teto do ajuste semântico |
| `json.test.ts` | JSON em markdown, truncado, com vírgula sobrando, aspas tipográficas, comentários, irrecuperável |
| `resume-integrity.test.ts` | Empresa/cargo/data/skill/certificação/formação/idioma/projeto inventados, experiência omitida, identidade preservada |
| `ai-service.test.ts` | Seleção de provider, fallback em cada tipo de falha, bloqueio de fallback em operação pesada, degradação de JSON mode, retry com correção, tradução de erros, ausência de vazamento de chave |
| `validation.test.ts` | Todos os schemas de entrada, incluindo rejeição de UUID falso, URL `javascript:`, data inexistente e payload não-objeto |
| `http.test.ts` | Bearer token, tradução de erros do Postgres (incluindo violação de RLS), limites de quota, diagnóstico sem segredos |
| `discovery-normalize.test.ts` | HTML→texto sem tags, extração de tecnologias (incluindo os falsos positivos "rest of the team", "R$", "go to production"), senioridade, modalidade, seções de requisitos, datas, e a regra de nunca inventar salário |
| `discovery-matching.test.ts` | Impressão digital entre fontes, normalização de empresa e título, URLs com rastreamento, deduplicação (incluindo cidades diferentes), recência, relevância, estratégia de busca e pré-filtro |
| `application-mapping.test.ts` | Detecção de ATS por URL, recusa explicada de plataformas sem integração, e os quatro estados de campo — incluindo a garantia de que nenhum conector promete envio automático |
| `connectors.integration.test.ts` | **Contrato real das seis APIs** (opt-in, ver abaixo) |

Os conectores têm ainda um teste de integração **contra as APIs de verdade**,
desligado por padrão para não depender de rede no build:

```bash
JOBPILOT_LIVE_TEST=1 npx vitest run tests/connectors.integration.test.ts
```

Ele confirma que Greenhouse, Lever, Ashby, Remotive, Remote OK e Arbeitnow ainda
respondem no formato esperado, que board inexistente falha de forma explícita e
que o Greenhouse continua publicando as perguntas do formulário. É o que impede o
projeto de prometer integração que não funciona mais.

O que **não** é coberto por teste automatizado: a RLS em si e o upload real ao
Storage — ambos exigem um Supabase ativo. A RLS é garantida no schema (toda tabela
com `enable row level security` e policies `auth.uid() = user_id`) e reforçada por
filtro explícito de `user_id` em cada query do servidor. Para verificar na prática,
crie duas contas e tente acessar o ID de um recurso da outra: a resposta é 404/403.

---

## Segurança e privacidade

**Autenticação e autorização**
- Supabase Auth com sessão persistente e refresh automático; rotas protegidas.
- Todo endpoint valida o JWT contra o Supabase — nada é deduzido do payload do cliente.
- O backend usa **anon key + JWT do usuário**, nunca `service_role`.
  Consequência: mesmo um bug de código não consegue ler dados de outro usuário,
  porque a RLS continua ativa no servidor.
- Além da RLS, toda query filtra `user_id` explicitamente (defesa em profundidade).
- IDs recebidos do cliente são validados como UUID antes de tocar o banco.

**Dados**
- RLS habilitada em todas as tabelas, com policy `auth.uid() = user_id`.
- Bucket `resumes` privado; políticas amarram o caminho ao `user_id`
  (`<user_id>/<uuid>/<arquivo>`); downloads usam URL assinada de 60 s.
- Constraints de tamanho e enum no próprio Postgres, além do Zod.

**Superfície de ataque reduzida**
- Sem scraping: a URL da vaga é guardada como referência e nunca é buscada pelo
  servidor — elimina SSRF por completo.
- Sem `dangerouslySetInnerHTML`, sem `eval`: todo texto de IA é renderizado como
  nó de texto e escapado pelo React.
- CSP restritiva, `X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy`.
- Rate limit por usuário e por operação, com teto diário (§44).

**Privacidade**
- Zero analytics, zero trackers, zero cookies de terceiros.
- Nenhum dado sai para a IA sem consentimento explícito, pedido uma vez e revogável
  em *Configurações → Privacidade*.
- Cada operação envia só o contexto necessário: análise de vaga não envia suas
  candidaturas; matching envia resumos curtos dos currículos, não os arquivos.
- O service worker cacheia **apenas** o app shell. Nada de `/api`, nada de dados
  pessoais em cache.
- Exportação completa em JSON e exclusão total dos dados na própria interface.
  O backup nunca contém chaves, tokens ou segredos.

---

## Decisões de arquitetura

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Função serverless única com roteador interno | Um arquivo por endpoint | O plano Hobby limita o número de funções; menos cold starts; roteamento em um lugar só |
| `api/index.ts` + rewrite | `api/[...route].ts` | Colchetes no nome do arquivo são interpretados como glob na chave `functions` |
| Anon key + JWT no servidor | `service_role` | Mantém a RLS ativa também no backend; elimina a classe de bug "esqueci o filtro de user_id" |
| Extração de PDF/DOCX no navegador | Upload multipart para a função | Sem multipart no serverless, bundle do servidor menor, custo de execução menor; só o texto vai para a IA |
| `fflate` + DOMParser para DOCX | `mammoth` | ~40 linhas contra uma dependência pesada com código Node no navegador |
| Rate limit em Postgres | Redis/Upstash | Custo zero, sem serviço extra, consistente entre instâncias serverless |
| URL da vaga só como referência | Scraping da página | Frágil, frequentemente proibido e abriria SSRF; o fluxo nunca trava porque o usuário cola o texto |
| Score determinístico + ajuste da IA limitado | Score só pela IA | Explicabilidade e reprodutibilidade; a IA corrige a margem, não define o resultado |
| Uma chamada semântica para todos os currículos | Uma chamada por currículo | Menos custo e comparação real entre eles no mesmo contexto |
| Cache por fingerprint de contexto | Cache por tempo | Reanalisa exatamente quando vaga ou currículos mudam, e só então |
| Tema escuro único | Claro + escuro | Uma paleta bem executada em vez de dois temas medianos |
| Discovery 100% determinístico, sem IA | Ranquear cada vaga com IA | Centenas de vagas por sincronização tornariam o custo e a latência inviáveis; e o ranking fica explicável |
| Conectores por ATS, não scraper universal | Um raspador genérico | Cada plataforma tem estrutura, proteção e termos próprios; scraper genérico quebra e desrespeita a fonte |
| Cadastro de fonte por URL, validado na hora | Lista fixa de empresas | Nada de fonte que responde 404 para sempre; e a lista não envelhece |
| Nenhum conector envia candidatura | Automação de navegador | Exigiria contornar anti-bot e autenticação — proibido pelo próprio briefing (§2, §33) |
| Sincronização automática no cliente | Vercel Cron | Cron multiusuário exigiria service_role, quebrando a garantia de RLS em toda a aplicação |
| Sem ESLint | ESLint + plugins | TypeScript strict (`noUncheckedIndexedAccess`, `noUnusedLocals`) + 143 testes já barram o que importa, sem mais uma engrenagem no build |

---

## Referência da API

Todas as rotas exigem `Authorization: Bearer <jwt>`, exceto `/api/health`.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/health` | Diagnóstico público (sem segredos) |
| `GET` `PATCH` | `/api/profile` | Perfil completo (com experiências, projetos e skills) |
| `POST` `PATCH` `DELETE` | `/api/experiences[/:id]` | Experiências |
| `POST` `PATCH` `DELETE` | `/api/projects[/:id]` | Projetos |
| `POST` `PATCH` `DELETE` | `/api/skills[/:id]` | Skills |
| `GET` `POST` | `/api/resumes` | Listar e criar currículos |
| `GET` `PATCH` `DELETE` | `/api/resumes/:id` | Currículo específico |
| `POST` | `/api/resumes/:id/duplicate` | Duplicar |
| `GET` `POST` | `/api/resumes/:id/versions` | Versões adaptadas |
| `DELETE` | `/api/resume-versions/:id` | Excluir versão |
| `GET` `POST` | `/api/jobs` | Listar e criar vagas |
| `GET` `PATCH` `DELETE` | `/api/jobs/:id` | Vaga específica |
| `GET` | `/api/jobs/:id/analysis` | Última análise + se está desatualizada |
| `POST` | `/api/jobs/:id/analyze` | Analisar (usa cache; `{"force":true}` reanalisa) |
| `GET` `POST` | `/api/applications` | Candidaturas |
| `GET` `PATCH` `DELETE` | `/api/applications/:id` | Candidatura específica |
| `PATCH` | `/api/applications/:id/status` | Mover no Kanban |
| `GET` `POST` | `/api/applications/:id/answers` | Textos salvos |
| `DELETE` | `/api/application-answers/:id` | Excluir texto |
| `POST` | `/api/ai/extract-resume` | Estruturar texto de currículo |
| `POST` | `/api/ai/extract-job` | Estruturar texto de vaga |
| `POST` | `/api/ai/adapt-resume` | Prévia da adaptação (não salva) |
| `POST` | `/api/ai/generate-answer` | Gerar texto de candidatura |
| `GET` | `/api/ai/status` | Providers configurados e quotas |
| `GET` `PATCH` | `/api/settings` | Preferências |
| `GET` | `/api/usage` | Consumo de IA nas últimas 24 h |
| `GET` | `/api/dashboard` | Agregados da tela inicial |
| `GET` | `/api/discovery/jobs` | Vagas descobertas, com filtros aplicados no servidor |
| `GET` | `/api/discovery/summary` | Contadores da tela Descobrir |
| `POST` | `/api/discovery/run` | Executa os conectores ativos |
| `GET` | `/api/discovery/strategy` | Estratégia de busca derivada do perfil, explicada |
| `PATCH` | `/api/discovery/jobs/:id` | Salvar, descartar ou restaurar uma vaga descoberta |
| `GET` `POST` | `/api/discovery/sources` | Fontes conectadas e saúde de cada uma |
| `POST` | `/api/discovery/sources/detect` | Detecta e **valida** o ATS a partir da URL de carreiras |
| `PATCH` `DELETE` | `/api/discovery/sources/:id` | Ativar, desativar ou remover fonte |
| `GET` | `/api/discovery/syncs` | Histórico de sincronizações |
| `GET` `POST` | `/api/notifications` | Notificações internas |
| `POST` | `/api/applications/plan` | Monta o plano de preenchimento da candidatura |
| `GET` `POST` `DELETE` | `/api/applications/field-answers` | Respostas reutilizáveis por pergunta |
| `GET` | `/api/export` | Backup JSON completo |
| `POST` | `/api/import` | Importação aditiva |
| `POST` | `/api/account/erase` | Apagar todos os dados (`{"confirm":"APAGAR"}`) |

Erros seguem sempre o mesmo formato:

```json
{ "error": { "code": "validation_failed", "message": "Os dados enviados são inválidos.", "details": { "issues": [] } } }
```

Códigos: `bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`,
`validation_failed`, `rate_limited`, `ai_unavailable`, `ai_not_configured`,
`ai_invalid_response`, `method_not_allowed`, `internal_error`.

---

## Troubleshooting

**"Configuração pendente" na tela inicial**
`VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` faltando. Na Vercel, variáveis
`VITE_*` são lidas **no build** — recadastre e faça um novo deploy.

**"Nenhum provider de IA está configurado"**
Nem `GROQ_API_KEY` nem `NVIDIA_API_KEY` chegaram à função. Confira em
`/api/health` e lembre que variáveis de servidor exigem redeploy.

**"Serviço de IA temporariamente indisponível"**
Os dois providers falharam. Veja o log da função na Vercel: cada tentativa é
registrada com provider e motivo. O resto do app continua utilizável.

**"A IA não devolveu uma resposta válida"**
O modelo configurado tem dificuldade com JSON. Troque `GROQ_MODEL` por um modelo
maior ou defina `GROQ_JSON_MODE=on` se ele suportar `response_format`.

**Limite de operações atingido**
Rate limit por usuário (§44). Os limites estão em `api/_services/ratelimit.ts` e o
consumo aparece em *Configurações*. Espere a janela ou ajuste os valores.

**"Quase nenhum texto foi encontrado" ao importar PDF**
O PDF é uma imagem digitalizada. Não há OCR: use a aba **Colar texto**.

**Erro 403 ao salvar**
Violação de RLS — normalmente a migration não foi executada por completo.
Rode `supabase/migrations/0001_init.sql` novamente (ele é idempotente).

**Upload falha com "new row violates row-level security policy"**
As políticas de `storage.objects` não foram criadas. Elas estão no fim da migration.

**Link de redefinição de senha não funciona**
Adicione `https://SEU-APP.vercel.app/redefinir-senha` em *Redirect URLs* no Supabase.

**Chamadas ao Supabase bloqueadas pela CSP**
Se você usa domínio customizado no Supabase, acrescente-o a `connect-src` no
`Content-Security-Policy` dentro de `vercel.json`.

**`npm run dev` retorna 404 em `/api/*`**
Esperado: use `vercel dev` para rodar as funções serverless localmente.

---

## Limites conhecidos

Escolhas conscientes desta primeira versão:

- **Sem envio automático de candidaturas.** O produto analisa, prepara, gera e
  registra; o envio continua com você. A arquitetura comporta uma extensão de
  navegador ou APIs oficiais no futuro.
- **Sem scraping de sites de vagas.** Cole a descrição; a URL fica como referência.
- **A descoberta cobre 6 fontes públicas**, não o mercado inteiro. LinkedIn, Gupy,
  Indeed e Catho não têm API pública — estão listados na interface com o motivo.
- **Nenhuma candidatura é enviada automaticamente**, em nenhuma plataforma. O
  produto prepara tudo; o envio é seu.
- **Sem cron no servidor.** A sincronização automática roda quando você abre o app.
- **Sem OCR.** PDFs digitalizados precisam do texto colado manualmente.
- **Sem exportação em PDF.** A exportação é `.txt` (compatível com ATS) e `.json`.
- **Análises não são reimportadas** no backup por serem dados derivados — reanalisar
  a vaga custa um clique e usa o contexto atual.
- **Excluir a conta de login** exige o painel do Supabase; a aplicação apaga todos os
  dados, mas não usa credencial administrativa em runtime — por decisão de segurança.
- **Tema escuro apenas.**

---

## Licença

Projeto pessoal. Use como quiser.
