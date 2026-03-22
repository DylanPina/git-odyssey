import { useCallback, useEffect, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@radix-ui/react-collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useForm } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/custom/Combobox";
import { DatePicker } from "@/components/ui/custom/DatePicker";

interface FilterFormData {
  message: string;
  branch: string;
  commit: string;
  file: string;
  summary: string;
  startDate: string;
  endDate: string;
}

interface FiltersProps {
  onFiltersChange?: (filters: FilterFormData) => void;
  branches: string[];
}

export default function Filters({ onFiltersChange, branches }: FiltersProps) {
  const [isOpen, setIsOpen] = useState(true);
  const debounceTimeoutRef = useRef<number | null>(null);
  const onFiltersChangeRef = useRef(onFiltersChange);
  const isInitialMount = useRef(true);
  const previousFiltersRef = useRef<FilterFormData>({
    message: "",
    branch: "",
    commit: "",
    file: "",
    summary: "",
    startDate: "",
    endDate: "",
  });

  const { register, watch, setValue } = useForm<FilterFormData>({
    defaultValues: previousFiltersRef.current,
    mode: "onChange",
  });

  const watchedValues = watch();
  const currentBranch = watchedValues.branch;

  const validateDateRange = (startDate: string, endDate: string) => {
    if (startDate && endDate) {
      return new Date(endDate) >= new Date(startDate);
    }
    return true;
  };

  const handleStartDateChange = (date: Date | undefined) => {
    const dateString = date ? date.toISOString() : "";
    setValue("startDate", dateString);

    if (dateString && watchedValues.endDate) {
      validateDateRange(dateString, watchedValues.endDate);
    }
  };

  const handleEndDateChange = (date: Date | undefined) => {
    const dateString = date ? date.toISOString() : "";
    setValue("endDate", dateString);

    if (dateString && watchedValues.startDate) {
      validateDateRange(watchedValues.startDate, dateString);
    }
  };

  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange;
  }, [onFiltersChange]);

  const debouncedOnFiltersChange = useCallback((values: FilterFormData) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = window.setTimeout(() => {
      onFiltersChangeRef.current?.(values);
    }, 300);
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const currentFilters = watchedValues;
    const previousFilters = previousFiltersRef.current;

    const hasChanged =
      currentFilters.message !== previousFilters.message ||
      currentFilters.branch !== previousFilters.branch ||
      currentFilters.commit !== previousFilters.commit ||
      currentFilters.file !== previousFilters.file ||
      currentFilters.summary !== previousFilters.summary ||
      currentFilters.startDate !== previousFilters.startDate ||
      currentFilters.endDate !== previousFilters.endDate;

    if (hasChanged) {
      previousFiltersRef.current = currentFilters;
      debouncedOnFiltersChange(currentFilters);
    }
  }, [watchedValues, debouncedOnFiltersChange]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="workspace-panel min-w-0 overflow-hidden"
    >
      <CollapsibleTrigger className="flex min-w-0 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-control/70">
        <div className="min-w-0">
          <div className="workspace-section-label">Filters</div>
          <div className="mt-1 text-sm font-medium text-text-primary">
            Narrow the visible commit set
          </div>
        </div>
        {isOpen ? (
          <ChevronDown className="size-4 text-text-tertiary" />
        ) : (
          <ChevronRight className="size-4 text-text-tertiary" />
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="min-w-0 border-t border-border-subtle px-4 py-4">
        <form className="min-w-0 space-y-3">
          <label className="flex flex-col gap-1.5">
            <Label className="text-sm text-text-secondary">Message</Label>
            <Input
              {...register("message")}
              placeholder="Filter by commit message..."
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <Label className="text-sm text-text-secondary">Branch</Label>
            <Combobox
              options={branches}
              value={currentBranch}
              onSelect={(branch) => setValue("branch", branch)}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <Label className="text-sm text-text-secondary">Commit</Label>
            <Input
              {...register("commit")}
              placeholder="Filter by commit hash..."
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <Label className="text-sm text-text-secondary">File</Label>
            <Input {...register("file")} placeholder="Filter by file path..." />
          </label>

          <label className="flex flex-col gap-1.5">
            <Label className="text-sm text-text-secondary">Summary</Label>
            <Input
              {...register("summary")}
              placeholder="Filter by summary..."
            />
          </label>

          <DatePicker
            label="Start Date"
            value={
              watchedValues.startDate
                ? new Date(watchedValues.startDate)
                : undefined
            }
            onChange={handleStartDateChange}
            id="startDate"
            placeholder="Select start date"
          />

          <DatePicker
            label="End Date"
            value={
              watchedValues.endDate ? new Date(watchedValues.endDate) : undefined
            }
            onChange={handleEndDateChange}
            id="endDate"
            placeholder="Select end date"
          />
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
