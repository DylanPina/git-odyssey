/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[calc(var(--radius-control)-2px)] border border-transparent bg-transparent text-[13px] font-medium text-text-secondary whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:border-[rgba(122,162,255,0.35)] data-[state=on]:bg-control-hover data-[state=on]:text-text-primary data-[state=on]:shadow-[inset_0_0_0_1px_rgba(122,162,255,0.35)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "hover:bg-control hover:text-text-primary",
        ghost: "hover:bg-control hover:text-text-primary",
        subtle:
          "border-border-subtle bg-control hover:border-border-strong hover:bg-control-hover hover:text-text-primary",
        outline:
          "border-border-subtle bg-control hover:border-border-strong hover:bg-control-hover hover:text-text-primary",
      },
      size: {
        default: "h-9 min-w-9 px-3",
        sm: "h-8 min-w-8 px-2.5",
        lg: "h-10 min-w-10 px-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
