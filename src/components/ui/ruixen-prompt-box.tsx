"use client";

import { useState } from "react";
import { Sparkles, BadgeCheck, SendHorizontal } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { cn } from "@/lib/utils";
import { BouncingDots } from "@/components/ui/bouncing-dots";

const TRANSFORM_OPTIONS = [
  {
    label: "Summarize",
    icon: Sparkles,
    color: "text-yellow-500",
    bg: "bg-yellow-100",
  },
  {
    label: "Correct Grammar",
    icon: BadgeCheck,
    color: "text-green-600",
    bg: "bg-green-100",
  },
  {
    label: "Compress",
    icon: SendHorizontal,
    color: "text-indigo-500",
    bg: "bg-indigo-100",
  },
] as const;

type RuixenPromptBoxProps = {
  onSend?: (payload: { message: string; transform: string | null }) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
};

export default function RuixenPromptBox({
  onSend,
  placeholder = "Refine your message...",
  disabled = false,
  loading = false,
}: RuixenPromptBoxProps) {
  const [input, setInput] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 60,
    maxHeight: 200,
  });

  const currentOption = TRANSFORM_OPTIONS.find((option) => option.label === selectedOption);

  const handleSend = () => {
    const trimmedInput = input.trim();
    if ((!trimmedInput && !selectedOption) || disabled) {
      return;
    }

    if (onSend) {
      onSend({
        message: trimmedInput,
        transform: selectedOption,
      });
    } else {
      console.log("Submitting:", trimmedInput, selectedOption);
    }

    setInput("");
    setSelectedOption(null);
    adjustHeight(true);
  };

  return (
    <div className="w-full px-2 py-2 sm:px-4 sm:py-4">
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="relative rounded-[24px] border border-border bg-muted/10 p-4 shadow-sm backdrop-blur-sm dark:bg-white/5">
          {currentOption && (
            <div
              className={cn(
                "absolute left-4 top-0 -translate-y-1/2 rounded-md px-2 py-0.5 text-xs font-medium shadow-sm",
                currentOption.bg,
                currentOption.color,
              )}
            >
              <currentOption.icon className="mr-1 inline-block h-3.5 w-3.5" />
              {currentOption.label}
            </div>
          )}

          <Textarea
            ref={textareaRef}
            placeholder={placeholder}
            value={input}
            disabled={disabled}
            onChange={(event) => {
              setInput(event.target.value);
              adjustHeight();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            className={cn(
              "min-h-[60px] max-h-[200px] w-full resize-none border-none bg-transparent pr-12 text-sm text-foreground",
              "placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0 sm:text-base",
            )}
          />

          <div className="absolute bottom-3 right-4">
            <button
              onClick={handleSend}
              className={cn(
                "rounded-full p-2 transition-all duration-200",
                input || selectedOption
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
              disabled={disabled || (!input && !selectedOption)}
              type="button"
            >
              {loading ? (
                <BouncingDots dots={3} className="w-1.5 h-1.5 bg-primary-foreground" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap justify-start gap-2">
          {TRANSFORM_OPTIONS.map(({ label, icon: Icon, color }) => {
            const isSelected = label === selectedOption;

            return (
              <button
                key={label}
                type="button"
                onClick={() => setSelectedOption(isSelected ? null : label)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-transparent text-muted-foreground hover:bg-muted/10",
                )}
              >
                <Icon className={cn("h-4 w-4", color)} />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}