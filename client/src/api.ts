import type { CaseRecord, CaseState, SuggestedEvent } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep the status line */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; database: string; aiProvider: string }>('/health'),

  listCases: () => request<{ cases: CaseRecord[] }>('/cases'),

  getCase: (id: string) => request<CaseState>(`/cases/${id}`),

  createCase: (input: { title: string; summary: string; defendant: string; charge: string }) =>
    request<{ case: CaseRecord }>('/cases', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  addEvent: (caseId: string, event: Omit<SuggestedEvent, never>) =>
    request<CaseState>(`/cases/${caseId}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    }),

  deliberate: (caseId: string, passes = 3) =>
    request<CaseState>(`/cases/${caseId}/deliberate`, {
      method: 'POST',
      body: JSON.stringify({ passes }),
    }),

  promoteEntry: (caseId: string, entryId: string, body: Record<string, unknown> = {}) =>
    request<CaseState>(`/cases/${caseId}/events/from-entry/${entryId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  reset: (caseId: string) =>
    request<CaseState>(`/cases/${caseId}/reset`, { method: 'POST' }),

  suggestedEvents: () => request<{ events: SuggestedEvent[] }>('/suggested-events'),
};
