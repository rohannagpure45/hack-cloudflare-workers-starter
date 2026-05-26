import type { Context } from "hono";
import type { Env } from "../types";

const APPROVAL_KV_PREFIX = "freight:approval:";

export type ApprovalDecision = "approved" | "rejected";

function approvalPage(decision: ApprovalDecision, laneId?: string): string {
  const approved = decision === "approved";
  const title = approved ? "Booking approved" : "Booking rejected";
  const detail = approved
    ? "The freight spot rate has been approved. The lane recovery agent may finalize the backup carrier booking."
    : "The freight spot rate was rejected. No backup carrier will be booked for this lane.";
  const laneLine = laneId
    ? `<p><strong>Lane ID:</strong> ${escapeHtml(laneId)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Freight negotiator</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: ${approved ? "#0a7a3e" : "#b42318"}; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.25rem; background: #fafafa; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${detail}</p>
    ${laneLine}
    <p><small>You can close this tab and return to Slack. Check Wrangler logs for <code>[SLACK]</code> confirmation.</small></p>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function recordDecision(
  env: Env,
  decision: ApprovalDecision,
  laneId?: string,
): Promise<void> {
  const key = `${APPROVAL_KV_PREFIX}${laneId ?? "latest"}`;
  await env.AGENT_KV.put(
    key,
    JSON.stringify({
      decision,
      lane_id: laneId ?? null,
      decided_at: new Date().toISOString(),
    }),
    { expirationTtl: 60 * 60 * 24 * 7 },
  );
}

export async function handleApprovalAction(
  c: Context<{ Bindings: Env }>,
  decision: ApprovalDecision,
): Promise<Response> {
  const laneId = c.req.query("lane_id")?.trim() || undefined;

  console.log(`=== [SLACK] Human ${decision} ${laneId ? `(lane ${laneId})` : ""} ===`);
  if (decision === "approved") {
    console.log("[SLACK] Finalizing backup carrier booking (demo)");
  } else {
    console.log("[SLACK] Cancelling backup carrier booking (demo)");
  }

  try {
    await recordDecision(c.env, decision, laneId);
  } catch (err) {
    console.error("[SLACK] Failed to persist approval decision:", err);
  }

  return c.html(approvalPage(decision, laneId));
}
