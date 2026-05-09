"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { RoadmapCard } from "@/components/chat/RoadmapCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { parseRoadmap, stripRoadmap } from "@/lib/chat";
import type { Message } from "@/lib/types";

const quickStarts = [
  "I want to study abroad but I don't know where to start",
  "What certificates and documents do I usually need?",
  "Find me fully-funded options for a master's degree",
];

type ChatWindowProps = {
  initialMessages?: Message[];
  initialSessionId?: string | null;
};

export function ChatWindow({ initialMessages = [], initialSessionId = null }: ChatWindowProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );
  const roadmap = lastAssistantMessage ? parseRoadmap(lastAssistantMessage.content) : null;

  async function sendMessage(content: string) {
    setError(null);
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, sessionId }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = "/login?next=/counselor";
          return;
        }
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        throw new Error(payload?.error ?? "The counselor could not respond right now.");
      }

      if (!response.body) {
        throw new Error("The counselor response stream was empty.");
      }

      const returnedSessionId = response.headers.get("X-Session-Id");
      const isFirstSession = !sessionId && returnedSessionId;
      if (returnedSessionId && returnedSessionId !== sessionId) {
        setSessionId(returnedSessionId);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        assistantText += decoder.decode(value, { stream: true });
        setMessages([...nextMessages, { role: "assistant", content: assistantText }]);
      }
      if (isFirstSession && returnedSessionId) {
        router.replace(`/counselor/${returnedSessionId}`);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Something went wrong while sending your message.";
      setError(message);
      setMessages(nextMessages);
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex h-full flex-col px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <header>
          <h1 className="font-heading text-3xl font-bold text-neutral-900">
            Your Study Abroad Counselor
          </h1>
          <p className="mt-2 text-base leading-7 text-neutral-600">
            Figure out requirements, clear up confusion, and narrow down scholarships step by step.
          </p>
        </header>

        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-card">
              <div className="mx-auto mb-5 w-fit rounded-2xl bg-brand-50 p-4 text-brand-600">
                <MessageCircle className="h-8 w-8" />
              </div>
              <h2 className="font-heading text-3xl font-bold text-neutral-900">
                Hi! Let&apos;s figure out your study abroad plan.
              </h2>
              <p className="mt-3 text-base leading-7 text-neutral-600">
                I&apos;ll help you sort out requirements, documents, and scholarship options one step at a time.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {quickStarts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8 flex-1 overflow-y-auto pb-32">
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {messages.map((message, index) => {
                const shouldShowRoadmap =
                  roadmap && index === messages.length - 1 && message.role === "assistant";

                return (
                  <div key={`${message.role}-${index}`} className="space-y-4">
                    <MessageBubble
                      role={message.role}
                      content={message.role === "assistant" ? stripRoadmap(message.content) : message.content}
                      isStreaming={message.role === "assistant" && isStreaming && index === messages.length - 1}
                    />
                    {shouldShowRoadmap ? <RoadmapCard roadmap={roadmap} /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error ? (
          <div className="mx-auto mt-4 w-full max-w-2xl">
            <EmptyState
              icon={MessageCircle}
              title="The counselor hit a snag"
              subtitle={error}
            />
          </div>
        ) : null}

        <div className="sticky bottom-0 mt-6 bg-neutral-50 pb-2 pt-4">
          <div className="mx-auto max-w-2xl">
            <ChatInput onSend={(message) => void sendMessage(message)} isLoading={isStreaming} />
          </div>
        </div>
      </div>
    </div>
  );
}
