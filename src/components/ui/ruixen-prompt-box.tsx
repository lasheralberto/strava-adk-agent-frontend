"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { cn } from "@/lib/utils";
import { BouncingDots } from "@/components/ui/bouncing-dots";

const SEND_HOVER_SCALE = 1.08;
const SEND_TAP_SCALE = 0.88;
const SEND_SPRING = { type: "spring" as const, stiffness: 500, damping: 22 };

type RuixenPromptBoxProps = {
  onSend?: (payload: { message: string; transform: string | null; model: string }) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  modelOptions?: string[];
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  modelLeftSlot?: React.ReactNode;
};

function ChevronDown() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="shrink-0">
      <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RuixenPromptBox({
  onSend,
  placeholder = "Escribe un mensaje...",
  disabled = false,
  loading = false,
  modelOptions = [],
  selectedModel = "",
  onModelChange,
  modelLeftSlot,
}: RuixenPromptBoxProps) {
  const [input, setInput] = useState("");

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 40,
    maxHeight: 200,
  });

  const hasInput = Boolean(input.trim());

  const handleSend = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || disabled) return;
    onSend?.({ message: trimmedInput, transform: null, model: selectedModel });
    setInput("");
    adjustHeight(true);
  };

  return (
    <div className="w-full">
      <div className="mx-auto max-w-3xl">
        {/* Composer box — dark blur */}
        <div
          className={cn(
            "rounded-[14px] border border-white/10 px-2.5 py-2 sm:p-3 transition-colors duration-100",
            "bg-[rgba(14,23,48,0.70)] backdrop-blur-xl",
            "dark:bg-[rgba(14,23,48,0.70)]",
            "light:bg-background light:border-border",
          )}
          style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.24)" }}
        >
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
              "min-h-[40px] max-h-[160px] sm:max-h-[200px] w-full resize-none border-none bg-transparent",
              "py-1 px-1 text-[14px] leading-relaxed text-foreground",
              "placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-0",
            )}
          />

          {/* Bottom row: left pills + send */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Plan badge slot */}
              {modelLeftSlot}

              {/* Model selector pill */}
              {modelOptions.length > 0 && (
                <div className="relative inline-flex items-center">
                  <select
                    value={selectedModel}
                    onChange={(e) => onModelChange?.(e.target.value)}
                    disabled={disabled}
                    className={cn(
                      "h-[26px] appearance-none rounded-full border border-white/10 bg-white/[0.04]",
                      "pl-2.5 pr-6 text-[11px] text-muted-foreground",
                      "focus:outline-none disabled:cursor-not-allowed",
                    )}
                    style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: "0.02em" }}
                  >
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown />
                </div>
              )}
            </div>

            {/* Send button */}
            <motion.button
              onClick={handleSend}
              whileHover={!disabled && hasInput ? { scale: SEND_HOVER_SCALE } : undefined}
              whileTap={!disabled && hasInput ? { scale: SEND_TAP_SCALE } : undefined}
              transition={SEND_SPRING}
              className={cn(
                "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] transition-all duration-120",
                hasInput
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/[0.06] text-muted-foreground/40 cursor-not-allowed",
              )}
              style={
                hasInput
                  ? { animation: "ath-pulse-orange 1.6s ease-in-out infinite" }
                  : undefined
              }
              disabled={disabled || !hasInput}
              type="button"
              aria-label="Enviar"
            >
              {loading ? (
                <BouncingDots dots={3} className="w-1.5 h-1.5 bg-current" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M7 11 V3 M3.5 6.5 L7 3 L10.5 6.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </motion.button>
          </div>
        </div>

        {/* Disclaimer */}
        <p
          className="mt-2 text-center text-[10px] tracking-[0.08em] text-muted-foreground/40"
          style={{ fontFamily: "'Geist Mono', ui-monospace, monospace" }}
        >
          ATHLY PUEDE EQUIVOCARSE · CONTRASTA SIEMPRE CON TU CUERPO
        </p>
      </div>
    </div>
  );
}
