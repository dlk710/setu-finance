import express from "express";
import { listEngagementStatus } from "../integration/engagementStore.js";
import { recordAuthAuditEvent } from "../services/authAudit.js";

const router = express.Router();

async function requireIntegrationApiKey(request, response, next) {
  const configuredKey = process.env.INTEGRATION_API_KEY;
  const providedKey = request.get("X-Api-Key");

  if (!configuredKey || !providedKey || providedKey !== configuredKey) {
    await recordAuthAuditEvent({
      request,
      eventType: "integration_api_key_failed",
      outcome: "failure",
      metadata: {
        integration: "engagement_status",
        reason: configuredKey ? "missing_or_invalid_key" : "integration_key_not_configured",
      },
    });
    response.status(401).json({ error: "unauthorized" });
    return;
  }

  await recordAuthAuditEvent({
    request,
    eventType: "integration_api_key_success",
    outcome: "success",
    metadata: {
      integration: "engagement_status",
    },
  });

  next();
}

router.get("/engagement-status", requireIntegrationApiKey, async (_request, response, next) => {
  try {
    const asOf = new Date().toISOString();
    const customers = await listEngagementStatus();
    response.json({
      as_of: asOf,
      customers: customers.map((customer) => ({
        ...customer,
        as_of: customer.as_of ?? asOf,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
