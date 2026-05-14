"use client";

import * as React from "react";
import { Dialog as RadixDialog } from "radix-ui";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Minimal Sheet primitive built on top of Radix Dialog with a right-side
 * slide-in panel. Mirrors the public API of shadcn's Sheet recipe
 * (Sheet / SheetTrigger / SheetContent / SheetHeader / SheetTitle /
 * SheetDescription / SheetClose) but only implements the subset the
 * settings drawer needs — no animation library, no other sides.
 */

function Sheet(
  props: React.ComponentProps<typeof RadixDialog.Root>,
) {
  return <RadixDialog.Root {...props} />;
}

function SheetTrigger(
  props: React.ComponentProps<typeof RadixDialog.Trigger>,
) {
  return <RadixDialog.Trigger {...props} />;
}

function SheetClose(
  props: React.ComponentProps<typeof RadixDialog.Close>,
) {
  return <RadixDialog.Close {...props} />;
}

function SheetPortal(
  props: React.ComponentProps<typeof RadixDialog.Portal>,
) {
  return <RadixDialog.Portal {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof RadixDialog.Overlay>) {
  return (
    <RadixDialog.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=closed]:opacity-0 data-[state=open]:opacity-100 transition-opacity",
        className,
      )}
      {...props}
    />
  );
}

interface SheetContentProps
  extends React.ComponentProps<typeof RadixDialog.Content> {
  /** Side of the screen the panel slides in from. Defaults to right. */
  side?: "right" | "left";
}

function SheetContent({
  side = "right",
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <RadixDialog.Content
        className={cn(
          "fixed top-0 z-50 flex h-full w-full max-w-md flex-col gap-0 border-neutral-200 bg-white p-0 shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-950",
          side === "right"
            ? "right-0 border-l data-[state=closed]:translate-x-full data-[state=open]:translate-x-0"
            : "left-0 border-r data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0",
          "transition-transform duration-200",
          className,
        )}
        {...props}
      >
        {children}
        <RadixDialog.Close
          className="absolute top-3 right-3 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          aria-label="Close settings"
        >
          <X className="size-4" />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </SheetPortal>
  );
}

function SheetHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800",
        className,
      )}
      {...props}
    />
  );
}

function SheetBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex-1 overflow-y-auto px-6 py-5", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof RadixDialog.Title>) {
  return (
    <RadixDialog.Title
      className={cn(
        "text-base font-semibold text-neutral-900 dark:text-neutral-100",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof RadixDialog.Description>) {
  return (
    <RadixDialog.Description
      className={cn(
        "text-xs text-neutral-500 dark:text-neutral-400",
        className,
      )}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
};
