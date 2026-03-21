import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type MessageBubbleProps = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

function getMarkdownLink(text: string) {
  const match = text.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
  if (!match) {
    return null;
  }

  return { label: match[1], href: match[2] };
}

function renderInline(text: string) {
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  const output: JSX.Element[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const [fullMatch, linkLabel, linkHref, boldText, codeText] = match;

    if (match.index > lastIndex) {
      output.push(
        <span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>,
      );
    }

    if (linkLabel && linkHref) {
      output.push(
        <a
          key={`link-${match.index}`}
          href={linkHref}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand-600 underline decoration-brand-300 underline-offset-4 transition hover:text-brand-700"
        >
          {linkLabel}
        </a>,
      );
    } else if (boldText) {
      output.push(
        <strong key={`bold-${match.index}`} className="font-semibold text-neutral-900">
          {boldText}
        </strong>,
      );
    } else if (codeText) {
      output.push(
        <code
          key={`code-${match.index}`}
          className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-800"
        >
          {codeText}
        </code>,
      );
    } else {
      output.push(<span key={`raw-${match.index}`}>{fullMatch}</span>);
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    output.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return output.length > 0 ? output : [<span key="plain">{text}</span>];
}

function renderListItem(item: string) {
  const link = getMarkdownLink(item.trim());

  if (!link) {
    return renderInline(item);
  }

  return (
    <a
      href={link.href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-3 no-underline transition hover:border-brand-300 hover:bg-brand-50"
    >
      <div className="min-w-0">
        <p className="font-medium leading-6 text-brand-700">{link.label}</p>
        <p className="mt-1 break-all text-xs leading-5 text-neutral-500">{link.href}</p>
      </div>
      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-brand-500 transition group-hover:text-brand-700" />
    </a>
  );
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
            {renderListItem(item)}
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
                    {renderListItem(bullet)}
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
