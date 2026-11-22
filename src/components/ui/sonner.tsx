"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { useLocale } from "next-intl"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const NARROW = "(max-width: 767px)"

/** Phones only: a bottom toast sits on top of bottom-sheet buttons ("add expense", import save). */
function useIsNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW)
      mq.addEventListener("change", onChange)
      return () => mq.removeEventListener("change", onChange)
    },
    () => window.matchMedia(NARROW).matches,
    () => false
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const he = useLocale() === "he"
  const narrow = useIsNarrow()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      // Messages sit at the reading end's far corner: bottom-left in Hebrew (RTL), bottom-right in English.
      // On phones they move to the top, where they cannot cover a sheet's primary button.
      position={narrow ? (he ? "top-left" : "top-right") : (he ? "bottom-left" : "bottom-right")}
      dir={he ? "rtl" : "ltr"}
      containerAriaLabel={he ? "התראות" : "Notifications"}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          // Sonner's default width is 356px, wider than a 320px phone: the toast then sits off-screen.
          "--width": "min(356px, calc(100vw - 1.5rem))",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "calc(var(--radius) * 1.4)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast glass-popover shadow-lg shadow-black/10",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
