import express from "express";
import {
  applyReferralRewardToInvoice,
  convertReferralSubmissionToRelationship,
  confirmPendingPaymentRecord,
  createCustomerOnboardingRecord,
  createInvoiceRecord,
  dismissReferralSubmission,
  listDueInvoiceIds,
  loadContractDownloadRecord,
  loadFeedbackAttachmentRecord,
  loadPublicReferralProgramState,
  listPendingPaymentIds,
  loadState,
  prepareStateStore,
  recordManualPaymentRecord,
  resolveExceptionRecord,
  sendReceiptForPaymentRecord,
  sendQueuedInvoice,
  submitPublicFeedbackEntry,
  submitPublicReferralEntry,
  updateFeedbackSubmissionStatus,
  updateGmailAutoSyncSettings,
  updateReferralProgramSettings,
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

app.get("/api/auth/status", (request, response) => {
  const session = readAuthenticatedSession(request);
  response.json({
    authenticated: Boolean(session),
    username: session?.username ?? null,
    auth: getPortalAuthStatus(),
  });
});

app.post("/api/auth/login", (request, response, next) => {
  try {
    const { username, password } = request.body ?? {};
    const account = authenticatePortalUser(username, password);

    if (!account) {
      throw createHttpError(401, "Incorrect username or password.");
    }

    setAuthCookie(response, account.username);
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

app.post("/api/auth/logout", (_request, response) => {
  clearAuthCookie(response);
  response.json({
    message: "Signed out.",
    authenticated: false,
    username: null,
    auth: getPortalAuthStatus(),
  });
});

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
    response.setHeader("Content-Type", result.file.mimeType || "application/octet-stream");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${result.file.fileName.replace(/"/g, "")}"`,
    );
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
