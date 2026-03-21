import { NextRequest, NextResponse } from "next/server";
import Exa from "exa-js";
import { getOpenAIClient } from "@/lib/openai";

interface AcceptanceRateResponse {
  schoolName: string;
  acceptanceRate: number | null;
  source?: string;
}

/**
 * POST /api/acceptance-rate-exa
 * Server-side endpoint to fetch acceptance rates using Exa web search
 */
export async function POST(request: NextRequest) {
  try {
    const { schoolName } = (await request.json()) as { schoolName: string };

    if (!schoolName) {
      return NextResponse.json(
        { error: "schoolName is required" },
        { status: 400 }
      );
    }

    const exaApiKey = process.env.EXA_API_KEY;
    if (!exaApiKey) {
      console.error("EXA_API_KEY is not configured");
      return NextResponse.json(
        { error: "Configuration error", acceptanceRate: null },
        { status: 200 } // Return 200 with null rate instead of 500
      );
    }

    const exa = new (Exa as any)(exaApiKey);

    // Search for acceptance rate information
    const searchQuery = `"${schoolName}" acceptance rate 2024 2025`;
    console.log(`[Exa AcceptanceRate] Searching: ${searchQuery}`);

    const searchResults = await exa.searchAndContents(searchQuery, {
      type: "auto",
      numResults: 3,
      text: { maxCharacters: 2000 },
    });

    if (!searchResults.results || searchResults.results.length === 0) {
      console.warn(`[Exa AcceptanceRate] No results found for: ${schoolName}`);
      return NextResponse.json({
        schoolName,
        acceptanceRate: null,
        source: "No results",
      });
    }

    // Use OpenAI to extract acceptance rate from search results
    const openai = getOpenAIClient();
    const searchContext = searchResults.results
      .map((r: any) => `Title: ${r.title}\nContent: ${r.text}`)
      .join("\n\n---\n\n");

    const extractionPrompt = `You are an expert at extracting acceptance rate information from web content.

School: ${schoolName}

Web Search Results:
${searchContext}

Extract the acceptance rate as a percentage. Return ONLY a JSON object:
{
  "acceptanceRate": <number between 0 and 100, or null if not found>,
  "confidence": "high" | "medium" | "low",
  "source": "Niche" | "Common Data Set" | "Official" | "Other" | "Unknown"
}

Rules:
- acceptanceRate should be a number like 5.2 (for 5.2%), NOT a decimal
- If multiple rates are found, use the most recent one
- If uncertain, return null
- Confidence: high if official source, medium if reputable source, low if unclear
`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_EVALUATE_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: extractionPrompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    // Convert percentage to decimal
    const acceptanceRate =
      parsed.acceptanceRate !== null ? parsed.acceptanceRate / 100 : null;

    return NextResponse.json({
      schoolName,
      acceptanceRate,
      source: parsed.source,
    });
  } catch (error) {
    console.error("[Exa AcceptanceRate] Error:", error);
    return NextResponse.json(
      {
        schoolName: "Unknown",
        acceptanceRate: null,
        error: "Failed to fetch acceptance rate",
      },
      { status: 200 } // Return 200 with null rate instead of 500
    );
  }
}
