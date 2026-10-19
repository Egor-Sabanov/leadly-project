import { createHash, timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export type IngestResult = {
  feed: string;
  imported: number;
  skipped: number;
  error?: string;
};

export function isCronAuthorized(secret: string | undefined, header: string | null) {
  if (!secret || secret.length < 16 || !header) return false;
  return timingSafeEqual(
    createHash("sha256").update(`Bearer ${secret}`).digest(),
    createHash("sha256").update(header).digest(),
  );
}

export class TransientIngestError extends Error {}

// One bounded retry for transient upstream/transport failures. Permission,
// schema, parsing and unsafe URL errors require operator attention instead.
export async function retryIngestion<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  try {
    signal.throwIfAborted();
    return await operation();
  } catch (error) {
    if (
      signal.aborted ||
      !(error instanceof TransientIngestError ||
        error instanceof TypeError ||
        (error instanceof Error && error.name === "TimeoutError"))
    ) throw error;
    await delay(250, undefined, { signal });
    signal.throwIfAborted();
    return operation();
  }
}

export function summarizeIngestion(results: IngestResult[]) {
  const failed = results.filter((row) => row.error).length;
  return {
    ok: results.length > 0 && failed === 0,
    status: results.length === 0 || failed === results.length
      ? "failed" as const
      : failed > 0 ? "partial" as const : "completed" as const,
    feedsProcessed: results.length,
    feedsFailed: failed,
    // Upserts include refreshed existing rows, not just newly created jobs.
    imported: results.reduce((sum, row) => sum + row.imported, 0),
    skipped: results.reduce((sum, row) => sum + row.skipped, 0),
  };
}
