function normalizeServiceToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SERVICE_CATALOG = [
  {
    code: "awards",
    type: "criteria",
    shortLabel: "Awards",
    longLabel: "Lesser nationally or internationally recognized prizes or awards",
    aliases: [
      "prizes or awards",
      "nationally recognized awards",
      "internationally recognized awards",
    ],
  },
  {
    code: "memberships",
    type: "criteria",
    shortLabel: "Memberships",
    longLabel: "Membership in associations that demand outstanding achievement",
    aliases: ["association memberships", "elite memberships", "memberships"],
  },
  {
    code: "published-material",
    type: "criteria",
    shortLabel: "Press",
    longLabel: "Published material about the client in major media",
    aliases: ["published material", "major media", "media coverage", "press"],
  },
  {
    code: "judging",
    type: "criteria",
    shortLabel: "Judging",
    longLabel: "Participation as a judge of the work of others",
    aliases: ["judge", "judging", "peer review"],
  },
  {
    code: "original-contributions",
    type: "criteria",
    shortLabel: "Contributions",
    longLabel: "Original contributions of major significance",
    aliases: ["original contributions", "major significance", "contributions"],
  },
  {
    code: "authorship",
    type: "criteria",
    shortLabel: "Authorship",
    longLabel: "Authorship of scholarly articles",
    aliases: ["scholarly articles", "articles", "authorship"],
  },
  {
    code: "exhibitions",
    type: "criteria",
    shortLabel: "Exhibitions",
    longLabel: "Display of work at artistic exhibitions or showcases",
    aliases: ["artistic exhibitions", "showcases", "exhibitions"],
  },
  {
    code: "critical-role",
    type: "criteria",
    shortLabel: "Critical role",
    longLabel: "Leading or critical role for distinguished organizations",
    aliases: ["leading role", "critical role", "distinguished organizations"],
  },
  {
    code: "high-salary",
    type: "criteria",
    shortLabel: "High salary",
    longLabel: "High salary or other significantly high remuneration",
    aliases: ["high remuneration", "high salary"],
  },
  {
    code: "commercial-success",
    type: "criteria",
    shortLabel: "Commercial success",
    longLabel: "Commercial success in the performing arts",
    aliases: ["performing arts", "commercial success"],
  },
  {
    code: "full-profile",
    type: "service",
    shortLabel: "Full profile",
    longLabel: "Full profile build and strategy",
    aliases: ["profile build", "profile strategy", "full profile"],
  },
  {
    code: "full-petition",
    type: "service",
    shortLabel: "Full petition",
    longLabel: "Full petition review and assembly",
    aliases: ["full petition review", "petition review", "petition assembly"],
  },
  {
    code: "media-package",
    type: "service",
    shortLabel: "Media package",
    longLabel: "Media package and publication support",
    aliases: ["media package", "publication support", "press package"],
  },
  {
    code: "rfe-support",
    type: "service",
    shortLabel: "RFE support",
    longLabel: "RFE support",
    aliases: ["rfe", "request for evidence", "rfe support"],
  },
  {
    code: "filing-support",
    type: "service",
    shortLabel: "Filing support",
    longLabel: "Filing support",
    aliases: ["filing", "filing support"],
  },
];

const SERVICE_INDEX = new Map();
for (const definition of SERVICE_CATALOG) {
  const tokens = new Set([
    definition.code,
    definition.shortLabel,
    definition.longLabel,
    ...(definition.aliases ?? []),
  ]);

  for (const token of tokens) {
    const normalized = normalizeServiceToken(token);
    if (normalized) {
      SERVICE_INDEX.set(normalized, definition);
    }
  }
}

function titleCaseWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function getServiceCatalog() {
  return [...SERVICE_CATALOG];
}

export function getCriteriaCatalog() {
  return SERVICE_CATALOG.filter((definition) => definition.type === "criteria");
}

export function findServiceDefinition(value) {
  const normalized = normalizeServiceToken(value);
  if (!normalized) {
    return null;
  }

  if (SERVICE_INDEX.has(normalized)) {
    return SERVICE_INDEX.get(normalized);
  }

  for (const definition of SERVICE_CATALOG) {
    const tokens = [
      definition.shortLabel,
      definition.longLabel,
      ...(definition.aliases ?? []),
    ].map(normalizeServiceToken);
    if (tokens.some((token) => token && normalized.includes(token))) {
      return definition;
    }
  }

  return null;
}

export function normalizeServiceLabel(value) {
  const definition = findServiceDefinition(value);
  if (definition) {
    return definition.shortLabel;
  }

  return titleCaseWords(String(value || "").replace(/\s+/g, " ").trim());
}

export function describeService(value) {
  const definition = findServiceDefinition(value);
  const normalizedLabel = normalizeServiceLabel(value);
  return {
    code: definition?.code ?? null,
    type: definition?.type ?? "custom",
    shortLabel: normalizedLabel,
    longLabel: definition?.longLabel ?? normalizedLabel,
    isCatalog: Boolean(definition),
    isCustom: !definition,
  };
}

export function summarizeServiceLabels(values = [], maxVisible = 4) {
  const unique = Array.from(
    new Set(
      values
        .map((value) => normalizeServiceLabel(value))
        .filter(Boolean),
    ),
  );

  return {
    visible: unique.slice(0, maxVisible),
    overflowCount: Math.max(0, unique.length - maxVisible),
    all: unique,
  };
}

export function buildServiceSearchTerms(value) {
  const definition = findServiceDefinition(value);
  if (!definition) {
    const normalized = normalizeServiceToken(value);
    return normalized ? [normalized] : [];
  }

  return [
    definition.code,
    definition.shortLabel,
    definition.longLabel,
    ...(definition.aliases ?? []),
  ]
    .map(normalizeServiceToken)
    .filter(Boolean);
}
