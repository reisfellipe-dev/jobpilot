/**
 * Acesso a dados via React Query.
 * Toda chamada HTTP do app passa por aqui — componentes não usam fetch direto.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Experience, ExperienceInput, Profile, Project, ProjectInput, Skill, SkillInput } from '@shared/schemas/profile';
import type { Resume, ResumeContent, ResumeInput, ResumeVersion } from '@shared/schemas/resume';
import type { Job, JobAnalysisRecord, JobInput } from '@shared/schemas/job';
import type {
  ApplicationAnswer,
  ApplicationInput,
  ApplicationListItem,
} from '@shared/schemas/application';
import type { AnswerKind, ApplicationStatus } from '@shared/constants';

export const keys = {
  profile: ['profile'] as const,
  resumes: ['resumes'] as const,
  resume: (id: string) => ['resumes', id] as const,
  resumeVersions: (id: string) => ['resumes', id, 'versions'] as const,
  jobs: ['jobs'] as const,
  job: (id: string) => ['jobs', id] as const,
  jobAnalysis: (id: string) => ['jobs', id, 'analysis'] as const,
  applications: ['applications'] as const,
  application: (id: string) => ['applications', id] as const,
  answers: (id: string) => ['applications', id, 'answers'] as const,
  settings: ['settings'] as const,
  usage: ['usage'] as const,
  aiStatus: ['ai', 'status'] as const,
  dashboard: ['dashboard'] as const,
};

export interface ProfileBundle {
  profile: Profile;
  experiences: Experience[];
  projects: Project[];
  skills: Skill[];
}

const staleShort = 30_000;

// -----------------------------------------------------------------------------
// Perfil
// -----------------------------------------------------------------------------
export function useProfile(options?: Partial<UseQueryOptions<ProfileBundle>>) {
  return useQuery<ProfileBundle>({
    queryKey: keys.profile,
    queryFn: () => api.get<ProfileBundle>('profile'),
    staleTime: staleShort,
    ...options,
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.patch<Profile>('profile', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profile });
    },
  });
}

function useProfileCollectionMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profile });
    },
  });
}

export const useCreateExperience = () =>
  useProfileCollectionMutation((input: ExperienceInput) => api.post<Experience>('experiences', input));
export const useUpdateExperience = () =>
  useProfileCollectionMutation(({ id, input }: { id: string; input: ExperienceInput }) =>
    api.patch<Experience>(`experiences/${id}`, input),
  );
export const useDeleteExperience = () =>
  useProfileCollectionMutation((id: string) => api.delete<void>(`experiences/${id}`));

export const useCreateProject = () =>
  useProfileCollectionMutation((input: ProjectInput) => api.post<Project>('projects', input));
export const useUpdateProject = () =>
  useProfileCollectionMutation(({ id, input }: { id: string; input: ProjectInput }) =>
    api.patch<Project>(`projects/${id}`, input),
  );
export const useDeleteProject = () =>
  useProfileCollectionMutation((id: string) => api.delete<void>(`projects/${id}`));

export const useCreateSkill = () =>
  useProfileCollectionMutation((input: SkillInput) => api.post<Skill>('skills', input));
export const useUpdateSkill = () =>
  useProfileCollectionMutation(({ id, input }: { id: string; input: SkillInput }) =>
    api.patch<Skill>(`skills/${id}`, input),
  );
export const useDeleteSkill = () =>
  useProfileCollectionMutation((id: string) => api.delete<void>(`skills/${id}`));

// -----------------------------------------------------------------------------
// Currículos
// -----------------------------------------------------------------------------
export function useResumes() {
  return useQuery<Resume[]>({
    queryKey: keys.resumes,
    queryFn: () => api.get<Resume[]>('resumes'),
    staleTime: staleShort,
  });
}

export function useResume(id: string | undefined) {
  return useQuery<Resume>({
    queryKey: keys.resume(id ?? ''),
    queryFn: () => api.get<Resume>(`resumes/${id}`),
    enabled: Boolean(id),
  });
}

function useResumeMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.resumes });
      void client.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export const useCreateResume = () => useResumeMutation((input: ResumeInput) => api.post<Resume>('resumes', input));
export const useDeleteResume = () => useResumeMutation((id: string) => api.delete<void>(`resumes/${id}`));
export const useDuplicateResume = () =>
  useResumeMutation((id: string) => api.post<Resume>(`resumes/${id}/duplicate`));

export function useUpdateResume() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResumeInput }) => api.patch<Resume>(`resumes/${id}`, input),
    onSuccess: (resume) => {
      void client.invalidateQueries({ queryKey: keys.resumes });
      void client.invalidateQueries({ queryKey: keys.resume(resume.id) });
    },
  });
}

export function useResumeVersions(resumeId: string | undefined) {
  return useQuery<ResumeVersion[]>({
    queryKey: keys.resumeVersions(resumeId ?? ''),
    queryFn: () => api.get<ResumeVersion[]>(`resumes/${resumeId}/versions`),
    enabled: Boolean(resumeId),
  });
}

export interface SaveVersionInput {
  resumeId: string;
  jobId?: string | null;
  label: string;
  content: ResumeContent;
  changes?: Array<{ section: string; before: string; after: string; reason: string }>;
  keywordsAdded?: string[];
  provider?: string | null;
  model?: string | null;
}

export function useSaveResumeVersion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ resumeId, ...body }: SaveVersionInput) =>
      api.post<ResumeVersion>(`resumes/${resumeId}/versions`, body),
    onSuccess: (version) => {
      void client.invalidateQueries({ queryKey: keys.resumeVersions(version.resumeId) });
    },
  });
}

export function useDeleteResumeVersion(resumeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`resume-versions/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.resumeVersions(resumeId) });
    },
  });
}

// -----------------------------------------------------------------------------
// Vagas
// -----------------------------------------------------------------------------
export function useJobs() {
  return useQuery<Job[]>({
    queryKey: keys.jobs,
    queryFn: () => api.get<Job[]>('jobs'),
    staleTime: staleShort,
  });
}

export function useJob(id: string | undefined) {
  return useQuery<Job>({
    queryKey: keys.job(id ?? ''),
    queryFn: () => api.get<Job>(`jobs/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: JobInput) => api.post<Job>('jobs', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.jobs });
      void client.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useUpdateJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: JobInput }) => api.patch<Job>(`jobs/${id}`, input),
    onSuccess: (job) => {
      void client.invalidateQueries({ queryKey: keys.jobs });
      void client.invalidateQueries({ queryKey: keys.job(job.id) });
      void client.invalidateQueries({ queryKey: keys.jobAnalysis(job.id) });
    },
  });
}

export function useDeleteJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`jobs/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.jobs });
      void client.invalidateQueries({ queryKey: keys.applications });
      void client.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export interface AnalysisResponse {
  analysis: JobAnalysisRecord | null;
  cached?: boolean;
  stale: boolean;
  hasResumes: boolean;
  provider?: string | null;
  fallbackUsed?: boolean;
}

export function useJobAnalysis(jobId: string | undefined) {
  return useQuery<AnalysisResponse>({
    queryKey: keys.jobAnalysis(jobId ?? ''),
    queryFn: () => api.get<AnalysisResponse>(`jobs/${jobId}/analysis`),
    enabled: Boolean(jobId),
  });
}

export function useAnalyzeJob(jobId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => api.post<AnalysisResponse>(`jobs/${jobId}/analyze`, { force }),
    onSuccess: (result) => {
      client.setQueryData(keys.jobAnalysis(jobId), result);
      void client.invalidateQueries({ queryKey: keys.jobs });
      void client.invalidateQueries({ queryKey: keys.usage });
      void client.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

// -----------------------------------------------------------------------------
// Candidaturas
// -----------------------------------------------------------------------------
export function useApplications() {
  return useQuery<ApplicationListItem[]>({
    queryKey: keys.applications,
    queryFn: () => api.get<ApplicationListItem[]>('applications'),
    staleTime: staleShort,
  });
}

export function useApplication(id: string | undefined) {
  return useQuery<ApplicationListItem>({
    queryKey: keys.application(id ?? ''),
    queryFn: () => api.get<ApplicationListItem>(`applications/${id}`),
    enabled: Boolean(id),
  });
}

function useApplicationMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.applications });
      void client.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export const useCreateApplication = () =>
  useApplicationMutation((input: ApplicationInput) => api.post<ApplicationListItem>('applications', input));
export const useDeleteApplication = () =>
  useApplicationMutation((id: string) => api.delete<void>(`applications/${id}`));
export const useUpdateApplication = () =>
  useApplicationMutation(({ id, input }: { id: string; input: ApplicationInput }) =>
    api.patch<ApplicationListItem>(`applications/${id}`, input),
  );

/** Atualização otimista do Kanban: o card move na hora. */
export function useUpdateApplicationStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) =>
      api.patch<ApplicationListItem>(`applications/${id}/status`, { status }),
    onMutate: async ({ id, status }) => {
      await client.cancelQueries({ queryKey: keys.applications });
      const previous = client.getQueryData<ApplicationListItem[]>(keys.applications);
      client.setQueryData<ApplicationListItem[]>(keys.applications, (current) =>
        (current ?? []).map((item) => (item.id === id ? { ...item, status } : item)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(keys.applications, context.previous);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.applications });
      void client.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useAnswers(applicationId: string | undefined) {
  return useQuery<ApplicationAnswer[]>({
    queryKey: keys.answers(applicationId ?? ''),
    queryFn: () => api.get<ApplicationAnswer[]>(`applications/${applicationId}/answers`),
    enabled: Boolean(applicationId),
  });
}

export function useSaveAnswer(applicationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      kind: AnswerKind;
      question: string;
      answer: string;
      provider?: string | null;
      model?: string | null;
    }) => api.post<ApplicationAnswer>(`applications/${applicationId}/answers`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.answers(applicationId) });
    },
  });
}

/** Variante que recebe a candidatura como argumento — útil quando ela ainda vai ser criada. */
export function useSaveApplicationAnswer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      ...body
    }: {
      applicationId: string;
      kind: AnswerKind;
      question: string;
      answer: string;
      provider?: string | null;
      model?: string | null;
    }) => api.post<ApplicationAnswer>(`applications/${applicationId}/answers`, body),
    onSuccess: (_result, variables) => {
      void client.invalidateQueries({ queryKey: keys.answers(variables.applicationId) });
      void client.invalidateQueries({ queryKey: keys.applications });
    },
  });
}

export function useDeleteAnswer(applicationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`application-answers/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.answers(applicationId) });
    },
  });
}

// -----------------------------------------------------------------------------
// Configurações, uso e status de IA
// -----------------------------------------------------------------------------
export interface UserSettings {
  aiProviderPreference: 'auto' | 'groq' | 'nvidia';
  allowFallback: boolean;
  tone: 'profissional' | 'direto' | 'entusiasmado' | 'tecnico';
  language: 'pt-BR' | 'en-US';
  aiConsent: boolean;
  /** Descoberta automática ao abrir o app (§22). */
  autoDiscovery: boolean;
  discoveryMinScore: number;
  discoveryMaxAgeDays: number;
  discoveryKeywords: string[];
  discoveryLocations: string[];
  updatedAt: string;
}

export function useSettings() {
  return useQuery<UserSettings>({
    queryKey: keys.settings,
    queryFn: () => api.get<UserSettings>('settings'),
    staleTime: 120_000,
  });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UserSettings) => api.patch<UserSettings>('settings', input),
    onSuccess: (settings) => {
      client.setQueryData(keys.settings, settings);
    },
  });
}

export interface AIStatus {
  serverPreference: 'auto' | 'groq' | 'nvidia';
  fallbackEnabled: boolean;
  available: boolean;
  providers: Array<{ name: string; configured: boolean; model: string; jsonMode: boolean }>;
  quotas: Array<{ operation: string; limit: number; windowSeconds: number; dailyLimit: number }>;
}

export function useAIStatus() {
  return useQuery<AIStatus>({
    queryKey: keys.aiStatus,
    queryFn: () => api.get<AIStatus>('ai/status'),
    staleTime: 300_000,
  });
}

export interface UsageSummary {
  windowHours: number;
  total: number;
  inputTokens: number;
  outputTokens: number;
  byOperation: Array<{ operation: string; count: number }>;
  recent: Array<Record<string, unknown>>;
}

export function useUsage() {
  return useQuery<UsageSummary>({
    queryKey: keys.usage,
    queryFn: () => api.get<UsageSummary>('usage'),
  });
}

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------
export interface DashboardData {
  jobs: { total: number; analyzed: number; open: number };
  applications: {
    total: number;
    byStatus: Record<ApplicationStatus, number>;
    interviews: number;
    offers: number;
    averageScore: number | null;
  };
  averageMatchScore: number | null;
  mostUsedResume: { id: string; name: string; count: number } | null;
  bestMatches: Array<{
    jobId: string;
    jobTitle: string;
    company: string;
    score: number;
    resumeName: string;
    analyzedAt: string;
  }>;
  recentApplications: Array<{
    id: string;
    status: string;
    score: number | null;
    updatedAt: string;
    jobTitle: string;
    company: string;
  }>;
  resumesCount: number;
}

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: keys.dashboard,
    queryFn: () => api.get<DashboardData>('dashboard'),
    staleTime: staleShort,
  });
}
