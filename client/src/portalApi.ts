import type { CaseRecord, Juror, JurorTraits, TranscriptLine } from './types';

const KEY = 'notajury.portal.token';

export const portalAuth = {
  get token(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      /* private mode — the session just won't persist across reloads */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* nothing to do */
    }
  },
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = portalAuth.token;
  const res = await fetch(`/api/portal${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-portal-key': token } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep the status line */
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export interface CaseStats {
  events: number;
  entries: number;
  promoted: number;
  sources: number;
}

export interface PortalCase extends CaseRecord {
  stats: CaseStats;
}

export interface PortalSource {
  id: string;
  caseId: string | null;
  url: string;
  title: string;
  publisher: string;
  entryCount: number;
  status: string;
  error: string;
  fetchedAt: string;
}

export interface PortalEntry {
  id: string;
  heading: string;
  body: string;
  author: string;
  postedAt: string | null;
  transcript: TranscriptLine[];
  promotedEventId: string | null;
  sourceTitle: string;
}

export const portalApi = {
  signIn: async (password: string): Promise<string> => {
    const res = await fetch('/api/portal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? 'Sign-in failed');
    }
    const { token } = (await res.json()) as { token: string };
    portalAuth.set(token);
    return token;
  },

  overview: () =>
    request<{ cases: PortalCase[]; sources: PortalSource[] }>('/overview'),

  createCase: (input: {
    title: string;
    summary: string;
    defendant: string;
    charge: string;
    realCase: boolean;
    sourceNote: string;
    linkOrphanSources: boolean;
  }) => request<{ case: CaseRecord; linkedSources: number }>('/cases', {
    method: 'POST',
    body: JSON.stringify(input),
  }),

  patchCase: (id: string, patch: Partial<CaseRecord>) =>
    request<{ case: CaseRecord }>(`/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteCase: (id: string) =>
    request<{ ok: boolean }>(`/cases/${id}`, { method: 'DELETE' }),

  linkSources: (id: string) =>
    request<{ linked: number }>(`/cases/${id}/link-sources`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  jurors: (caseId: string) => request<{ jurors: Juror[] }>(`/cases/${caseId}/jurors`),

  refreshJurors: (caseId: string, resetTraits: boolean) =>
    request<{ jurors: Juror[] }>(`/cases/${caseId}/jurors/refresh`, {
      method: 'POST',
      body: JSON.stringify({ resetTraits }),
    }),

  patchJuror: (id: string, patch: { traits?: JurorTraits; name?: string; bio?: string }) =>
    request<{ juror: Juror }>(`/jurors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  entries: (caseId: string, pending: boolean) =>
    request<{ total: number; entries: PortalEntry[] }>(
      `/cases/${caseId}/entries?pending=${pending}&limit=200`,
    ),
};
