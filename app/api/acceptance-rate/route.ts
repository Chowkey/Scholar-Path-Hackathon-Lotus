import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const interfaze = new OpenAI({
  apiKey: process.env.INTERFAZE_API_KEY,
  baseURL: "https://api.interfaze.ai/v1",
});

interface AcceptanceRateResponse {
  schoolName: string;
  acceptanceRate: number | null;
}

/**
 * GET /api/acceptance-rate?school=harvard-university
 * Scrapes acceptance rate from Niche.com using Interfaze API
 */
export async function GET(request: NextRequest) {
  try {
    const schoolParam = request.nextUrl.searchParams.get("school");

    if (!schoolParam) {
      return NextResponse.json(
        { error: "School parameter is required" },
        { status: 400 }
      );
    }

    // Validate Interfaze API key
    if (!process.env.INTERFAZE_API_KEY) {
      console.error("INTERFAZE_API_KEY is not set");
      return NextResponse.json(
        { error: "Configuration error" },
        { status: 500 }
      );
    }

    const nicheUrl = `https://www.niche.com/colleges/${schoolParam}/`;

    // Use Interfaze to scrape the acceptance rate from Niche.com
    const response = await interfaze.chat.completions.create({
      model: "gpt-4-vision",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Please visit this URL: ${nicheUrl}

Extract the acceptance rate from the admissions section of this college/university page. 
The acceptance rate is typically shown as a percentage (e.g., "4%", "15%", etc.).

Return ONLY a JSON object with:
{
  "schoolName": "Full official name of the school",
  "acceptanceRatePercentage": "The percentage as a string with % symbol (e.g., '4%')" or "null" if not found
}

If the school page does not exist or the acceptance rate cannot be found, return:
{
  "schoolName": null,
  "acceptanceRatePercentage": null
}`,
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 500,
    });

    // Parse the response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Failed to scrape acceptance rate" },
        { status: 500 }
      );
    }

    // Extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse acceptance rate data" },
        { status: 500 }
      );
    }

    let scraperResult;
    try {
      scraperResult = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Failed to parse JSON response:", content);
      return NextResponse.json(
        { error: "Failed to parse acceptance rate data" },
        { status: 500 }
      );
    }

    // Validate that we got a school name
    if (!scraperResult.schoolName) {
      return NextResponse.json(
        { error: "School not found" },
        { status: 404 }
      );
    }

    // Convert percentage string to decimal
    let acceptanceRate: number | null = null;
    if (scraperResult.acceptanceRatePercentage) {
      const percentageStr = scraperResult.acceptanceRatePercentage.toString();
      const percentageMatch = percentageStr.match(/[\d.]+/);
      if (percentageMatch) {
        const percentage = parseFloat(percentageMatch[0]);
        acceptanceRate = percentage / 100; // Convert to decimal (e.g., 4% → 0.04)
      }
    }

    const result: AcceptanceRateResponse = {
      schoolName: scraperResult.schoolName,
      acceptanceRate: acceptanceRate,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Acceptance rate API error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve acceptance rate" },
      { status: 500 }
    );
  }
}
