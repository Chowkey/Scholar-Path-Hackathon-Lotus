export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function normalizeGpa(gpa: number, scale: 4 | 10 | 100): number {
  if (scale === 4) {
    return gpa;
  }

  if (scale === 10) {
    return Number(((gpa / 10) * 4).toFixed(2));
  }

  return Number(((gpa / 100) * 4).toFixed(2));
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
