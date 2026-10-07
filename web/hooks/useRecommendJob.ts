import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "@/lib/music";
import { ApiResponseError, api, cancelJob, parseResponse, postJson, type Direction, type JobData, type Progress } from "../lib/api";
import { readStored, withoutPreview, writeStored } from "../lib/storage";

export type RecommendRequest = {
 seed: Track; direction: Direction; notes: string; excluded: string[]; avoidArtists: string[];
 feedback: { liked: string[]; disliked: string[] }; headers: Record<string, string>;
 modelConfig?: Record<string, unknown>; turnstileToken?: string;
};
type ActiveJob = { jobId: string; seed: Track; startedAt: number; personal: boolean };
const ACTIVE_KEY = "aftertone-active-job";
const JOB_TTL_MS = 30 * 60_000;
const STALL_MS = 8_000;
const JSON_HEADERS = { "Content-Type": "application/json" };
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
 const timer = setTimeout(resolve, ms);
 signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
const forgetActive = () => { try { localStorage.removeItem(ACTIVE_KEY); } catch { /* Nothing to forget. */ } };

/**
 * Runs one recommendation job. When the API drives steps server-side the browser only polls; if
 * progress stalls (e.g. the runner lost a personal key) it steps the job itself. Every step is
 * protected by the server lease, so the two drivers can never pay for the same batch twice.
 * A server-driven job is remembered locally, so reopening the page picks up its result.
 */
export function useRecommendJob() {
 const [busy, setBusy] = useState(false);
 const [progress, setProgress] = useState<Progress | null>(null);
 const [serverDriven, setServerDriven] = useState(false);
 const controller = useRef<AbortController | null>(null);
 const jobId = useRef<string | null>(null);

 const cancel = useCallback(() => {
  controller.current?.abort();
  controller.current = null;
  const id = jobId.current; jobId.current = null;
  setBusy(false); setProgress(null); forgetActive();
  if (id) void cancelJob(id);
 }, []);

 useEffect(() => () => { controller.current?.abort(); }, []);

 /** Poll or step `own` until it settles. `canStep` is false when the browser lacks the job's key. */
 const drive = useCallback(async (c: AbortController, own: string, first: JobData, headers: Record<string, string>, canStep: boolean): Promise<JobData | null> => {
  const active = () => !c.signal.aborted && controller.current === c;
  let data = first, driver = first.driver || (canStep ? "client" : "server");
  setServerDriven(driver === "server");
  let lastChange = Date.now(), lastMark = `${data.status}:${data.nextStep}:${data.progress?.scoredCount}`, recoveries = 0;
  const jobUrl = api(`/api/jobs/${encodeURIComponent(own)}`);
  while (data.status !== "done") {
   if (["failed", "cancelled", "expired"].includes(data.status || "")) throw new Error(data.error || "");
   const previousStep = data.nextStep ?? 0;
   try {
    if (data.status === "running" || driver === "server") {
     await sleep(Math.min(data.retryAfterMs || 1000, 2000), c.signal);
     data = await parseResponse<JobData>(await fetch(jobUrl, { signal: c.signal }));
     const mark = `${data.status}:${data.nextStep}:${data.progress?.scoredCount}`;
     if (mark !== lastMark) { lastMark = mark; lastChange = Date.now(); }
     // The runner went quiet on a pending step: take over from the browser when it can.
     else if (canStep && driver === "server" && data.status === "pending" && Date.now() - lastChange > STALL_MS) { driver = "client"; setServerDriven(false); }
    } else {
     data = await parseResponse<JobData>(await fetch(`${jobUrl}/step`, { method: "POST", headers, body: JSON.stringify({ step: data.nextStep }), signal: c.signal }));
     lastChange = Date.now();
    }
   } catch (stepError) {
    if (!active()) return null;
    const recoverable = stepError instanceof ApiResponseError ? stepError.status >= 500 : stepError instanceof TypeError;
    if (!recoverable || recoveries >= 3) throw stepError;
    recoveries++;
    // Read committed work after transport/server failures; never replay an unchanged pending step.
    try {
     data = await parseResponse<JobData>(await fetch(jobUrl, { signal: c.signal }));
     if (driver === "client" && data.status === "pending" && (data.nextStep ?? 0) <= previousStep) throw stepError;
    } catch { throw stepError; }
   }
   if (!active()) return null;
   if (data.progress) setProgress(data.progress);
  }
  return data;
 }, []);

 const settle = useCallback(async (c: AbortController, work: () => Promise<JobData | null>): Promise<JobData | null> => {
  const active = () => !c.signal.aborted && controller.current === c;
  try {
   const data = await work();
   if (!active()) return null;
   jobId.current = null; forgetActive();
   return data;
  } catch (error) {
   if (!active()) return null;
   const own = jobId.current; jobId.current = null; forgetActive();
   if (own) void cancelJob(own);
   throw error;
  } finally {
   if (active()) { setBusy(false); controller.current = null; }
  }
 }, []);

 const run = useCallback(async (request: RecommendRequest): Promise<JobData | null> => {
  cancel();
  const c = new AbortController(); controller.current = c;
  setBusy(true); setProgress(null); setServerDriven(false);
  return settle(c, async () => {
   const { seed, headers, ...rest } = request;
   const data = await postJson<JobData>("/api/recommend", { ...rest, seed: { id: seed.id, provider: seed.provider } }, headers, c.signal);
   const own = data.jobId || null;
   if (c.signal.aborted || controller.current !== c) { if (own) void cancelJob(own); return null; }
   if (!own) return data;
   jobId.current = own;
   if (data.progress) setProgress(data.progress);
   if (data.driver === "server") writeStored(ACTIVE_KEY, { jobId: own, seed: withoutPreview(seed), startedAt: Date.now(), personal: "X-Model-Api-Key" in headers } satisfies ActiveJob);
   return drive(c, own, data, headers, true);
  });
 }, [cancel, drive, settle]);

 /** Pick up a server-driven job left running by an earlier visit. */
 const resume = useCallback(async (): Promise<{ data: JobData; seed: Track } | null> => {
  const stored = readStored<ActiveJob | null>(ACTIVE_KEY, null);
  if (!stored?.jobId || !stored.seed || Date.now() - stored.startedAt > JOB_TTL_MS) { forgetActive(); return null; }
  const c = new AbortController(); controller.current = c;
  jobId.current = stored.jobId;
  setBusy(true); setProgress(null);
  // A personal key never outlives its tab, so only site jobs may be stepped from here.
  const data = await settle(c, () => drive(c, stored.jobId, { status: "pending", driver: "server" }, JSON_HEADERS, !stored.personal));
  return data ? { data, seed: stored.seed } : null;
 }, [drive, settle]);

 return { busy, progress, serverDriven, run, resume, cancel };
}
