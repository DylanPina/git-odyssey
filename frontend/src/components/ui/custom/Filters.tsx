import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/custom/Combobox";
import { DatePicker } from "@/components/ui/custom/DatePicker";
import type { FilterFormData } from "@/lib/filter-utils";

interface FiltersProps {
  values: FilterFormData;
  onChange?: (filters: FilterFormData) => void;
  branches: string[];
}

export default function Filters({
  values,
  onChange,
  branches,
}: FiltersProps) {
  const updateFilters = <Field extends keyof FilterFormData>(
    field: Field,
    value: FilterFormData[Field]
  ) => {
    onChange?.({
      ...values,
      [field]: value,
    });
  };

  return (
    <form
      className="min-w-0 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <Label className="text-sm text-text-secondary">Message</Label>
        <Input
          value={values.message}
          onChange={(event) => updateFilters("message", event.target.value)}
          placeholder="Filter by commit message..."
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <Label className="text-sm text-text-secondary">Branch</Label>
        <Combobox
          options={branches}
          value={values.branch}
          onSelect={(branch) => updateFilters("branch", branch)}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <Label className="text-sm text-text-secondary">Commit</Label>
        <Input
          value={values.commit}
          onChange={(event) => updateFilters("commit", event.target.value)}
          placeholder="Filter by commit hash..."
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <Label className="text-sm text-text-secondary">File</Label>
        <Input
          value={values.file}
          onChange={(event) => updateFilters("file", event.target.value)}
          placeholder="Filter by file path..."
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <Label className="text-sm text-text-secondary">Summary</Label>
        <Input
          value={values.summary}
          onChange={(event) => updateFilters("summary", event.target.value)}
          placeholder="Filter by summary..."
        />
      </label>

      <DatePicker
        label="Start Date"
        value={values.startDate ? new Date(values.startDate) : undefined}
        onChange={(date) =>
          updateFilters("startDate", date ? date.toISOString() : "")
        }
        id="repo-filter-start-date"
        placeholder="Select start date"
      />

      <DatePicker
        label="End Date"
        value={values.endDate ? new Date(values.endDate) : undefined}
        onChange={(date) => updateFilters("endDate", date ? date.toISOString() : "")}
        id="repo-filter-end-date"
        placeholder="Select end date"
      />
    </form>
  );
}
