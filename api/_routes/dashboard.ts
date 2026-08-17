/** Agregados da tela inicial (§31). Calculados no servidor para evitar tráfego desnecessário. */
import { route, type Route } from '../_lib/router';
import { mapDbError } from '../_lib/supabase';
import { APPLICATION_STATUSES, type ApplicationStatus } from '../../shared/constants';
import { toJobAnalysisRecord } from '../_services/mappers';

type Row = Record<string, unknown>;

export const dashboardRoutes: Route[] = [
  route('GET', 'dashboard', async (ctx) => {
    const userId = ctx.user.id;

    const [jobsResult, applicationsResult, analysesResult, resumesResult] = await Promise.all([
      ctx.db.from('jobs').select('id, status, created_at').eq('user_id', userId).limit(1000),
      ctx.db
        .from('applications')
        .select('id, status, score, updated_at, resume_id, jobs:job_id (id, title, company)')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(500),
      ctx.db
        .from('job_analyses')
        .select('id, job_id, matches, recommended_resume_id, created_at, jobs:job_id (id, title, company)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      ctx.db.from('resumes').select('id, name').eq('user_id', userId).limit(200),
    ]);

    for (const result of [jobsResult, applicationsResult, analysesResult, resumesResult]) {
      if (result.error) throw mapDbError(result.error);
    }

    const jobs = (jobsResult.data ?? []) as Row[];
    const applications = (applicationsResult.data ?? []) as Row[];
    const analyses = (analysesResult.data ?? []) as Row[];
    const resumes = (resumesResult.data ?? []) as Row[];
    const resumeNames = new Map(resumes.map((row) => [String(row.id), String(row.name ?? '')]));

    // --- Candidaturas por status ---------------------------------------------
    const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<
      ApplicationStatus,
      number
    >;
    const resumeUsage = new Map<string, number>();
    let scoreSum = 0;
    let scoreCount = 0;

    for (const application of applications) {
      const status = String(application.status ?? '') as ApplicationStatus;
      if (status in byStatus) byStatus[status] += 1;

      const score = application.score;
      if (typeof score === 'number') {
        scoreSum += score;
        scoreCount += 1;
      }
      const resumeId = application.resume_id ? String(application.resume_id) : '';
      if (resumeId) resumeUsage.set(resumeId, (resumeUsage.get(resumeId) ?? 0) + 1);
    }

    let mostUsedResume: { id: string; name: string; count: number } | null = null;
    for (const [id, count] of resumeUsage) {
      if (!mostUsedResume || count > mostUsedResume.count) {
        mostUsedResume = { id, name: resumeNames.get(id) ?? 'Currículo removido', count };
      }
    }

    // --- Melhores matches ------------------------------------------------------
    const bestMatches = analyses
      .map((row) => {
        const record = toJobAnalysisRecord(row);
        const best = record.matches[0] ?? null;
        const jobRow = (row.jobs ?? null) as Row | null;
        if (!best || !jobRow) return null;
        return {
          jobId: String(jobRow.id ?? ''),
          jobTitle: String(jobRow.title ?? ''),
          company: String(jobRow.company ?? ''),
          score: best.score,
          resumeName: best.resumeName,
          analyzedAt: record.createdAt,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const analyzedScores = analyses
      .map((row) => toJobAnalysisRecord(row).matches[0]?.score)
      .filter((score): score is number => typeof score === 'number');
    const averageMatchScore =
      analyzedScores.length > 0
        ? Math.round(analyzedScores.reduce((sum, score) => sum + score, 0) / analyzedScores.length)
        : null;

    const recentApplications = applications.slice(0, 6).map((row) => {
      const jobRow = (row.jobs ?? null) as Row | null;
      return {
        id: String(row.id),
        status: String(row.status ?? ''),
        score: typeof row.score === 'number' ? row.score : null,
        updatedAt: String(row.updated_at ?? ''),
        jobTitle: jobRow ? String(jobRow.title ?? '') : 'Vaga removida',
        company: jobRow ? String(jobRow.company ?? '') : '',
      };
    });

    return {
      jobs: {
        total: jobs.length,
        analyzed: jobs.filter((job) => job.status === 'analisada' || job.status === 'aplicada').length,
        open: jobs.filter((job) => job.status === 'nova').length,
      },
      applications: {
        total: applications.length,
        byStatus,
        interviews: byStatus.entrevista,
        offers: byStatus.oferta,
        averageScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
      },
      averageMatchScore,
      mostUsedResume,
      bestMatches,
      recentApplications,
      resumesCount: resumes.length,
    };
  }),
];
