"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Heart } from "lucide-react";

type Props = {
  count: number;
};

export function FavsHeader({ count }: Props) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => router.back()}
        className="flex w-fit items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/30 to-pink-600/30 border border-rose-500/20">
          <Heart size={24} className="fill-rose-400 text-rose-400" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-rose-400">Favourites</p>
          <h1 className="text-2xl font-bold text-white">Favs</h1>
          <p className="text-sm text-slate-400">{count} liked song{count !== 1 ? "s" : ""}</p>
        </div>
      </div>
    </div>
  );
}
