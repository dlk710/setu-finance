export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body:
      options.body && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.message || "Request failed.");
    error.status = response.status;
    throw error;
  }

  return data;
}

export function loadAuthStatus() {
  return apiRequest("/api/auth/status");
}

export function loadApiState() {
  return apiRequest("/api/state");
}

export function loadPublicReferralProgram() {
  return apiRequest("/api/public/referral-program");
}

export function submitPublicReferral(form) {
  return apiRequest("/api/public/referrals", {
    method: "POST",
    body: form,
  });
}

export function submitPublicFeedback(form) {
  return apiRequest("/api/public/feedback", {
    method: "POST",
    body: form,
  });
}
