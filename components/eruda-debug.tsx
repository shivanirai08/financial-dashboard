"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    eruda?: {
      init: () => void;
      destroy?: () => void;
    };
  }
}

const ERUDA_SRC = "https://cdn.jsdelivr.net/npm/eruda";

export function ErudaDebug() {
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const enabled =
      search.get("eruda") === "1" || window.localStorage.getItem("pulsebox-eruda") === "1";

    if (!enabled) {
      return;
    }

    if (window.eruda) {
      window.eruda.init();
      return;
    }

    const script = document.createElement("script");
    script.src = ERUDA_SRC;
    script.async = true;
    script.onload = () => {
      window.eruda?.init();
    };
    document.body.appendChild(script);

    return () => {
      script.remove();
      window.eruda?.destroy?.();
    };
  }, []);

  return null;
}
