import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const defaultCredentialsPath = path.join(process.cwd(), "server", "credentials", "gmail-oauth.json");
const defaultTokenPath = path.join(process.cwd(), "server", "credentials", "gmail-token.json");

export function getGmailPaths() {
  return {
    credentialsPath: process.env.GMAIL_CREDENTIALS_PATH?.trim() || defaultCredentialsPath,
    tokenPath: process.env.GMAIL_TOKEN_PATH?.trim() || defaultTokenPath,
  };
}

async function loadSavedCredentialsIfExist() {
  try {
    const { tokenPath } = getGmailPaths();
    const content = await fs.readFile(tokenPath, "utf8");
    return google.auth.fromJSON(JSON.parse(content));
  } catch {
    return null;
  }
}

async function saveCredentials(client) {
  const { credentialsPath, tokenPath } = getGmailPaths();
  const content = await fs.readFile(credentialsPath, "utf8");
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;

  if (!key?.client_id || !key?.client_secret || !client.credentials.refresh_token) {
    throw new Error("Gmail authorization completed, but refresh token could not be persisted.");
  }

  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(
    tokenPath,
    JSON.stringify(
      {
        type: "authorized_user",
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
      },
      null,
      2,
    ),
  );
}

export function getGmailIntegrationStatus() {
  const { credentialsPath, tokenPath } = getGmailPaths();
  return {
    configured: existsSync(credentialsPath),
    authorized: existsSync(tokenPath),
    credentialsPath,
    tokenPath,
  };
}

export function isGmailInvalidGrantError(error) {
  const parts = [
    error?.message,
    error?.code,
    error?.response?.data?.error,
    error?.response?.data?.error_description,
  ]
    .filter(Boolean)
    .map((part) => String(part).toLowerCase());

  return parts.some((part) => part.includes("invalid_grant"));
}

export function createGmailReauthorizationError() {
  const { tokenPath } = getGmailPaths();
  const error = new Error(
    `Gmail authorization expired or was revoked. Reauthorize the Zelle inbox by running \`npm run gmail:authorize\`. This will replace the local token at ${tokenPath}.`,
  );
  error.statusCode = 428;
  error.code = "GMAIL_REAUTH_REQUIRED";
  return error;
}

export async function authorizeGmail({ interactive = false } = {}) {
  const existingClient = await loadSavedCredentialsIfExist();
  if (existingClient) {
    return existingClient;
  }

  if (!interactive) {
    throw new Error(
      "Gmail is not authorized yet. Put your OAuth desktop credentials file in place and run `npm run gmail:authorize`.",
    );
  }

  const { credentialsPath } = getGmailPaths();
  const client = await authenticate({
    scopes: SCOPES,
    keyfilePath: credentialsPath,
  });

  if (client.credentials) {
    await saveCredentials(client);
  }

  return client;
}
