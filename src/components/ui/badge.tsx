import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-xl border px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-white/14 bg-white/10 text-white/82",
        green: "border-emerald-200/20 bg-emerald-300/14 text-emerald-200",
        amber: "border-amber-200/20 bg-amber-300/14 text-amber-200",
        red: "border-rose-200/20 bg-rose-300/14 text-rose-200",
        blue: "border-sky-200/20 bg-sky-300/14 text-sky-100"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />;
}
