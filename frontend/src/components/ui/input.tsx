import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[var(--radius-control)] border border-border-subtle bg-control px-3 text-[13px] text-text-primary placeholder:text-text-tertiary shadow-none outline-none transition-[background-color,border-color,box-shadow,color] duration-150 file:border-0 file:bg-transparent file:text-[13px] file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 hover:border-border-strong hover:bg-control-hover focus-visible:border-[rgba(122,162,255,0.72)] focus-visible:ring-2 focus-visible:ring-focus-ring aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-[rgba(210,107,107,0.22)]",
        className
      )}
      {...props}
    />
  );
}

export { Input };
