"use client";

import { useEffect, useState } from "react";
import { usePlayerStore } from "@/store/player-store";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallPrompt() {
  const isBrowser = typeof window !== "undefined";
  const isStandalone =
    isBrowser && window.matchMedia("(display-mode: standalone)").matches;
  const isIOS = isBrowser && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isBrowser) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, [isBrowser]);

  const canShowPrompt = !isStandalone && !isIOS && !isPlaying && !!deferredPrompt && !dismissed;

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    setDeferredPrompt(null);
  }

  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-slate-300">
      {isStandalone
        ? "Pulsebox is running in app mode."
        : isIOS
          ? 'On iPhone, use Share > "Add to Home Screen" to install Pulsebox.'
          : canShowPrompt
            ? "Install Pulsebox for faster launch and media controls."
            : isPlaying
              ? "Install prompt is paused while audio is playing to avoid playback interruption."
              : "Use your browser install option to add Pulsebox to the home screen."}

      {canShowPrompt && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleInstall}
            className="rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
          >
            Install
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-lg border border-white/20 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10"
          >
            Later
          </button>
        </div>
      )}
    </div>
  );
}
