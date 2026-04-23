import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
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

const EVALUATION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          scholarshipId: { type: "string" },
          scholarshipName: { type: "string" },
          trafficLight: { type: "string", enum: ["green", "yellow", "red"] },
          matchPercent: { type: "number" },
          strengths: {
            type: "array",
            items: { type: "string" },
          },
          gaps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                field: { type: "string" },
                current: { type: "string" },
                required: { type: "string" },
                advice: { type: "string" },
              },
              required: ["field", "current", "required", "advice"],
            },
          },
          verdict: { type: "string" },
        },
        required: [
          "scholarshipId",
          "scholarshipName",
          "trafficLight",
          "matchPercent",
          "strengths",
          "gaps",
          "verdict",
        ],
      },
    },
  },
  required: ["results"],
} as const;

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

    if (!body.scholarships || body.scholarships.length === 0) {
      return NextResponse.json({ error: "Select at least one scholarship to evaluate." }, { status: 400 });
    }

    const { profile } = body;
    const numericFields: { key: keyof ProfileFormData; max: number; label: string }[] = [
      { key: "gpa", max: profile.gpaScale, label: "GPA" },
      { key: "ielts", max: 9, label: "IELTS" },
      { key: "toefl", max: 120, label: "TOEFL" },
      { key: "sat", max: 1600, label: "SAT" },
    ];

    for (const field of numericFields) {
      const val = profile[field.key];
      if (typeof val === "number") {
        if (val < 0) {
          return NextResponse.json({ error: `${field.label} cannot be negative.` }, { status: 400 });
        }
        if (val > field.max) {
          return NextResponse.json({ error: `${field.label} cannot exceed ${field.max}.` }, { status: 400 });
        }
      }
    }

    const openai = getOpenAIClient();
    const normalizedProfile = {
      ...body.profile,
      normalizedGpaOn4Scale: normalizeGpa(body.profile.gpa, body.profile.gpaScale),
    };

    const response = await openai.responses.create({
      model: process.env.OPENAI_EVALUATE_MODEL ?? "gpt-5.4-mini",
      instructions: SYSTEM_PROMPT,
      input: JSON.stringify({
        profile: normalizedProfile,
        scholarships: body.scholarships,
      }),
      max_output_tokens: 1800,
      text: {
        format: {
          type: "json_schema",
          name: "scholarship_evaluation",
          schema: EVALUATION_RESPONSE_SCHEMA,
          strict: true,
        },
      },
    });

    const text = response.output_text ?? "";

    try {
      const parsed = JSON.parse(stripMarkdownFences(text)) as { results: EvaluationResult[] };

      return NextResponse.json(parsed);
    } catch (parseError) {
      console.error("[/api/evaluate] Failed to parse OpenAI response as JSON.", {
        rawText: text,
        parseError,
      });

      return NextResponse.json(
        {
          error:
            "OpenAI returned an invalid evaluation format. Try again, or lower the number of selected scholarships.",
        },
        { status: 502 },
      );
    }
  } catch (error) {
    const status = getErrorStatus(error);
    const rawMessage = getErrorMessage(error);
    const message =
      status === 429
        ? "OpenAI quota was exceeded for the evaluator request. Check your API billing/quota, wait for reset, or switch to a model/project with available quota."
        : rawMessage;

    console.error("[/api/evaluate] Request failed.", {
      status,
      message: rawMessage,
      error,
    });

    return NextResponse.json({ error: message }, { status });
  }
}
