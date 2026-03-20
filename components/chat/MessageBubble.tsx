import { ScholarshipChip } from "@/components/chat/ScholarshipChip";
import { cn } from "@/lib/utils";

type MessageBubbleProps = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const value = part.slice(2, -2);
      return <ScholarshipChip key={`${value}-${index}`} name={value} />;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function renderAssistantContent(content: string) {
  const lines = content.split("\n").filter((line) => !line.startsWith("##ROADMAP##") && !line.startsWith("##END##"));
  const output: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    output.push(
      <ul key={`list-${output.length}`} className="space-y-2 pl-5 text-sm leading-6 text-neutral-700">
        {listItems.map((item) => (
          <li key={item} className="list-disc marker:text-brand-500">
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
      return;
    }

    flushList();
    output.push(
      <p key={`${trimmed}-${index}`} className="text-sm leading-7 text-neutral-700">
        {renderInline(trimmed)}
      </p>,
    );
  });

  flushList();

  return output;
}

export function MessageBubble({ role, content, isStreaming = false }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 shadow-card",
          isUser
            ? "rounded-br-sm bg-brand-500 text-white"
            : "rounded-bl-sm border border-neutral-200 bg-white",
        )}
      >
        {isStreaming && content.length === 0 ? (
          <div className="flex items-center gap-1 text-neutral-400">
            <span className="h-2 w-2 animate-pulseDots rounded-full bg-neutral-300" />
            <span className="h-2 w-2 animate-pulseDots rounded-full bg-neutral-300 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-pulseDots rounded-full bg-neutral-300 [animation-delay:300ms]" />
          </div>
        ) : isUser ? (
          <p className="text-sm leading-7 text-white">{content}</p>
        ) : (
          <div className="space-y-3">{renderAssistantContent(content)}</div>
        )}
      </div>
    </div>
  );
}
