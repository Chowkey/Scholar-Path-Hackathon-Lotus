import type { RoadmapData } from "@/lib/types";

type ScholarshipReference = {
  id: string;
  name: string;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function findScholarshipByName(name: string): ScholarshipReference | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const id = slugify(trimmed);
  if (!id) {
    return null;
  }

  return { id, name: trimmed };
}

export function parseRoadmap(content: string): RoadmapData | null {
  const match = content.match(/##ROADMAP##([\s\S]*?)##END##/);

  if (!match) {
    return null;
  }

  const lines = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const scholarshipsList: RoadmapData["scholarships"] = [];
  const nextSteps: string[] = [];

  for (const line of lines) {
    if (line.startsWith("- ")) {
      const parts = line.replace(/^- /, "").split("|").map((part) => part.trim());
      scholarshipsList.push({
        name: parts[0] ?? "",
        country: parts[1] ?? "Unknown",
        deadline: parts[2] ?? "Check official site",
      });
      continue;
    }

    if (/^\d+\./.test(line)) {
      nextSteps.push(line.replace(/^\d+\.\s*/, ""));
    }
  }

  return { scholarships: scholarshipsList, nextSteps };
}

export function stripRoadmap(content: string): string {
  return content.replace(/##ROADMAP##[\s\S]*?##END##/g, "").trim();
}
