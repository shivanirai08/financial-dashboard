"use client";

export function InstallPrompt() {
  const isBrowser = typeof window !== "undefined";
  const isStandalone =
    isBrowser && window.matchMedia("(display-mode: standalone)").matches;
  const isIOS = isBrowser && /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-slate-300">
      {isStandalone
        ? "Pulsebox is running in app mode."
        : isIOS
          ? 'On iPhone, use Share > "Add to Home Screen" to install Pulsebox.'
          : "Use your browser install option to add Pulsebox to the home screen."}
    </div>
  );
}
