import express from "express";
import {
  applyGmailSyncResult,
  confirmPendingPaymentRecord,
  createInvoiceRecord,
  listDueInvoiceIds,
  listPendingPaymentIds,
  loadState,
  prepareStateStore,
  resolveExceptionRecord,
  sendQueuedInvoice,
} from "./stateStore.js";
import {
  authenticatePortalUser,
  clearAuthCookie,
  getPortalAuthStatus,
  readAuthenticatedSession,
  setAuthCookie,
} from "./services/auth.js";
import { buildGmailClientStatus, syncGmailInbox } from "./services/gmailSync.js";
import { getEmailIntegrationStatus, sendInvoiceEmail, sendReceiptEmail } from "./services/email.js";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json());

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
      gmail: buildGmailClientStatus(state),
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
  if (request.path.startsWith("/auth")) {
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

app.post("/api/payments/:paymentId/confirm", async (request, response, next) => {
  try {
    const result = await confirmPendingPaymentRecord(
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

app.post("/api/payments/confirm-all", async (_request, response, next) => {
  try {
    const queue = await listPendingPaymentIds();
    if (!queue.length) {
      const state = await loadState();
      response.json({
        message: "No pending payments were waiting for confirmation.",
        state: formatApiState(state),
      });
      return;
    }

    let latestState = null;

    for (const paymentId of queue) {
      const result = await confirmPendingPaymentRecord(
        paymentId,
        ({ customer, payment, invoice, recipient }) =>
          sendReceiptEmail({
            customer,
            payment,
            invoice,
            to: recipient,
          }),
      );
      latestState = result.state;
    }

    response.json({
      message: "All pending payments were confirmed and receipt emails were sent.",
      state: formatApiState(latestState ?? (await loadState())),
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
    const current = await loadState();
    const syncResult = await syncGmailInbox(current);
    const state = await applyGmailSyncResult(syncResult);
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

  app.listen(port, () => {
    console.log(`Setu backend listening on http://127.0.0.1:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start Setu backend", error);
  process.exit(1);
});
