"use client";

import Image from "next/image";
import iconSrc from "@/assets/brand/laripulse-icon.svg";
import { cn } from "@/lib/utils/cn";

export function LariPulseLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Image
        alt=""
        aria-hidden="true"
        className="h-10 w-10 shrink-0 rounded-[11px] shadow-[0_10px_28px_rgba(31,174,255,0.2)]"
        height={40}
        priority
        src={iconSrc}
        width={40}
      />
      <div className="min-w-0 text-[1.45rem] font-semibold leading-none tracking-normal" aria-label="LariPulse">
        <span className="text-slate-100">Lari</span>
        <span className="text-cyan-200">Pulse</span>
      </div>
    </div>
  );
}
