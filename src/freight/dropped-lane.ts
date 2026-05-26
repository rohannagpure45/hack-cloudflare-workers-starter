import { executeAgentRun } from "../agent/store";
import type { Env } from "../types";

export interface DroppedLanePayload {
  lane_id: string;
  origin_zip: string;
  dest_zip: string;
  supplier?: string;
  fulfillment_center?: string;
  weight_lbs?: number;
  delivery_deadline?: string;
  [key: string]: unknown;
}

type ParseResult =
  | { ok: true; data: DroppedLanePayload }
  | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseDroppedLanePayload(body: unknown): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const record = body as Record<string, unknown>;
  const lane_id = record.lane_id;
  const origin_zip = record.origin_zip;
  const dest_zip = record.dest_zip;

  if (!isNonEmptyString(lane_id)) {
    return { ok: false, error: "lane_id is required and must be a non-empty string" };
  }
  if (!isNonEmptyString(origin_zip)) {
    return { ok: false, error: "origin_zip is required and must be a non-empty string" };
  }
  if (!isNonEmptyString(dest_zip)) {
    return { ok: false, error: "dest_zip is required and must be a non-empty string" };
  }

  return {
    ok: true,
    data: {
      ...record,
      lane_id: lane_id.trim(),
      origin_zip: origin_zip.trim(),
      dest_zip: dest_zip.trim(),
    },
  };
}

export function buildDroppedLaneInstructions(data: DroppedLanePayload): string {
  const { lane_id, origin_zip, dest_zip, ...rest } = data;
  const extras =
    Object.keys(rest).length > 0
      ? `\n\nAdditional lane context:\n${JSON.stringify(rest, null, 2)}`
      : "";

  return `A primary carrier dropped freight lane ${lane_id} from origin ZIP ${origin_zip} to destination ZIP ${dest_zip}.

Your job as the Freight Rate Spot Market Negotiator:
1. Fetch a fair-market baseline for this lane.
2. Request spot quotes from backup 3PL providers.
3. Compare rate, transit time, and baseline delta.
4. Counter-offer or select the best viable carrier.
5. Auto-book only if the negotiated rate is within 10% of baseline.
6. Escalate for human approval if the best viable rate is materially above baseline (especially ~20%+ over baseline).

Respond with a concise recovery plan and the next concrete action.${extras}`;
}

export async function processDroppedLane(
  env: Env,
  data: DroppedLanePayload,
): Promise<void> {
  console.log("[DROPPED-LANE] Starting Subconscious agent run for lane:", data.lane_id);

  const instructions = buildDroppedLaneInstructions(data);
  const run = await executeAgentRun(env, "dropped-lane", instructions);

  if (run.status === "completed") {
    console.log(`[DROPPED-LANE] Agent run ${run.id} completed`);
  } else {
    console.log(`[DROPPED-LANE] Agent run ${run.id} failed:`, run.error);
  }
}
