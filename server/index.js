import express from "express";
import {
  applyReferralRewardToInvoice,
  convertReferralSubmissionToRelationship,
  confirmPendingPaymentRecord,
  createCustomerOnboardingRecord,
  createEmployeeRecord,
  createInvoiceRecord,
  deleteArchivedExceptionRecord,
  dismissReferralSubmission,
  generateEmployeePayslip,
  listDueInvoiceIds,
  loadBusinessContractDownloadRecord,
  loadContractDownloadRecord,
  loadEmployeePayslipDownloadRecord,
  loadFeedbackAttachmentRecord,
  loadPublicReferralProgramState,
  listPendingPaymentIds,
  loadState,
  markReferralIntakeQualified,
  prepareStateStore,
  recordEmployeePayment,
  recordManualPaymentRecord,
  recordOtherExpense,
  resolvePublicReferralReferrer,
  resolveReferralIntakeIdentity,
  resolveExceptionRecord,
  sendReceiptForPaymentRecord,
  sendQueuedInvoice,
  setReferralIntakeReviewStatus,
  submitReferralIntake,
  submitPublicFeedbackEntry,
  submitPublicReferralEntry,
  updateFeedbackSubmissionStatus,
  updateGmailAutoSyncSettings,
  updateReferralProgramSettings,
  uploadEmployeeContractRecord,
} from "./stateStore.js";
import {
  authenticatePortalUser,
  clearAuthCookie,
  getPortalAuthStatus,
  readAuthenticatedSession,
  setAuthCookie,
} from "./services/auth.js";
import { parseContractUpload } from "./services/contractParser.js";
import {
  getGmailAutoSyncStatus,
  refreshGmailAutoSyncSchedule,
  runGmailSyncOnce,
  startGmailAutoSync,
} from "./services/gmailAutoSync.js";
import { buildGmailClientStatus } from "./services/gmailSync.js";
import { getEmailIntegrationStatus, sendInvoiceEmail, sendReceiptEmail } from "./services/email.js";
import integrationRouter from "./routes/integration.js";
import { recordAuthAuditEvent } from "./services/authAudit.js";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "18mb" }));
app.use("/api", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const publicReferralRateLimit = new Map();

function publicReferralRateLimiter(request, _response, next) {
  const key = request.ip || request.headers["x-forwarded-for"] || "local";
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const entry = publicReferralRateLimit.get(key) ?? { count: 0, resetAt: now + windowMs };
  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  publicReferralRateLimit.set(key, entry);
  if (entry.count > 20) {
    next(createHttpError(429, "Too many referral attempts. Please wait and try again."));
    return;
  }
  next();
}

function formatApiState(state) {
  return {
    ...state,
    integrationStatus: {
      email: getEmailIntegrationStatus(),
      gmail: {
        ...buildGmailClientStatus(state),
        autoSync: getGmailAutoSyncStatus(),
      },
    },
  };
}

function setContractFileResponseHeaders(response, file, disposition = "attachment") {
  response.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  response.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${file.fileName.replace(/"/g, "")}"`,
  );
  response.setHeader("Cache-Control", "private, no-store");
}

app.get("/api/auth/status", (request, response) => {
  const session = readAuthenticatedSession(request);
  response.json({
    authenticated: Boolean(session),
    username: session?.username ?? null,
    auth: getPortalAuthStatus(),
  });
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const { username, password } = request.body ?? {};
    const account = authenticatePortalUser(username, password);

    if (!account) {
      await recordAuthAuditEvent({
        request,
        eventType: "login_failed",
        outcome: "failure",
        username,
        metadata: {
          reason: "invalid_credentials",
        },
      });
      throw createHttpError(401, "Incorrect username or password.");
    }

    setAuthCookie(response, account.username);
    await recordAuthAuditEvent({
      request,
      eventType: "login_success",
      outcome: "success",
      username: account.username,
      actorUsername: account.username,
    });
    response.json({
      message: "Signed in.",
      authenticated: true,
      username: account.username,
      auth: getPortalAuthStatus(),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (request, response, next) => {
  try {
    const session = readAuthenticatedSession(request);
    clearAuthCookie(response);
    await recordAuthAuditEvent({
      request,
      eventType: "logout",
      outcome: "success",
      username: session?.username ?? null,
      actorUsername: session?.username ?? null,
    });
    response.json({
      message: "Signed out.",
      authenticated: false,
      username: null,
      auth: getPortalAuthStatus(),
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/integration", integrationRouter);

app.use("/api", (request, _response, next) => {
  if (request.path.startsWith("/auth") || request.path.startsWith("/public")) {
    next();
    return;
  }

  const session = readAuthenticatedSession(request);
  if (!session) {
    next(createHttpError(401, "Please sign in to access the portal."));
    return;
  }

  request.portalUser = session;
  next();
});

app.get("/api/public/referral-program", async (_request, response, next) => {
  try {
    const data = await loadPublicReferralProgramState();
    response.json(data);
  } catch (error) {
    next(error);
  }
});

app.post("/api/public/referral/resolve", publicReferralRateLimiter, async (request, response, next) => {
  try {
    const result = await resolvePublicReferralReferrer(request.body ?? {});
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/public/referral", publicReferralRateLimiter, async (request, response, next) => {
  try {
    const result = await submitReferralIntake(request.body ?? {}, {
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/public/referrals", async (request, response, next) => {
  try {
    const result = await submitPublicReferralEntry(request.body ?? {});
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/public/feedback", async (request, response, next) => {
  try {
    const result = await submitPublicFeedbackEntry(request.body ?? {});
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/state", async (_request, response, next) => {
  try {
    const state = await loadState();
    response.json({
      state: formatApiState(state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:invoiceId/send", async (request, response, next) => {
  try {
    const result = await sendQueuedInvoice(request.params.invoiceId, ({ customer, invoice, recipient }) =>
      sendInvoiceEmail({
        customer,
        invoice,
        to: recipient,
      }),
    );

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/send-all", async (_request, response, next) => {
  try {
    const queue = await listDueInvoiceIds();
    if (!queue.length) {
      const state = await loadState();
      response.json({
        message: "No invoices were waiting to be sent.",
        state: formatApiState(state),
      });
      return;
    }

    let latestState = null;
    let sentCount = 0;

    for (const invoiceId of queue) {
      const result = await sendQueuedInvoice(invoiceId, ({ customer, invoice, recipient }) =>
        sendInvoiceEmail({
          customer,
          invoice,
          to: recipient,
        }),
      );
      latestState = result.state;
      sentCount += 1;
    }

    response.json({
      message: `${sentCount} invoice${sentCount === 1 ? "" : "s"} sent.`,
      state: formatApiState(latestState ?? (await loadState())),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices", async (request, response, next) => {
  try {
    const { form, sendNow } = request.body ?? {};

    if (!form) {
      throw new Error("Invoice form data is required.");
    }

    const result = await createInvoiceRecord({
      form,
      sendNow: Boolean(sendNow),
      deliverInvoice: ({ customer, invoice, recipient }) =>
        sendInvoiceEmail({
          customer,
          invoice,
          to: recipient,
        }),
    });

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/customers", async (request, response, next) => {
  try {
    const { form } = request.body ?? {};

    if (!form) {
      throw new Error("Client onboarding data is required.");
    }

    const result = await createCustomerOnboardingRecord({
      form,
      actingUsername: request.portalUser?.username ?? "unknown",
    });

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/contracts/preview", async (request, response, next) => {
  try {
    const { fileName, mimeType, contentBase64 } = request.body ?? {};
    if (!fileName || !contentBase64) {
      throw new Error("Contract file content is required for preview.");
    }

    const normalizedBase64 = String(contentBase64).includes(",")
      ? String(contentBase64).slice(String(contentBase64).indexOf(",") + 1)
      : String(contentBase64);
    const buffer = Buffer.from(normalizedBase64, "base64");
    if (!buffer.length) {
      throw new Error("Uploaded contract could not be read.");
    }

    const preview = await parseContractUpload({
      fileName: String(fileName),
      mimeType: String(mimeType || "application/octet-stream"),
      buffer,
    });

    response.json({
      message: `Contract preview ready for ${fileName}.`,
      preview,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/contracts/:contractId/download", async (request, response, next) => {
  try {
    const result = await loadContractDownloadRecord(request.params.contractId);
    setContractFileResponseHeaders(response, result.file, "inline");
    response.send(result.file.buffer);
  } catch (error) {
    next(error);
  }
});

app.get("/api/contracts/:contractId/preview", async (request, response, next) => {
  try {
    const result = await loadContractDownloadRecord(request.params.contractId);
    setContractFileResponseHeaders(response, result.file, "inline");
    response.send(result.file.buffer);
  } catch (error) {
    next(error);
  }
});

app.get("/api/business-contracts/:contractId/download", async (request, response, next) => {
  try {
    const result = await loadBusinessContractDownloadRecord(request.params.contractId);
    setContractFileResponseHeaders(response, result.file, "attachment");
    response.send(result.file.buffer);
  } catch (error) {
    next(error);
  }
});

app.get("/api/business-contracts/:contractId/preview", async (request, response, next) => {
  try {
    const result = await loadBusinessContractDownloadRecord(request.params.contractId);
    setContractFileResponseHeaders(response, result.file, "inline");
    response.send(result.file.buffer);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/referral-program", async (request, response, next) => {
  try {
    const { config } = request.body ?? {};
    if (!config) {
      throw new Error("Referral program settings are required.");
    }

    const result = await updateReferralProgramSettings(
      config,
      request.portalUser?.username ?? "unknown",
    );
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/gmail-sync", async (request, response, next) => {
  try {
    const { config } = request.body ?? {};
    if (!config) {
      throw new Error("Gmail sync settings are required.");
    }

    const result = await updateGmailAutoSyncSettings(
      config,
      request.portalUser?.username ?? "unknown",
    );
    await refreshGmailAutoSyncSchedule();
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/referral-rewards/:rewardId/apply", async (request, response, next) => {
  try {
    const result = await applyReferralRewardToInvoice(
      request.params.rewardId,
      request.portalUser?.username ?? "unknown",
    );
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/referral-submissions/:submissionId/convert", async (request, response, next) => {
  try {
    const result = await convertReferralSubmissionToRelationship(
      request.params.submissionId,
      request.portalUser?.username ?? "unknown",
    );

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/referral-submissions/:submissionId/dismiss", async (request, response, next) => {
  try {
    const result = await dismissReferralSubmission(
      request.params.submissionId,
      request.portalUser?.username ?? "unknown",
    );

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/referral-intake/:intakeId/resolve-identity", async (request, response, next) => {
  try {
    const { partyType, partyId } = request.body ?? {};
    const result = await resolveReferralIntakeIdentity({
      intakeId: request.params.intakeId,
      partyType,
      partyId,
      actingUsername: request.portalUser?.username ?? "unknown",
    });
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/referral-intake/:intakeId/review", async (request, response, next) => {
  try {
    const { action, notes = "" } = request.body ?? {};
    const result = await setReferralIntakeReviewStatus({
      intakeId: request.params.intakeId,
      action,
      notes,
      actingUsername: request.portalUser?.username ?? "unknown",
    });
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/referral-intake/:intakeId/qualify", async (request, response, next) => {
  try {
    const result = await markReferralIntakeQualified({
      intakeId: request.params.intakeId,
      actingUsername: request.portalUser?.username ?? "unknown",
    });
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/employees", async (request, response, next) => {
  try {
    const result = await createEmployeeRecord({
      form: request.body?.form ?? {},
      actingUsername: request.portalUser?.username ?? "unknown",
    });
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/employee-payments", async (request, response, next) => {
  try {
    const result = await recordEmployeePayment({
      form: request.body?.form ?? {},
      actingUsername: request.portalUser?.username ?? "unknown",
    });
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/employee-payslips", async (request, response, next) => {
  try {
    const result = await generateEmployeePayslip({
      form: request.body?.form ?? {},
      actingUsername: request.portalUser?.username ?? "unknown",
    });
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/employee-payslips/:payslipId/download", async (request, response, next) => {
  try {
    const result = await loadEmployeePayslipDownloadRecord(request.params.payslipId);
    response.setHeader("Content-Type", result.mimeType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName.replace(/"/g, "")}"`,
    );
    response.send(result.buffer);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/employees/:employeeId/contracts", async (request, response, next) => {
  try {
    const result = await uploadEmployeeContractRecord({
      employeeId: request.params.employeeId,
      form: request.body?.form ?? {},
      actingUsername: request.portalUser?.username ?? "unknown",
    });
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/other-expenses", async (request, response, next) => {
  try {
    const result = await recordOtherExpense({
      form: request.body?.form ?? {},
      actingUsername: request.portalUser?.username ?? "unknown",
    });
    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/feedback/:feedbackId/review", async (request, response, next) => {
  try {
    const result = await updateFeedbackSubmissionStatus(
      request.params.feedbackId,
      "reviewed",
      request.portalUser?.username ?? "unknown",
    );

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/feedback/:feedbackId/archive", async (request, response, next) => {
  try {
    const result = await updateFeedbackSubmissionStatus(
      request.params.feedbackId,
      "archived",
      request.portalUser?.username ?? "unknown",
    );

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/feedback/:feedbackId/attachments/:attachmentId", async (request, response, next) => {
  try {
    const result = await loadFeedbackAttachmentRecord(
      request.params.feedbackId,
      request.params.attachmentId,
    );
    response.setHeader("Content-Type", result.mimeType || "application/octet-stream");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${result.fileName.replace(/"/g, "")}"`,
    );
    response.send(result.buffer);
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments/:paymentId/confirm", async (request, response, next) => {
  try {
    const result = await confirmPendingPaymentRecord(request.params.paymentId);

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments/manual", async (request, response, next) => {
  try {
    const result = await recordManualPaymentRecord({
      form: request.body?.form,
      actingUsername: request.portalUser?.username ?? "unknown",
    });

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments/confirm-all", async (_request, response, next) => {
  try {
    const queue = await listPendingPaymentIds();
    if (!queue.length) {
      const state = await loadState();
      response.json({
        message: "No pending payments were waiting to be applied.",
        state: formatApiState(state),
      });
      return;
    }

    let latestState = null;
    let appliedCount = 0;
    let blockedCount = 0;

    for (const paymentId of queue) {
      const result = await confirmPendingPaymentRecord(paymentId);
      latestState = result.state;
      if (result.applied === false) {
        blockedCount += 1;
      } else {
        appliedCount += 1;
      }
    }

    response.json({
      message:
        blockedCount > 0
          ? `${appliedCount} payment${appliedCount === 1 ? "" : "s"} applied. ${blockedCount} moved to exceptions as possible duplicates.`
          : "All pending payments were applied.",
      state: formatApiState(latestState ?? (await loadState())),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments/:paymentId/send-receipt", async (request, response, next) => {
  try {
    const result = await sendReceiptForPaymentRecord(
      request.params.paymentId,
      ({ customer, payment, invoice, recipient }) =>
        sendReceiptEmail({
          customer,
          payment,
          invoice,
          to: recipient,
        }),
    );

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/exceptions/:exceptionId/resolve", async (request, response, next) => {
  try {
    const { actionType, candidateCustomerId, saveAlias = false } = request.body ?? {};
    const result = await resolveExceptionRecord({
      exceptionId: request.params.exceptionId,
      actionType,
      candidateCustomerId,
      saveAlias,
      actingUsername: request.portalUser?.username ?? "unknown",
    });

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/exceptions/:exceptionId/delete-archived", async (request, response, next) => {
  try {
    const { confirmationText, understood = false, reason = "" } = request.body ?? {};
    const result = await deleteArchivedExceptionRecord({
      exceptionId: request.params.exceptionId,
      confirmationText,
      understood,
      reason,
      actingUsername: request.portalUser?.username ?? "unknown",
    });

    response.json({
      message: result.message,
      state: formatApiState(result.state),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/gmail/sync", async (_request, response, next) => {
  try {
    const result = await runGmailSyncOnce({ trigger: "manual" });
    if (result.skipped) {
      const state = await loadState();
      response.json({
        message: result.reason,
        state: formatApiState(state),
      });
      return;
    }

    const { syncResult, state } = result;
    response.json({
      message: syncResult.message,
      state: formatApiState(state),
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  response.status(error.statusCode || error.status || 400).json({
    error: error.message || "Something went wrong.",
  });
});

async function startServer() {
  await prepareStateStore();
  await startGmailAutoSync();

  app.listen(port, () => {
    console.log(`Setu backend listening on http://127.0.0.1:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start Setu backend", error);
  process.exit(1);
});
