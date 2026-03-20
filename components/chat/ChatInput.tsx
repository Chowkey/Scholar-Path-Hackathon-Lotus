"use client";

import { useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/Button";

type ChatInputProps = {
  onSend: (message: string) => void;
  isLoading: boolean;
};

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  };

  const handleSubmit = () => {
    const trimmed = value.trim();

    if (!trimmed || isLoading) {
      return;
    }

    onSend(trimmed);
    setValue("");

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    });
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-card">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={isLoading}
          onChange={(event) => {
            setValue(event.target.value);
            resize();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Ask anything about scholarships..."
          className="max-h-[140px] min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm text-neutral-800 outline-none"
        />
        <Button onClick={handleSubmit} isLoading={isLoading} className="shrink-0">
          <SendHorizonal className="h-4 w-4" />
          <span>Send</span>
        </Button>
      </div>
    </div>
  );
}
