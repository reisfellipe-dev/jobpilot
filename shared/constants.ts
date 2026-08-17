/**
 * Constantes de dominio compartilhadas entre frontend e backend.
 * Fonte unica de verdade para enums persistidos no Postgres.
 */

export const SENIORITY_LEVELS = [
  'estagio',
  'trainee',
  'junior',
  'pleno',
  'senior',
  'especialista',
  'lead',
  'gerente',
] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];

export const SENIORITY_LABEL: Record<Seniority, string> = {
  estagio: 'Estágio',
  trainee: 'Trainee',
  junior: 'Júnior',
  pleno: 'Pleno',
  senior: 'Sênior',
  especialista: 'Especialista',
  lead: 'Tech Lead',
  gerente: 'Gerente',
};

/** Posicao ordinal usada no calculo de aderencia de senioridade. */
export const SENIORITY_RANK: Record<Seniority, number> = {
  estagio: 0,
  trainee: 1,
  junior: 2,
  pleno: 3,
  senior: 4,
  especialista: 5,
  lead: 5,
  gerente: 6,
};

export const WORK_MODES = ['remoto', 'hibrido', 'presencial'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  remoto: 'Remoto',
  hibrido: 'Híbrido',
  presencial: 'Presencial',
};

export const JOB_STATUSES = ['nova', 'analisada', 'aplicada', 'descartada'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  nova: 'Nova',
  analisada: 'Analisada',
  aplicada: 'Aplicada',
  descartada: 'Descartada',
};

/** Pipeline de candidatura (§25). A ordem define as colunas do Kanban. */
export const APPLICATION_STATUSES = [
  'salva',
  'analisada',
  'preparada',
  'enviada',
  'entrevista',
  'oferta',
  'recusada',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  salva: 'Salva',
  analisada: 'Analisada',
  preparada: 'Preparada',
  enviada: 'Enviada',
  entrevista: 'Entrevista',
  oferta: 'Oferta',
  recusada: 'Recusada',
};

export const ANSWER_KINDS = [
  'cover_letter',
  'recruiter_message',
  'about_me',
  'why_company',
  'why_position',
  'salary',
  'custom',
] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

export const ANSWER_KIND_LABEL: Record<AnswerKind, string> = {
  cover_letter: 'Carta de apresentação',
  recruiter_message: 'Mensagem para recrutador',
  about_me: 'Fale sobre você',
  why_company: 'Por que esta empresa?',
  why_position: 'Por que esta vaga?',
  salary: 'Pretensão salarial',
  custom: 'Pergunta do processo',
};

export const AI_PROVIDERS = ['groq', 'nvidia'] as const;
export type AIProviderName = (typeof AI_PROVIDERS)[number];

/** Marcador usado quando uma informacao nao existe no perfil (§18). */
export const MISSING_MARKER = 'AUSENTE';

/** Limites de upload (§17). */
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
export const UPLOAD_ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export const UPLOAD_ALLOWED_EXT = ['pdf', 'docx'] as const;

/** Teto de caracteres de texto bruto enviado para a IA (controle de contexto e custo, §29). */
export const MAX_RESUME_TEXT_CHARS = 24_000;
export const MAX_JOB_TEXT_CHARS = 16_000;
export const STORAGE_BUCKET = 'resumes';
