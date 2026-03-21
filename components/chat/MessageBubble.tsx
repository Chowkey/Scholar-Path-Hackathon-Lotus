import { cn } from "@/lib/utils";

type MessageBubbleProps = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

function renderInline(text: string) {
  const pattern = /(\[[^\]]+\]\((https?:\/\/[^\s)]+)\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(pattern).filter(Boolean);

  return parts.map((part, index) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={`${part}-${index}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand-600 underline decoration-brand-300 underline-offset-4 transition hover:text-brand-700"
        >
          {linkMatch[1]}
        </a>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-neutral-900">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function renderAssistantContent(content: string) {
  const lines = content.split("\n").filter((line) => !line.startsWith("##ROADMAP##") && !line.startsWith("##END##"));
  const output: JSX.Element[] = [];
  let listItems: string[] = [];
  let orderedListItems: Array<{ text: string; bullets: string[] }> = [];

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

  const flushOrderedList = () => {
    if (orderedListItems.length === 0) {
      return;
    }

    output.push(
      <ol key={`ordered-list-${output.length}`} className="space-y-3 pl-5 text-sm leading-6 text-neutral-700">
        {orderedListItems.map((item) => (
          <li key={item.text} className="list-decimal marker:font-semibold marker:text-brand-500">
            <div>{renderInline(item.text)}</div>
            {item.bullets.length > 0 ? (
              <ul className="mt-2 space-y-2 pl-5">
                {item.bullets.map((bullet) => (
                  <li key={bullet} className="list-disc marker:text-brand-500">
                    {renderInline(bullet)}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>,
    );
    orderedListItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      flushOrderedList();
      return;
    }

    if (trimmed.startsWith("- ")) {
      if (orderedListItems.length > 0) {
        orderedListItems[orderedListItems.length - 1]!.bullets.push(trimmed.slice(2));
      } else {
        listItems.push(trimmed.slice(2));
      }
      return;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      flushList();
      orderedListItems.push({ text: trimmed.replace(/^\d+\.\s/, ""), bullets: [] });
      return;
    }

    if (/^#{1,3}\s/.test(trimmed)) {
      flushList();
      flushOrderedList();
      const level = trimmed.match(/^#+/)?.[0].length ?? 1;
      const heading = trimmed.replace(/^#{1,3}\s/, "");
      const className =
        level === 1
          ? "text-lg font-semibold leading-7 text-neutral-900"
          : level === 2
            ? "text-base font-semibold leading-7 text-neutral-900"
            : "text-sm font-semibold uppercase tracking-wide text-neutral-500";

      output.push(
        <p key={`${trimmed}-${index}`} className={className}>
          {renderInline(heading)}
        </p>,
      );
      return;
    }

    if (trimmed.startsWith("> ")) {
      flushList();
      flushOrderedList();
      output.push(
        <blockquote
          key={`${trimmed}-${index}`}
          className="border-l-4 border-brand-200 bg-brand-50/60 px-4 py-3 text-sm leading-7 text-neutral-700"
        >
          {renderInline(trimmed.slice(2))}
        </blockquote>,
      );
      return;
    }

    flushList();
    flushOrderedList();
    output.push(
      <p key={`${trimmed}-${index}`} className="text-sm leading-7 text-neutral-700">
        {renderInline(trimmed)}
      </p>,
    );
  });

  flushList();
  flushOrderedList();

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
