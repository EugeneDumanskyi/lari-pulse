import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        glass:
          "border border-white/20 bg-white/12 text-white shadow-glass backdrop-blur-2xl hover:bg-white/18",
        ghost: "text-white/78 hover:bg-white/10 hover:text-white",
        warning:
          "border border-amber-200/25 bg-amber-100/16 text-amber-100 hover:bg-amber-100/22"
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3",
        icon: "h-11 w-11"
      }
    },
    defaultVariants: {
      variant: "glass",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
