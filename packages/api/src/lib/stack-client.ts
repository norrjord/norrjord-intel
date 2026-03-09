import { env } from "@norrjord-intel/env/server";

export async function notifyStackClosedWon(data: {
  entityId: string;
  name: string | null;
  domain: string | null;
  orgNumber: string | null;
  email?: string;
}) {
  if (!env.STACK_API_URL || !env.STACK_WEBHOOK_SECRET) {
    console.warn("[stack-client] STACK_API_URL or STACK_WEBHOOK_SECRET not configured, skipping notification");
    return null;
  }

  const response = await fetch(
    `${env.STACK_API_URL}/webhooks/intel/closed-won`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": env.STACK_WEBHOOK_SECRET,
      },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    console.error("[stack-client] Failed to notify stack:", response.status, await response.text());
    return null;
  }

  return await response.json();
}
