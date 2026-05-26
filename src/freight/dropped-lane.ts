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
1. Call fetch_quotes with origin ${origin_zip} and destination ${dest_zip}.
2. Compare XPO and Coyote by quote_price and estimated_transit_hours.
3. If the best quote is $1500 or less, recommend that carrier for autonomous booking.
4. If the best quote is over $1500, call request_human_approval with the lane details, best carrier name, best price, and transit hours.
5. After requesting approval, report that the system is waiting for the logistics manager.

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
