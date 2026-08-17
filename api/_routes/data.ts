/**
 * Exportação e importação de dados (§35).
 * O arquivo gerado nunca contém API keys, tokens ou segredos - apenas os dados
 * profissionais do próprio usuário.
 */
import { z } from 'zod';
import { parseWith, route, type Ctx, type Route } from '../_lib/router';
import { mapDbError } from '../_lib/supabase';
import { badRequest } from '../_lib/errors';
import {
  experienceInputSchema,
  profileInputSchema,
  projectInputSchema,
  skillInputSchema,
} from '../../shared/schemas/profile';
import { resumeContentSchema, resumeInputSchema } from '../../shared/schemas/resume';
import { jobInputSchema } from '../../shared/schemas/job';
import { applicationInputSchema } from '../../shared/schemas/application';
import { ANSWER_KINDS } from '../../shared/constants';
import {
  fromExperience,
  fromJob,
  fromProfile,
  fromProject,
  fromResume,
  fromSkill,
  toApplication,
  toApplicationAnswer,
  toJob,
  toJobAnalysisRecord,
  toResumeVersion,
} from '../_services/mappers';
import { getProfileBundle, getSettings, listResumes } from '../_services/repository';

type Row = Record<string, unknown>;

export const EXPORT_VERSION = 1;

async function selectAll(ctx: Ctx, table: string, order = 'created_at'): Promise<Row[]> {
  const { data, error } = await ctx.db
    .from(table)
    .select('*')
    .eq('user_id', ctx.user.id)
    .order(order, { ascending: true })
    .limit(2000);
  if (error) throw mapDbError(error);
  return (data ?? []) as Row[];
}

/** Estrutura aceita na importação. Tolerante: blocos ausentes são ignorados. */
const importSchema = z.object({
  jobpilot: z.object({ version: z.number().int().min(1).max(EXPORT_VERSION) }).optional(),
  profile: profileInputSchema.partial().optional(),
  experiences: z.array(experienceInputSchema.partial({ company: true, role: true })).max(200).optional(),
  projects: z.array(projectInputSchema.partial({ name: true })).max(200).optional(),
  skills: z.array(skillInputSchema.partial({ name: true })).max(500).optional(),
  resumes: z
    .array(resumeInputSchema.partial({ name: true }).extend({ id: z.string().optional() }))
    .max(100)
    .optional(),
  jobs: z
    .array(jobInputSchema.partial({ title: true }).extend({ id: z.string().optional() }))
    .max(500)
    .optional(),
  resumeVersions: z
    .array(
      z.object({
        id: z.string().optional(),
        resumeId: z.string().optional(),
        jobId: z.string().nullish(),
        label: z.string().max(160).default(''),
        content: resumeContentSchema,
        keywordsAdded: z.array(z.string()).default([]),
      }),
    )
    .max(300)
    .optional(),
  applications: z
    .array(
      applicationInputSchema.partial({ jobId: true }).extend({
        id: z.string().optional(),
        jobId: z.string().optional(),
        resumeId: z.string().nullish(),
        resumeVersionId: z.string().nullish(),
      }),
    )
    .max(500)
    .optional(),
  applicationAnswers: z
    .array(
      z.object({
        applicationId: z.string().optional(),
        kind: z.enum(ANSWER_KINDS),
        question: z.string().max(2000).default(''),
        answer: z.string().max(20_000).default(''),
      }),
    )
    .max(1000)
    .optional(),
});

export const dataRoutes: Route[] = [
  route('GET', 'export', async (ctx) => {
    const [bundle, settings, resumes] = await Promise.all([
      getProfileBundle(ctx.db, ctx.user.id),
      getSettings(ctx.db, ctx.user.id),
      listResumes(ctx.db, ctx.user.id),
    ]);
    const [jobRows, analysisRows, versionRows, applicationRows, answerRows] = await Promise.all([
      selectAll(ctx, 'jobs'),
      selectAll(ctx, 'job_analyses'),
      selectAll(ctx, 'resume_versions'),
      selectAll(ctx, 'applications'),
      selectAll(ctx, 'application_answers'),
    ]);

    return {
      jobpilot: { version: EXPORT_VERSION, exportedAt: new Date().toISOString() },
      profile: bundle.profile,
      experiences: bundle.experiences,
      projects: bundle.projects,
      skills: bundle.skills,
      resumes,
      resumeVersions: versionRows.map(toResumeVersion),
      jobs: jobRows.map(toJob),
      jobAnalyses: analysisRows.map(toJobAnalysisRecord),
      applications: applicationRows.map(toApplication),
      applicationAnswers: answerRows.map(toApplicationAnswer),
      settings,
    };
  }),

  /**
   * Importação aditiva: nunca apaga o que já existe.
   * Análises de vaga não são importadas por serem dados derivados - basta
   * reanalisar a vaga para gerá-las novamente com o contexto atual.
   */
  route('POST', 'import', async (ctx) => {
    const payload = parseWith(importSchema, ctx.body);
    if (payload.jobpilot && payload.jobpilot.version > EXPORT_VERSION) {
      throw badRequest('Este arquivo foi gerado por uma versão mais nova do JobPilot.');
    }

    const summary = {
      profile: false,
      experiences: 0,
      projects: 0,
      skills: 0,
      resumes: 0,
      jobs: 0,
      resumeVersions: 0,
      applications: 0,
      applicationAnswers: 0,
      skipped: [] as string[],
    };

    // --- Perfil ---------------------------------------------------------------
    if (payload.profile) {
      const merged = profileInputSchema.parse(payload.profile);
      const { error } = await ctx.db
        .from('profiles')
        .update(fromProfile({ ...merged, seniority: merged.seniority ?? null }))
        .eq('id', ctx.user.id);
      if (error) throw mapDbError(error);
      summary.profile = true;
    }

    // --- Coleções simples -----------------------------------------------------
    for (const experience of payload.experiences ?? []) {
      if (!experience.company || !experience.role) {
        summary.skipped.push('Experiência sem empresa ou cargo.');
        continue;
      }
      const parsed = experienceInputSchema.parse(experience);
      const { error } = await ctx.db
        .from('experiences')
        .insert({ ...fromExperience(parsed), user_id: ctx.user.id });
      if (error) throw mapDbError(error);
      summary.experiences += 1;
    }

    for (const project of payload.projects ?? []) {
      if (!project.name) {
        summary.skipped.push('Projeto sem nome.');
        continue;
      }
      const parsed = projectInputSchema.parse(project);
      const { error } = await ctx.db.from('projects').insert({ ...fromProject(parsed), user_id: ctx.user.id });
      if (error) throw mapDbError(error);
      summary.projects += 1;
    }

    for (const skill of payload.skills ?? []) {
      if (!skill.name) continue;
      const parsed = skillInputSchema.parse(skill);
      const { error } = await ctx.db.from('skills').insert({ ...fromSkill(parsed), user_id: ctx.user.id });
      // Skill duplicada é esperada em reimportação: ignora silenciosamente.
      if (error && (error as { code?: string }).code !== '23505') throw mapDbError(error);
      if (!error) summary.skills += 1;
    }

    // --- Currículos (mapeia ids antigos -> novos) -----------------------------
    const resumeIdMap = new Map<string, string>();
    for (const resume of payload.resumes ?? []) {
      if (!resume.name) {
        summary.skipped.push('Currículo sem nome.');
        continue;
      }
      const parsed = resumeInputSchema.parse({ ...resume, isDefault: false, filePath: '', fileName: '', fileMime: '' });
      const { data, error } = await ctx.db
        .from('resumes')
        .insert({ ...fromResume(parsed), user_id: ctx.user.id })
        .select('id')
        .single();
      if (error) throw mapDbError(error);
      if (resume.id) resumeIdMap.set(resume.id, String((data as Row).id));
      summary.resumes += 1;
    }

    // --- Vagas ----------------------------------------------------------------
    const jobIdMap = new Map<string, string>();
    for (const job of payload.jobs ?? []) {
      if (!job.title) {
        summary.skipped.push('Vaga sem cargo.');
        continue;
      }
      const parsed = jobInputSchema.parse(job);
      const { data, error } = await ctx.db
        .from('jobs')
        .insert({ ...fromJob(parsed), user_id: ctx.user.id })
        .select('id')
        .single();
      if (error) throw mapDbError(error);
      if (job.id) jobIdMap.set(job.id, String((data as Row).id));
      summary.jobs += 1;
    }

    // --- Versões de currículo -------------------------------------------------
    const versionIdMap = new Map<string, string>();
    for (const version of payload.resumeVersions ?? []) {
      const resumeId = version.resumeId ? resumeIdMap.get(version.resumeId) : undefined;
      if (!resumeId) {
        summary.skipped.push(`Versão de currículo "${version.label}" sem currículo correspondente.`);
        continue;
      }
      const jobId = version.jobId ? (jobIdMap.get(version.jobId) ?? null) : null;
      const { data, error } = await ctx.db
        .from('resume_versions')
        .insert({
          user_id: ctx.user.id,
          resume_id: resumeId,
          job_id: jobId,
          label: version.label,
          content: version.content,
          keywords_added: version.keywordsAdded,
        })
        .select('id')
        .single();
      if (error) throw mapDbError(error);
      if (version.id) versionIdMap.set(version.id, String((data as Row).id));
      summary.resumeVersions += 1;
    }

    // --- Candidaturas ---------------------------------------------------------
    const applicationIdMap = new Map<string, string>();
    for (const application of payload.applications ?? []) {
      const jobId = application.jobId ? jobIdMap.get(application.jobId) : undefined;
      if (!jobId) {
        summary.skipped.push('Candidatura sem vaga correspondente no arquivo.');
        continue;
      }
      const { data, error } = await ctx.db
        .from('applications')
        .insert({
          user_id: ctx.user.id,
          job_id: jobId,
          resume_id: application.resumeId ? (resumeIdMap.get(application.resumeId) ?? null) : null,
          resume_version_id: application.resumeVersionId
            ? (versionIdMap.get(application.resumeVersionId) ?? null)
            : null,
          score: application.score ?? null,
          status: application.status ?? 'salva',
          applied_at: application.appliedAt ?? null,
          notes: application.notes ?? '',
        })
        .select('id')
        .single();
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          summary.skipped.push('Candidatura duplicada para a mesma vaga.');
          continue;
        }
        throw mapDbError(error);
      }
      if (application.id) applicationIdMap.set(application.id, String((data as Row).id));
      summary.applications += 1;
    }

    // --- Respostas ------------------------------------------------------------
    for (const answer of payload.applicationAnswers ?? []) {
      const applicationId = answer.applicationId ? applicationIdMap.get(answer.applicationId) : undefined;
      if (!applicationId) continue;
      const { error } = await ctx.db.from('application_answers').insert({
        user_id: ctx.user.id,
        application_id: applicationId,
        kind: answer.kind,
        question: answer.question,
        answer: answer.answer,
      });
      if (error) throw mapDbError(error);
      summary.applicationAnswers += 1;
    }

    return summary;
  }),
];
