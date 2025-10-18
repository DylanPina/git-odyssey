import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@radix-ui/react-collapsible";
import { Label } from "@/components/ui/label";
import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useForm } from "react-hook-form";
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
	const [isOpen, setIsOpen] = useState(false);
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

	const {
		register,
		watch,
		setValue,
		formState: { errors },
	} = useForm<FilterFormData>({
		defaultValues: {
			message: "",
			branch: "",
			commit: "",
			file: "",
			summary: "",
			startDate: "",
			endDate: "",
		},
		mode: "onChange",
	});

	const watchedValues = watch();
	const currentBranch = watchedValues.branch;

	// Validation function for date range
	const validateDateRange = (startDate: string, endDate: string) => {
		if (startDate && endDate) {
			const start = new Date(startDate);
			const end = new Date(endDate);
			return end >= start;
		}
		return true;
	};

	const handleStartDateChange = (date: Date | undefined) => {
		const dateString = date ? date.toISOString() : "";
		setValue("startDate", dateString);

		// Validate against end date if it exists
		if (dateString && watchedValues.endDate) {
			if (!validateDateRange(dateString, watchedValues.endDate)) {
				// You could set an error here if you want to show validation errors
				console.warn("Start date must be before or equal to end date");
			}
		}
	};

	const handleEndDateChange = (date: Date | undefined) => {
		const dateString = date ? date.toISOString() : "";
		setValue("endDate", dateString);

		// Validate against start date if it exists
		if (dateString && watchedValues.startDate) {
			if (!validateDateRange(watchedValues.startDate, dateString)) {
				// You could set an error here if you want to show validation errors
				console.warn("End date must be after or equal to start date");
			}
		}
	};

	// Update ref when onFiltersChange changes
	useEffect(() => {
		onFiltersChangeRef.current = onFiltersChange;
	}, [onFiltersChange]);

	// Debounced callback to prevent excessive updates
	const debouncedOnFiltersChange = useCallback(
		(values: FilterFormData) => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}

			debounceTimeoutRef.current = window.setTimeout(() => {
				if (onFiltersChangeRef.current) {
					onFiltersChangeRef.current(values);
				}
			}, 300); // 300ms debounce delay
		},
		[] // No dependencies to prevent recreation
	);

	// Call onFiltersChange when form values change (debounced)
	useEffect(() => {
		// Skip the initial mount to prevent triggering on component mount
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}

		// Check if values have actually changed
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

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
		};
	}, []);

	return (
		<Collapsible className="flex flex-col items-center justify-center text-white">
			<CollapsibleTrigger
				className="w-full flex items-center justify-center !bg-neutral-800/80 !hover:!bg-neutral-800/20 transition-colors"
				onClick={() => setIsOpen(!isOpen)}
			>
				<span className="font-bold text-center text-sm w-full flex items-center justify-center">
					{isOpen ? (
						<ChevronDown className="w-4 h-4" />
					) : (
						<ChevronRight className="w-4 h-4" />
					)}{" "}
					Filter
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="flex flex-col text-white w-full">
				<form className="flex flex-col gap-1">
					<div className="flex flex-col">
						<Label className="text-white text-xs font-bold ml-2 py-2">
							Message
						</Label>
						<InputGroup>
							<InputGroupInput
								{...register("message")}
								className="placeholder:text-white/50"
								placeholder="Filter by commit message..."
							/>
						</InputGroup>
						{errors.message && (
							<span className="text-red-400 text-xs ml-2">
								{errors.message.message}
							</span>
						)}
					</div>
					<div className="flex flex-col">
						<Label className="text-white text-xs font-bold ml-2 py-2">
							Branch
						</Label>
						<Combobox
							options={branches}
							value={currentBranch}
							onSelect={(branch) => setValue("branch", branch)}
						/>
					</div>
					<div className="flex flex-col">
						<Label className="text-white text-xs font-bold ml-2 py-2">
							Commit
						</Label>
						<InputGroup>
							<InputGroupInput
								{...register("commit")}
								className="placeholder:text-white/50"
								placeholder="Filter by commit hash..."
							/>
						</InputGroup>
						{errors.commit && (
							<span className="text-red-400 text-xs ml-2">
								{errors.commit.message}
							</span>
						)}
					</div>
					<div className="flex flex-col">
						<Label className="text-white text-xs font-bold ml-2 py-2">
							File
						</Label>
						<InputGroup>
							<InputGroupInput
								{...register("file")}
								className="placeholder:text-white/50"
								placeholder="Filter by file path..."
							/>
						</InputGroup>
						{errors.file && (
							<span className="text-red-400 text-xs ml-2">
								{errors.file.message}
							</span>
						)}
					</div>
					<div className="flex flex-col">
						<Label className="text-white text-xs font-bold ml-2 py-2">
							Summary
						</Label>
						<InputGroup>
							<InputGroupInput
								{...register("summary")}
								className="placeholder:text-white/50"
								placeholder="Filter by summary..."
							/>
						</InputGroup>
						{errors.summary && (
							<span className="text-red-400 text-xs ml-2">
								{errors.summary.message}
							</span>
						)}
					</div>
					<div className="flex flex-col">
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
						{errors.startDate && (
							<span className="text-red-400 text-xs ml-2">
								{errors.startDate.message}
							</span>
						)}
					</div>
					<div className="flex flex-col">
						<DatePicker
							label="End Date"
							value={
								watchedValues.endDate
									? new Date(watchedValues.endDate)
									: undefined
							}
							onChange={handleEndDateChange}
							id="endDate"
							placeholder="Select end date"
						/>
						{errors.endDate && (
							<span className="text-red-400 text-xs ml-2">
								{errors.endDate.message}
							</span>
						)}
					</div>
				</form>
			</CollapsibleContent>
		</Collapsible>
	);
}
