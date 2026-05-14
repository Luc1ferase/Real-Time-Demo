"use client";

import * as React from "react";
import { RadioGroup as RadixRadioGroup } from "radix-ui";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadixRadioGroup.Root>) {
  return (
    <RadixRadioGroup.Root
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadixRadioGroup.Item>) {
  return (
    <RadixRadioGroup.Item
      className={cn(
        "aspect-square size-4 rounded-full border border-neutral-300 text-emerald-500 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700",
        className,
      )}
      {...props}
    >
      <RadixRadioGroup.Indicator className="flex items-center justify-center">
        <Circle className="size-2 fill-current text-current" />
      </RadixRadioGroup.Indicator>
    </RadixRadioGroup.Item>
  );
}

export { RadioGroup, RadioGroupItem };
