import { scholarships } from "@/lib/scholarships";
import type { RoadmapData } from "@/lib/types";

export function findScholarshipByName(name: string) {
  const normalized = name.toLowerCase();

  return scholarships.find((scholarship) => {
    const scholarshipName = scholarship.name.toLowerCase();

    return (
      scholarshipName === normalized ||
      scholarshipName.includes(normalized) ||
      normalized.includes(scholarshipName.replace(" scholarship", ""))
    );
  });
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
