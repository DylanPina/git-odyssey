"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  label?: string;
  value?: Date | undefined;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  id?: string;
}

export function DatePicker({
  label,
  value,
  onChange,
  placeholder = "Select date",
  id = "date",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const handleDateSelect = (date: Date | undefined) => {
    onChange?.(date);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <Label htmlFor={id} className="text-sm text-text-secondary">
          {label}
        </Label>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="subtle"
            role="combobox"
            aria-expanded={open}
            id={id}
            className="min-w-0 w-full justify-between overflow-hidden"
          >
            <span
              className={`min-w-0 flex-1 truncate text-left ${
                value ? "text-text-primary" : "text-text-tertiary"
              }`}
            >
              {value ? value.toLocaleDateString() : placeholder}
            </span>
            <ChevronDownIcon className="ml-2 size-4 shrink-0 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            captionLayout="dropdown"
            onSelect={handleDateSelect}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
