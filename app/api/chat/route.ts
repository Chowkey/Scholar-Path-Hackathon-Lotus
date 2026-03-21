import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";

const SYSTEM_PROMPT = `You are ScholarPath Counselor, a warm and knowledgeable scholarship advisor for students
in Southeast Asia looking to study abroad.

Your job:
1. Ask the student 3-5 focused questions to understand their profile:
   - Current education level and GPA
   - Target country or region to study
   - Preferred field of study
   - English proficiency (IELTS/TOEFL score if known)
   - Financial need (fully funded vs partial)

2. After gathering enough info, recommend 3-5 specific scholarships that fit their profile.
   Use web search to find current, accurate scholarship information.

3. End EVERY conversation that reaches a recommendation with this exact format:
   ##ROADMAP##
   Then list the scholarships as: - [Scholarship Name] | [Country] | [Deadline hint]
   Then list 3-5 concrete next steps the student should take.
   ##END##

Rules:
- Be warm and encouraging, never overwhelming
- Ask one question at a time
- If the student asks a general question first, answer it, then gently guide them back
  to their profile
- Always mention if a scholarship is fully funded
- Use web search when asked about specific deadlines or requirements`;

type ChatRequestBody = {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const openai = getOpenAIClient();
    const input = body.messages.map((message) => ({
      role: message.role,
      content: [{ type: "input_text" as const, text: message.content }],
    }));

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = await openai.responses.create({
            model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-mini",
            instructions: SYSTEM_PROMPT,
            input,
            max_output_tokens: 1200,
            tools: [{ type: "web_search_preview" }],
            stream: true,
          });

          for await (const event of stream) {
            if (event.type === "response.output_text.delta" && event.delta) {
              controller.enqueue(encoder.encode(event.delta));
            }
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start chat stream.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
