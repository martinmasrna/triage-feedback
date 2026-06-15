import type {
  DoctorCase,
  EnteredCase,
  EvaluateResponse,
  FormOptions,
  ListFilter,
  StoredCase,
  Verdict,
} from "./types";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body; keep the status message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

const jsonHeaders = { "content-type": "application/json" };

export const api = {
  formOptions: () => fetch("/api/form-options").then((r) => jsonOrThrow<FormOptions>(r)),

  evaluate: (entered: EnteredCase) =>
    fetch("/api/evaluate", { method: "POST", headers: jsonHeaders, body: JSON.stringify(entered) }).then((r) =>
      jsonOrThrow<EvaluateResponse>(r),
    ),

  save: (draftId: string, verdict: Verdict) =>
    fetch("/api/cases", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ draftId, verdict }) }).then((r) =>
      jsonOrThrow<DoctorCase>(r),
    ),

  // ── Doctor-facing reads: stripped of the silent fields by the server. ──
  list: (filter: ListFilter = {}) => fetch(`/api/cases${listQuery(filter)}`).then((r) => jsonOrThrow<DoctorCase[]>(r)),

  get: (id: string) => fetch(`/api/cases/${id}`).then((r) => jsonOrThrow<DoctorCase>(r)),

  /** Edit only the doctor's free-text comment; the agree/disagree itself is immutable. */
  patchComment: (id: string, comment: string) =>
    fetch(`/api/cases/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ comment }) }).then(
      (r) => jsonOrThrow<DoctorCase>(r),
    ),

  /** Submit the initial verdict for a pending (AI-prefilled, pre-triaged) case. Can only be done once. */
  submitVerdict: (id: string, verdict: Verdict) =>
    fetch(`/api/cases/${id}/verdict`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(verdict) }).then(
      (r) => jsonOrThrow<DoctorCase>(r),
    ),

  // ── Admin-facing reads: the full record. ──
  adminList: (filter: ListFilter = {}) =>
    fetch(`/api/admin/cases${listQuery(filter)}`).then((r) => jsonOrThrow<StoredCase[]>(r)),

  adminGet: (id: string) => fetch(`/api/admin/cases/${id}`).then((r) => jsonOrThrow<StoredCase>(r)),
};

function listQuery(filter: ListFilter): string {
  const params = new URLSearchParams();
  if (filter.disagreementsOnly) params.set("disagreements", "true");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
