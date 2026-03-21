const A_TO_Z = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const DEGREE_LEVEL_OPTIONS = [
  "Bachelor",
  "Master",
  "Doctorate",
  "Associate",
  "Diploma",
  "Certificate",
  "Foundation",
  "MBA",
  "Professional",
  "Postdoctoral",
  "Other",
] as const;

export type DegreeLevel = (typeof DEGREE_LEVEL_OPTIONS)[number];

function buildCountryOptions(): string[] {
  const display = new Intl.DisplayNames(["en"], { type: "region" });
  const set = new Set<string>();

  for (const first of A_TO_Z) {
    for (const second of A_TO_Z) {
      const code = `${first}${second}`;
      const label = display.of(code);
      if (!label || label === code || /unknown/i.test(label)) {
        continue;
      }
      set.add(label);
    }
  }

  // Kosovo is widely used but not always present in all CLDR lists.
  set.add("Kosovo");

  return [...set].sort((a, b) => a.localeCompare(b));
}

export const COUNTRY_OPTIONS = buildCountryOptions();

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  uk: "United Kingdom",
  uae: "United Arab Emirates",
  vietnam: "Vietnam",
  "viet nam": "Vietnam",
  "south korea": "Korea, South",
  "north korea": "Korea, North",
  russia: "Russia",
};

const DEGREE_ALIASES: Record<string, DegreeLevel> = {
  bachelor: "Bachelor",
  bachelors: "Bachelor",
  undergraduate: "Bachelor",
  master: "Master",
  masters: "Master",
  postgraduate: "Master",
  doctorate: "Doctorate",
  doctoral: "Doctorate",
  phd: "Doctorate",
  "ph.d": "Doctorate",
  associate: "Associate",
  diploma: "Diploma",
  certificate: "Certificate",
  foundation: "Foundation",
  mba: "MBA",
  professional: "Professional",
  postdoc: "Postdoctoral",
  postdoctoral: "Postdoctoral",
};

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeCountry(value: unknown): string {
  if (typeof value !== "string") {
    return "Unknown";
  }

  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "Unknown";
  }

  const lower = normalized.toLowerCase();
  const alias = COUNTRY_ALIASES[lower];
  if (alias) {
    return alias;
  }

  const exact = COUNTRY_OPTIONS.find((country) => country.toLowerCase() === lower);
  if (exact) {
    return exact;
  }

  return normalized;
}

export function normalizeDegreeLevel(value: unknown): DegreeLevel {
  if (typeof value !== "string") {
    return "Other";
  }

  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return "Other";
  }

  const alias = DEGREE_ALIASES[normalized];
  if (alias) {
    return alias;
  }

  const exact = DEGREE_LEVEL_OPTIONS.find(
    (option) => option.toLowerCase() === normalized
  );
  return exact ?? "Other";
}
