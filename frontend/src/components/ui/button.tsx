/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border border-transparent text-[13px] font-medium leading-none text-text-primary transition-[background-color,border-color,color,box-shadow] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-accent bg-accent text-[#08111f] hover:border-[#8bafff] hover:bg-[#8bafff]",
        accent:
          "border-accent bg-accent text-[#08111f] hover:border-[#8bafff] hover:bg-[#8bafff]",
        subtle:
          "border-border-subtle bg-control text-text-primary hover:border-border-strong hover:bg-control-hover",
        secondary:
          "border-border-subtle bg-control text-text-primary hover:border-border-strong hover:bg-control-hover",
        outline:
          "border-border-subtle bg-control text-text-primary hover:border-border-strong hover:bg-control-hover",
        ghost:
          "bg-transparent text-text-secondary hover:border-border-subtle hover:bg-control hover:text-text-primary",
        toolbar:
          "border-border-subtle bg-transparent text-text-secondary hover:border-border-strong hover:bg-control hover:text-text-primary",
        destructive:
          "border-[rgba(210,107,107,0.32)] bg-[rgba(210,107,107,0.12)] text-[rgba(255,223,223,0.96)] hover:border-[rgba(210,107,107,0.48)] hover:bg-[rgba(210,107,107,0.2)]",
        danger:
          "border-[rgba(210,107,107,0.32)] bg-[rgba(210,107,107,0.12)] text-[rgba(255,223,223,0.96)] hover:border-[rgba(210,107,107,0.48)] hover:bg-[rgba(210,107,107,0.2)]",
        link:
          "border-transparent bg-transparent px-0 text-accent underline-offset-4 hover:text-[#9bb9ff] hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3",
        lg: "h-11 px-5",
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
        toolbar: "h-9 px-3.5",
        "toolbar-icon": "size-9",
      },
    },
    defaultVariants: {
      variant: "subtle",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
