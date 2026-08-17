/** Acesso a dados do Discovery Engine e da candidatura assistida. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { keys } from './queries';
import type {
  ApplicationPlan,
  DiscoveredJob,
  DiscoveryFilters,
  DiscoveryRunResult,
  SourceHealth,
} from '@shared/discovery/schemas';
import type { SourceKind, UnsupportedSourceInfo } from '@shared/discovery/types';

export const discoveryKeys = {
  jobs: (filters: Partial<DiscoveryFilters>) => ['discovery', 'jobs', filters] as const,
  summary: ['discovery', 'summary'] as const,
  strategy: ['discovery', 'strategy'] as const,
  sources: ['discovery', 'sources'] as const,
  syncs: ['discovery', 'syncs'] as const,
  notifications: ['notifications'] as const,
};

export interface DiscoveryJobsResponse {
  jobs: DiscoveredJob[];
  total: number;
  attribution: Array<{ label: string; url: string }>;
}

export interface DiscoverySummary {
  available: number;
  highMatches: number;
  saved: number;
  activeSources: number;
  lastSyncAt: string | null;
}

function toQueryString(filters: Partial<DiscoveryFilters>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useDiscoveryJobs(filters: Partial<DiscoveryFilters>) {
  return useQuery<DiscoveryJobsResponse>({
    queryKey: discoveryKeys.jobs(filters),
    queryFn: () => api.get<DiscoveryJobsResponse>(`discovery/jobs${toQueryString(filters)}`),
    staleTime: 20_000,
  });
}

export function useDiscoverySummary() {
  return useQuery<DiscoverySummary>({
    queryKey: discoveryKeys.summary,
    queryFn: () => api.get<DiscoverySummary>('discovery/summary'),
    staleTime: 20_000,
  });
}

export interface StrategyResponse {
  terms: string[];
  keywords: string[];
  technologies: string[];
  locations: string[];
  remoteOnly: boolean;
  seniority: string | null;
  explanation: string[];
}

export function useDiscoveryStrategy(enabled = true) {
  return useQuery<StrategyResponse>({
    queryKey: discoveryKeys.strategy,
    queryFn: () => api.get<StrategyResponse>('discovery/strategy'),
    enabled,
    staleTime: 120_000,
  });
}

export function useRunDiscovery() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { sourceIds?: string[]; full?: boolean } = {}) =>
      api.post<DiscoveryRunResult>('discovery/run', {
        sourceIds: input.sourceIds ?? [],
        full: input.full ?? false,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['discovery'] });
      void client.invalidateQueries({ queryKey: discoveryKeys.notifications });
      void client.invalidateQueries({ queryKey: keys.dashboard });
      void client.invalidateQueries({ queryKey: keys.usage });
    },
  });
}

export function useJobDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'salvar' | 'descartar' | 'restaurar' }) =>
      api.patch<{ id: string; action: string }>(`discovery/jobs/${id}`, { action }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['discovery'] });
      void client.invalidateQueries({ queryKey: keys.jobs });
      void client.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

// -----------------------------------------------------------------------------
// Fontes
// -----------------------------------------------------------------------------
export interface SourcesResponse {
  sources: SourceHealth[];
  available: Array<{
    kind: SourceKind;
    label: string;
    requiresIdentifier: boolean;
    documentationUrl: string;
    attribution: { label: string; url: string } | null;
  }>;
  unsupported: UnsupportedSourceInfo[];
}

export function useSources() {
  return useQuery<SourcesResponse>({
    queryKey: discoveryKeys.sources,
    queryFn: () => api.get<SourcesResponse>('discovery/sources'),
    staleTime: 60_000,
  });
}

export type DetectionResponse =
  | {
      status: 'supported';
      kind: SourceKind;
      identifier: string;
      label: string;
      sourceUrl: string;
      jobsFound: number;
      jobsPreview: Array<{ title: string; company: string }>;
    }
  | { status: 'unsupported'; info: UnsupportedSourceInfo }
  | { status: 'unknown'; message: string };

export function useDetectSource() {
  return useMutation({
    mutationFn: (url: string) => api.post<DetectionResponse>('discovery/sources/detect', { url }),
  });
}

function useSourceMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: discoveryKeys.sources });
      void client.invalidateQueries({ queryKey: discoveryKeys.summary });
    },
  });
}

export const useAddSource = () =>
  useSourceMutation((input: { kind: SourceKind; identifier: string; label: string; sourceUrl: string }) =>
    api.post<SourceHealth>('discovery/sources', { ...input, enabled: true }),
  );

export const useToggleSource = () =>
  useSourceMutation(({ id, enabled }: { id: string; enabled: boolean }) =>
    api.patch<SourceHealth>(`discovery/sources/${id}`, { enabled }),
  );

export const useDeleteSource = () =>
  useSourceMutation((id: string) => api.delete<void>(`discovery/sources/${id}`));

export interface SyncRecord {
  id: string;
  sourceKind: string;
  sourceLabel: string;
  status: string;
  jobsFound: number;
  jobsNew: number;
  jobsUpdated: number;
  jobsFiltered: number;
  durationMs: number;
  error: string;
  triggerKind: string;
  createdAt: string;
}

export function useSyncs(enabled = true) {
  return useQuery<SyncRecord[]>({
    queryKey: discoveryKeys.syncs,
    queryFn: () => api.get<SyncRecord[]>('discovery/syncs'),
    enabled,
  });
}

// -----------------------------------------------------------------------------
// Notificações internas
// -----------------------------------------------------------------------------
export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  age: string;
}

export function useNotifications() {
  return useQuery<NotificationItem[]>({
    queryKey: discoveryKeys.notifications,
    queryFn: () => api.get<NotificationItem[]>('notifications'),
    staleTime: 60_000,
  });
}

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>('notifications/read'),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: discoveryKeys.notifications });
    },
  });
}

// -----------------------------------------------------------------------------
// Candidatura assistida
// -----------------------------------------------------------------------------
export function useApplicationPlan() {
  return useMutation({
    mutationFn: (input: { jobId: string; resumeId?: string | null }) =>
      api.post<ApplicationPlan>('applications/plan', input),
  });
}

export function useSaveFieldAnswer() {
  return useMutation({
    mutationFn: (input: { questionKey: string; questionLabel: string; answer: string }) =>
      api.post<{ saved: boolean }>('applications/field-answers', input),
  });
}
