import { NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/gemini";
import { normalizeGpa } from "@/lib/utils";
import type { EvaluationResult, ProfileFormData, Scholarship } from "@/lib/types";

const SYSTEM_PROMPT = `You are a scholarship eligibility evaluator. You receive a student profile and a list
of scholarships. For each scholarship, evaluate the student's fit.

Return ONLY valid JSON with this exact structure:
{
  "results": [
    {
      "scholarshipId": "string",
      "scholarshipName": "string",
      "trafficLight": "green" | "yellow" | "red",
      "matchPercent": number (0-100),
      "strengths": ["string", ...],
      "gaps": [
        {
          "field": "string",
          "current": "string",
          "required": "string",
          "advice": "string"
        }
      ],
      "verdict": "string"
    }
  ]
}

Rules:
- trafficLight green = strong fit (match > 75%)
- trafficLight yellow = possible with improvement (50-75%)
- trafficLight red = significant gaps (< 50%)
- Be specific and honest, but encouraging in advice
- If a criterion is not specified by the student (e.g. no TOEFL given), do not penalize
- Base requirements on the scholarship data provided, not general knowledge`;

type EvaluateRequestBody = {
  profile: ProfileFormData;
  scholarships: Scholarship[];
};

function getErrorStatus(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return 500;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to evaluate scholarships.";
}

function stripMarkdownFences(value: string): string {
  return value.replace(/^```json\s*|^```\s*|\s*```$/gim, "").trim();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EvaluateRequestBody;

    if (body.scholarships.length === 0) {
      return NextResponse.json({ error: "Select at least one scholarship to evaluate." }, { status: 400 });
    }

    const gemini = getGeminiClient();
    const normalizedProfile = {
      ...body.profile,
      normalizedGpaOn4Scale: normalizeGpa(body.profile.gpa, body.profile.gpaScale),
    };

    const response = await gemini.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: JSON.stringify({
        profile: normalizedProfile,
        scholarships: body.scholarships,
      }),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 1800,
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";

    try {
      const parsed = JSON.parse(stripMarkdownFences(text)) as { results: EvaluationResult[] };

      return NextResponse.json(parsed);
    } catch (parseError) {
      console.error("[/api/evaluate] Failed to parse Gemini response as JSON.", {
        rawText: text,
        parseError,
      });

      return NextResponse.json(
        {
          error:
            "Gemini returned an invalid evaluation format. Try again, or lower the number of selected scholarships.",
        },
        { status: 502 },
      );
    }
  } catch (error) {
    const status = getErrorStatus(error);
    const rawMessage = getErrorMessage(error);
    const message =
      status === 429
        ? "Gemini quota was exceeded for the evaluator request. Check your API billing/quota, wait for reset, or switch to a model/project with available quota."
        : rawMessage;

    console.error("[/api/evaluate] Request failed.", {
      status,
      message: rawMessage,
      error,
    });

    return NextResponse.json({ error: message }, { status });
  }
}
