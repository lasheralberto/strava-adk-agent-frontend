"use client";

import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { cn } from "@/lib/utils";
import { BouncingDots } from "@/components/ui/bouncing-dots";

const SEND_HOVER_SCALE = 1.1;
const SEND_TAP_SCALE = 0.88;
const SEND_SPRING = { type: "spring" as const, stiffness: 500, damping: 22 };

type RuixenPromptBoxProps = {
  onSend?: (payload: { message: string; transform: string | null }) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
};

export default function RuixenPromptBox({
  onSend,
  placeholder = "Escribe un mensaje...",
  disabled = false,
  loading = false,
}: RuixenPromptBoxProps) {
  const [input, setInput] = useState("");

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 52,
    maxHeight: 200,
  });

  const handleSend = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || disabled) return;

    onSend?.({ message: trimmedInput, transform: null });
    setInput("");
    adjustHeight(true);
  };

  return (
    <div className="w-full">
      <div className="mx-auto max-w-3xl">
        <div className="relative rounded-2xl border border-border bg-background shadow-sm">
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
              "min-h-[44px] sm:min-h-[52px] max-h-[160px] sm:max-h-[200px] w-full resize-none border-none bg-transparent py-2.5 sm:py-3 pl-3.5 sm:pl-4 pr-11 text-sm text-foreground",
              "placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0",
            )}
          />

          <div className="absolute bottom-2.5 right-3">
            <motion.button
              onClick={handleSend}
              whileHover={!disabled && input.trim() ? { scale: SEND_HOVER_SCALE } : undefined}
              whileTap={!disabled && input.trim() ? { scale: SEND_TAP_SCALE } : undefined}
              transition={SEND_SPRING}
              className={cn(
                "rounded-lg p-1.5 transition-colors duration-150",
                input.trim()
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "cursor-not-allowed text-muted-foreground/40",
              )}
              disabled={disabled || !input.trim()}
              type="button"
              aria-label="Enviar"
            >
              {loading ? (
                <BouncingDots dots={3} className="w-1.5 h-1.5 bg-background" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
