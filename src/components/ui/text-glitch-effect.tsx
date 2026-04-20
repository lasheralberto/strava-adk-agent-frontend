import { useEffect, useRef, useState } from "react"

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

interface TextEffectProps {
  text: string
  hoverText?: string
  href?: string
  className?: string
  delay?: number
}

export function TextGlitch({ text, hoverText, href, className = "", delay = 0 }: TextEffectProps) {
  const textRef = useRef<HTMLHeadingElement>(null)
  const spanRef = useRef<HTMLSpanElement>(null)
  const [displayText] = useState(text)
  const [displayHoverText, setDisplayHoverText] = useState(hoverText || text)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hoverIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const loadGSAP = async () => {
      const { gsap } = await import("gsap")

      if (textRef.current) {
        gsap.set(textRef.current, {
          backgroundSize: "0%",
          scale: 0.95,
          opacity: 0.7,
        })

        const tl = gsap.timeline({ delay })

        tl.to(textRef.current, {
          opacity: 1,
          scale: 1,
          duration: 0.6,
          ease: "back.out(1.7)",
        }).to(
          textRef.current,
          {
            backgroundSize: "100%",
            duration: 2,
            ease: "elastic.out(1, 0.5)",
          },
          "-=0.3",
        )
      }
    }

    loadGSAP()
  }, [delay])

  useEffect(() => {
    const target = hoverText || text
    const timeoutId = setTimeout(() => {
      if (spanRef.current) {
        spanRef.current.style.clipPath = "polygon(0 0, 100% 0, 100% 100%, 0 100%)"
      }

      let iteration = 0
      hoverIntervalRef.current = setInterval(() => {
        setDisplayHoverText(
          target
            .split("")
            .map((_letter, index) => {
              if (index < iteration) return target[index]
              return LETTERS[Math.floor(Math.random() * 26)]
            })
            .join(""),
        )

        if (iteration >= target.length) {
          clearInterval(hoverIntervalRef.current!)
        }

        iteration += 1 / 3
      }, 30)
    }, delay * 1000)

    return () => {
      clearTimeout(timeoutId)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (hoverIntervalRef.current) clearInterval(hoverIntervalRef.current)
    }
  }, [delay, text, hoverText])

  const spanContent = hoverText ? (
    href ? (
      <a href={href} target="_blank" rel="noreferrer" className="no-underline text-inherit">
        {displayHoverText}
      </a>
    ) : (
      displayHoverText
    )
  ) : (
    text
  )

  return (
    <h1
      ref={textRef}
      className={`
        font-bold leading-none tracking-tight m-0
        text-red-500/20
        bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text bg-no-repeat
        border-b border-red-500/20
        flex flex-col items-start justify-center relative
        transition-all duration-500 ease-out
        cursor-pointer
        overflow-hidden
        ${className}
      `}
      style={{
        backgroundSize: "0%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        width: "100%",
        maxWidth: "100vw",
        wordBreak: "break-word",
        whiteSpace: "nowrap",
      }}
    >
      {displayText}
      <span
        ref={spanRef}
        className="
          absolute w-full h-full
          text-white font-bold
          flex flex-col justify-center
          transition-all duration-400 ease-out
          pointer-events-none
          overflow-hidden
        "
        style={{
          clipPath: "polygon(0 50%, 100% 50%, 100% 50%, 0 50%)",
          transformOrigin: "center",
          backgroundColor: "transparent",
          maxWidth: "100%",
          whiteSpace: "nowrap",
        }}
      >
        {spanContent}
      </span>
    </h1>
  )
}
