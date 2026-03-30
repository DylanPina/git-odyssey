import * as React from "react";
import {
	ArrowRight,
	CheckIcon,
	ChevronsUpDownIcon,
	Loader2,
	Play,
	Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function ReviewTitleBarBranchPicker({
	options,
	value,
	onSelect,
	disabled,
	placeholder,
}: {
	options: string[];
	value: string;
	onSelect: (value: string) => void;
	disabled?: boolean;
	placeholder: string;
}) {
	const [open, setOpen] = React.useState(false);
	const selectedOption = value
		? options.find((option) => option === value) ?? value
		: null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="toolbar"
					size="sm"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className="h-8 min-w-0 max-w-[12rem] justify-between gap-1 rounded-[14px] border-border-subtle bg-[rgba(255,255,255,0.03)] px-3 text-[11px] font-semibold text-text-secondary hover:bg-control"
				>
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-left font-mono",
							selectedOption ? "text-text-primary" : "text-text-tertiary",
						)}
					>
						{selectedOption ?? placeholder}
					</span>
					<ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-70" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[18rem] max-w-[min(22rem,calc(100vw-2rem))] p-2"
			>
				<Command>
					<CommandInput className="min-w-0" placeholder="Search branch..." />
					<CommandList>
						<CommandEmpty>No branch found.</CommandEmpty>
						<CommandGroup>
							{options.map((option) => (
								<CommandItem
									key={option}
									value={option}
									className="min-w-0"
									onSelect={(currentValue) => {
										setOpen(false);
										onSelect(currentValue === value ? "" : currentValue);
									}}
								>
									<CheckIcon
										className={cn(
											"mr-2 size-4",
											value === option ? "opacity-100" : "opacity-0",
										)}
									/>
									<span className="min-w-0 truncate">{option}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

type ReviewTitleBarTrailingProps = {
	branchOptions: string[];
	baseRef: string;
	headRef: string;
	onBaseRefChange: (value: string) => void;
	onHeadRefChange: (value: string) => void;
	isRepoLoading?: boolean;
	canStartReview: boolean;
	canCancelReview: boolean;
	hasCancelableRun: boolean;
	isRunStarting?: boolean;
	isRunCancelling?: boolean;
	onStartReview: () => void;
	onCancelReview: () => void;
};

export function ReviewTitleBarTrailing({
	branchOptions,
	baseRef,
	headRef,
	onBaseRefChange,
	onHeadRefChange,
	isRepoLoading = false,
	canStartReview,
	canCancelReview,
	hasCancelableRun,
	isRunStarting = false,
	isRunCancelling = false,
	onStartReview,
	onCancelReview,
}: ReviewTitleBarTrailingProps) {
	const shouldShowStartReview = !hasCancelableRun && !isRunStarting;
	const branchSelectionDisabled = branchOptions.length === 0 || isRepoLoading;

	return (
		<div className="flex min-w-0 items-center gap-2">
			<div className="flex min-w-0 items-center gap-2">
				<ReviewTitleBarBranchPicker
					options={branchOptions}
					value={baseRef}
					onSelect={onBaseRefChange}
					disabled={branchSelectionDisabled}
					placeholder="Base"
				/>
				<span className="inline-flex items-center justify-center px-0.5 text-text-tertiary">
					<ArrowRight className="size-4" />
				</span>
				<ReviewTitleBarBranchPicker
					options={branchOptions}
					value={headRef}
					onSelect={onHeadRefChange}
					disabled={branchSelectionDisabled}
					placeholder="Head"
				/>
			</div>

			{shouldShowStartReview ? (
				<Button
					variant="accent"
					size="sm"
					className="min-w-[10.5rem]"
					onClick={onStartReview}
					disabled={!canStartReview}
				>
					<>
						<Play className="size-4" />
						Start Review
					</>
				</Button>
			) : null}

			{hasCancelableRun ? (
				<Button
					variant="danger"
					size="sm"
					className="min-w-[8.5rem]"
					onClick={onCancelReview}
					disabled={!canCancelReview}
				>
					{isRunCancelling ? (
						<>
							<Loader2 className="size-4 animate-spin" />
							Cancelling
						</>
					) : (
						<>
							<Square className="size-4" />
							Cancel Run
						</>
					)}
				</Button>
			) : null}
		</div>
	);
}

export default ReviewTitleBarTrailing;
