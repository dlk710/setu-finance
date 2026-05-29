export function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function buildInitials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((piece) => piece[0]?.toUpperCase() ?? "")
    .join("");
}
