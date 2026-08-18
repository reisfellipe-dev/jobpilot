import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Compass,
  FileText,
  Radar,
  Send,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/* -------------------------------------------------------------------------- */
/* Blocos de apoio                                                            */
/* -------------------------------------------------------------------------- */

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line pt-10">
      <h2 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h2>
      {lead && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{lead}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Step({
  number,
  icon: Icon,
  title,
  children,
}: {
  number: number;
  icon: typeof User;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      <div className="absolute left-[19px] top-11 bottom-0 w-px bg-line" aria-hidden />
      <div className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
        <Icon className="size-[18px]" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold tabular-nums text-ink-faint">{number}</span>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
        </div>
        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-ink-muted">{children}</div>
      </div>
    </li>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

function Term({ children }: { children: ReactNode }) {
  return <code className="rounded bg-elevated px-1 py-0.5 text-[0.8em] text-ink">{children}</code>;
}

const SCORE_ROWS = [
  ['Requisitos obrigatórios', 40, 'Cobertura das skills exigidas; match parcial vale 0,6'],
  ['Requisitos desejáveis', 12, 'Mesma lógica, aplicada aos diferenciais'],
  ['Aderência ao cargo', 14, 'Similaridade entre o título da vaga e seus cargos-alvo e histórico'],
  ['Senioridade', 12, 'Distância ordinal; ficar abaixo do pedido pesa mais que ficar acima'],
  ['Tempo de experiência', 10, 'Anos reais, unindo períodos sobrepostos, contra o mínimo exigido'],
  ['Modalidade e local', 6, 'Remoto sempre casa; presencial é confrontado com suas preferências'],
  ['Palavras-chave / ATS', 6, 'Presença dos termos que um filtro automático buscaria'],
] as const;

const SOURCES = [
  ['Greenhouse', 'ATS por empresa', 'Você informa o board da empresa'],
  ['Lever', 'ATS por empresa', 'Você informa o slug da empresa'],
  ['Ashby', 'ATS por empresa', 'Você informa o board da empresa'],
  ['Remotive', 'Quadro aberto', 'Ativado sozinho'],
  ['Remote OK', 'Quadro aberto', 'Ativado sozinho'],
  ['Arbeitnow', 'Quadro aberto', 'Ativado sozinho'],
] as const;

const TOC = [
  ['proposito', 'O propósito'],
  ['passo-a-passo', 'Passo a passo'],
  ['score', 'Como o score é calculado'],
  ['vagas', 'De onde vêm as vagas'],
  ['honestidade', 'Como ele evita inventar'],
  ['limites', 'Limites conscientes'],
] as const;

/* -------------------------------------------------------------------------- */

export function HowItWorksPage() {
  const { session } = useAuth();

  return (
    <div className="min-h-dvh bg-base">
      <header className="safe-top sticky top-0 z-30 border-b border-line bg-base/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg bg-accent text-[13px] font-bold text-white">L</div>
            <span className="text-sm font-semibold tracking-tight text-ink">LippzAutoApply</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle compact />
            <Link
              to={session ? '/' : '/entrar'}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {session ? 'Voltar ao app' : 'Entrar'}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:px-6">
        {/* --- Abertura --- */}
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Documentação</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Vagas com o quanto você se encaixa, e por quê
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted">
          O LippzAutoApply busca vagas em seis fontes públicas e calcula, para cada uma, um score de encaixe com o seu
          perfil. Não é uma opinião gerada por IA que muda a cada consulta: são sete critérios com peso declarado —
          requisitos obrigatórios, senioridade, tempo de experiência, modalidade — que somam 100 pontos, sempre com o
          motivo por trás do número.
        </p>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
          É diferente de colar a vaga num chat de IA: aqui o cálculo é reproduzível, os mesmos dados sempre dão o mesmo
          resultado, e você pode comparar vagas entre si com critério consistente. E é diferente de um agregador como
          LinkedIn ou Indeed: a relevância não é uma caixa-preta otimizada para engajamento — é uma fórmula que você
          pode ver por inteiro, logo abaixo.
        </p>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
          A partir daí, o LippzAutoApply também adapta seu currículo e redige os textos da candidatura — com uma verificação
          automática que impede a IA de inventar qualquer coisa que não esteja no seu histórico real.
        </p>

        {/* --- Sumário --- */}
        <nav aria-label="Nesta página" className="panel mt-8 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Nesta página</p>
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={'#' + id} className="text-sm text-accent-ink underline-offset-4 hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-12 space-y-12">
          {/* --- Propósito --- */}
          <Section
            id="proposito"
            title="O propósito"
            lead="Candidatar-se a uma vaga bem feita dá trabalho: reler a descrição, lembrar o que você já fez que tem a ver, reescrever o currículo naquela ordem, redigir uma carta que não seja genérica. Multiplique por dezenas de vagas e o gargalo deixa de ser competência e passa a ser tempo."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Card title="Uma fonte de verdade">
                Seu perfil concentra experiências, projetos, skills, formação e idiomas. Tudo o mais é derivado dele —
                nenhum dado é digitado duas vezes.
              </Card>
              <Card title="Comparação com critério">
                O encaixe entre você e a vaga vira um número com origem declarada, não um palpite. Você vê quanto cada
                critério pesou e o que faltou.
              </Card>
              <Card title="Escrita que parte do seu histórico">
                Adaptação de currículo e textos de candidatura sempre partem do que existe no seu perfil, nunca de uma
                biografia inventada.
              </Card>
              <Card title="Memória do processo">
                Cada candidatura guarda em que etapa está, o que você respondeu e o que observou. Semanas depois, você
                ainda sabe o que aconteceu.
              </Card>
            </div>
          </Section>

          {/* --- Passo a passo --- */}
          <Section
            id="passo-a-passo"
            title="Passo a passo"
            lead="O fluxo completo, na ordem em que faz sentido usar. Os dois primeiros passos você faz uma vez; o resto se repete a cada vaga."
          >
            <ol className="mt-2">
              <Step number={1} icon={User} title="Monte seu perfil">
                <p>
                  Em <strong className="font-medium text-ink">Perfil</strong>, preencha experiências, projetos, skills,
                  formação, certificações, idiomas e seu objetivo de carreira. Quanto mais completo, melhor tudo o que
                  vem depois — é daqui que sai cada número e cada texto.
                </p>
              </Step>

              <Step number={2} icon={FileText} title="Cadastre seus currículos">
                <p>
                  Em <strong className="font-medium text-ink">Currículos</strong>, importe um PDF ou DOCX existente, ou
                  crie do zero. Você pode manter várias versões do mesmo profissional — uma voltada para Front-end,
                  outra para Back-end, outra para estágio.
                </p>
                <p>
                  Ter mais de uma versão vale a pena: na análise, o sistema calcula o score de{' '}
                  <strong className="font-medium text-ink">todas</strong> e aponta qual usar.
                </p>
              </Step>

              <Step number={3} icon={Compass} title="Descubra vagas ou cadastre as suas">
                <p>
                  <strong className="font-medium text-ink">Descobrir</strong> busca vagas em seis fontes públicas,
                  remove duplicatas e ordena por aderência e recência — sem usar IA, para ser rápido e reproduzível.
                </p>
                <p>
                  Vaga que veio de outro lugar (LinkedIn, Gupy, indicação) você cadastra em{' '}
                  <strong className="font-medium text-ink">Vagas</strong>, colando a descrição. Daí em diante o
                  tratamento é idêntico.
                </p>
              </Step>

              <Step number={4} icon={Radar} title="Analise o encaixe">
                <p>
                  A análise separa requisitos obrigatórios, diferenciais e tecnologias, calcula o score de cada currículo
                  e recomenda um. Cada critério aparece com a pontuação, o motivo e o que faltou.
                </p>
              </Step>

              <Step number={5} icon={Sparkles} title="Adapte o currículo">
                <p>
                  A adaptação reescreve e reordena o currículo escolhido para aquela vaga — destacando o que importa,
                  usando o vocabulário da descrição. O resultado passa por uma verificação automática que remove
                  qualquer coisa que não exista no original.
                </p>
              </Step>

              <Step number={6} icon={Send} title="Gere os textos e prepare a candidatura">
                <p>
                  Carta de apresentação, mensagem para o recrutador, &quot;fale sobre você&quot;, por que a empresa, por
                  que a vaga, pretensão salarial e as perguntas do processo.
                </p>
                <p>
                  Quando a plataforma publica o formulário, o LippzAutoApply lê as perguntas reais e preenche o que já existe
                  no seu perfil, marcando de forma explícita o que exige a sua revisão.
                </p>
              </Step>

              <Step number={7} icon={Briefcase} title="Acompanhe até o fim">
                <p>
                  Em <strong className="font-medium text-ink">Candidaturas</strong>, um quadro de sete etapas guarda o
                  estágio de cada processo, suas respostas e observações.
                </p>
              </Step>
            </ol>
          </Section>

          {/* --- Score --- */}
          <Section
            id="score"
            title="Como o score é calculado"
            lead="O score é determinístico e auditável: os mesmos dados produzem sempre o mesmo número, e a IA não participa desse cálculo. São sete critérios que somam 100 pontos."
          >
            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-3 font-medium">Critério</th>
                    <th className="px-4 py-3 text-right font-medium">Peso</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Como é medido</th>
                  </tr>
                </thead>
                <tbody>
                  {SCORE_ROWS.map(([label, weight, how]) => (
                    <tr key={label} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink">{label}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{weight}</td>
                      <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">{how}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
              <p>
                Quando a vaga não informa um critério, ele recebe valor <strong className="font-medium text-ink">neutro</strong>{' '}
                — não pune nem premia. Uma descrição vaga não derruba artificialmente o seu score.
              </p>
              <p>
                Depois do cálculo, a IA pode propor um ajuste de no máximo{' '}
                <strong className="font-medium text-ink">dez pontos para cima ou para baixo</strong>, para capturar
                equivalências que palavra-chave não pega. Esse ajuste é sempre exibido separado, assim:
              </p>
              <div className="panel-elevated p-4 font-mono text-[13px] text-ink">
                Base 78 · ajuste da IA +6 → 84
              </div>
              <p>Se a camada de IA falhar, o resultado determinístico continua válido e aparece normalmente.</p>
            </div>
          </Section>

          {/* --- Fontes --- */}
          <Section
            id="vagas"
            title="De onde vêm as vagas"
            lead="Seis fontes com API pública e documentada. Nenhuma delas exige burlar autenticação, CAPTCHA ou bloqueio — e isso é uma restrição de projeto, não uma limitação técnica temporária."
          >
            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-3 font-medium">Fonte</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Configuração</th>
                  </tr>
                </thead>
                <tbody>
                  {SOURCES.map(([name, kind, setup]) => (
                    <tr key={name} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink">{name}</td>
                      <td className="px-4 py-3 text-ink-muted">{kind}</td>
                      <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">{setup}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
              <p>
                <strong className="font-medium text-ink">LinkedIn, Gupy, Indeed, Catho, Vagas.com, InfoJobs e
                Glassdoor não são integrados</strong>, porque nenhum deles oferece API pública de vagas para terceiros —
                e, no caso do LinkedIn, a automação é proibida nos termos de uso.
              </p>
              <p>
                Isso não impede você de usar essas vagas: cole a descrição em <strong className="font-medium text-ink">Vagas</strong>{' '}
                e todo o resto funciona igual. A URL fica salva como referência.
              </p>
              <p>
                A mesma vaga costuma aparecer em mais de uma fonte. Antes de te mostrar, o sistema deduplica por
                impressão digital, e ordena combinando aderência ao seu perfil com quão recente é a publicação. Vaga sem
                data recebe valor neutro, nunca penalidade.
              </p>
            </div>
          </Section>

          {/* --- Anti-alucinação --- */}
          <Section
            id="honestidade"
            title="Como ele evita inventar informação"
            lead="O risco de usar IA num currículo é ela preencher lacunas com ficção. Aqui existem duas camadas independentes contra isso — e a segunda não depende de a IA colaborar."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="panel p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="size-4 text-ink-faint" aria-hidden />
                  <h3 className="text-sm font-semibold text-ink">1. Instrução no prompt</h3>
                </div>
                <p className="text-sm leading-relaxed text-ink-muted">
                  Toda operação sobre dados profissionais carrega uma política que proíbe inventar empresas, cargos,
                  tecnologias, certificações, formação, métricas e resultados. Informação que não existe é reportada como
                  ausente.
                </p>
              </div>
              <div className="panel p-4">
                <div className="mb-2 flex items-center gap-2">
                  <ShieldCheck className="size-4 text-success" aria-hidden />
                  <h3 className="text-sm font-semibold text-ink">2. Verificação automática</h3>
                </div>
                <p className="text-sm leading-relaxed text-ink-muted">
                  Depois que a IA responde, o sistema compara a saída com o currículo original e{' '}
                  <strong className="font-medium text-ink">remove</strong> o que não existir na fonte. Prompt é
                  instrução; esta checagem é garantia.
                </p>
              </div>
            </div>

            <ul className="mt-4 grid gap-2 text-sm leading-relaxed text-ink-muted sm:grid-cols-2">
              {[
                'Empresa que não está no original: experiência descartada',
                'Cargo ou datas alterados: restaurados',
                'Tecnologia acrescentada a uma experiência: removida',
                'Skill, certificação ou idioma inventado: removido',
                'Experiência que a IA omitiu: reinserida',
                'Nome e contato nunca vêm da IA',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              Cada correção aplicada é mostrada a você antes de salvar — você vê o que a IA tentou acrescentar e o que
              foi barrado.
            </p>

            <div className="panel mt-4 p-4">
              <h3 className="text-sm font-semibold text-ink">No formulário de candidatura</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                Nenhuma resposta aparece sem procedência declarada. Cada campo é marcado como{' '}
                <Term>KNOWN</Term> (está no perfil, textualmente), <Term>INFERRED</Term> (calculado pelo sistema, confira),{' '}
                <Term>UNKNOWN</Term> (sem base no perfil) ou <Term>USER_REQUIRED</Term> (só você pode responder — visto,
                pretensão salarial, autodeclaração).
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                Perguntado se você tem experiência com algo que não está no seu perfil, o sistema responde{' '}
                <strong className="font-medium text-ink">não</strong> e deixa claro que a ausência é do perfil, não
                necessariamente da sua vida.
              </p>
            </div>
          </Section>

          {/* --- Limites --- */}
          <Section
            id="limites"
            title="Limites conscientes"
            lead="Escolhas desta versão, declaradas de propósito. Nenhuma delas é acidente de implementação."
          >
            <ul className="space-y-3 text-sm leading-relaxed text-ink-muted">
              {[
                ['Não existe envio automático de candidatura.', 'Nenhuma plataforma permite que um terceiro submeta sem credencial privada do empregador. O LippzAutoApply prepara tudo e entrega pronto; o envio é seu, no site da empresa.'],
                ['Não há raspagem de sites de vagas.', 'Só APIs públicas. Para o resto, você cola a descrição.'],
                ['A descoberta cobre seis fontes, não o mercado inteiro.', 'As plataformas ausentes estão listadas na interface, com o motivo.'],
                ['Não há sincronização agendada no servidor.', 'Um agendamento sem você presente exigiria uma credencial capaz de ler dados de qualquer usuário. O projeto não usa esse tipo de credencial em lugar nenhum. A sincronização roda quando você abre o app.'],
                ['Sem OCR.', 'PDF escaneado, sem camada de texto, precisa ser colado manualmente.'],
                ['Exportação em .txt e .json.', 'O .txt é o formato que passa limpo por filtros automáticos de currículo.'],
              ].map(([title, body]) => (
                <li key={title} className="panel p-4">
                  <strong className="font-medium text-ink">{title}</strong>{' '}
                  <span className="block pt-1">{body}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <footer className="mt-16 border-t border-line pt-8">
          <p className="text-sm text-ink-muted">
            Seus dados ficam isolados por Row Level Security no banco: nem o servidor da aplicação tem um caminho de
            código capaz de ler o que é de outra pessoa.
          </p>
          <Link
            to={session ? '/' : '/entrar'}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            {session ? 'Voltar ao app' : 'Entrar no LippzAutoApply'}
          </Link>
        </footer>
      </main>
    </div>
  );
}
