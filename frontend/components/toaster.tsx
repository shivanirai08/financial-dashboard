"use client";

import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useToastStore } from "@/store/toast-store";

export function Toaster() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[70] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-md animate-in slide-in-from-right-4 fade-in duration-200 ${
            toast.type === "success"
              ? "border-emerald-500/30 bg-emerald-950/80 text-emerald-200"
              : toast.type === "error"
              ? "border-rose-500/30 bg-rose-950/80 text-rose-200"
              : "border-white/15 bg-slate-900/90 text-slate-200"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={15} className="shrink-0" />
          ) : toast.type === "error" ? (
            <AlertCircle size={15} className="shrink-0" />
          ) : (
            <Info size={15} className="shrink-0" />
          )}
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
