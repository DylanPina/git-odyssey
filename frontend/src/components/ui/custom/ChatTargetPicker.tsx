import { useEffect, useState } from "react";
import { Check, ChevronDown, Info } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GoogleAITarget } from "@/lib/definitions/desktop";
import { cn } from "@/lib/utils";

export const DEFAULT_CHAT_TARGET_RESOURCE = "publishers/google/models/gemini-2.5-flash";

export function normalizeChatTargetResource(value: string | null | undefined) {
	const trimmed = String(value || "").trim();
	return trimmed || DEFAULT_CHAT_TARGET_RESOURCE;
}

export function buildManualGoogleTarget(
	value: string | null | undefined,
	capability: "text_generation" | "review" = "text_generation",
): GoogleAITarget | null {
	const resourceName = String(value || "").trim();
	if (!resourceName) {
		return null;
	}
	return {
		target_kind: resourceName.includes("/endpoints/")
			? "vertex_endpoint"
			: "managed_model",
		resource_name: resourceName,
		display_name: resourceName.split("/").at(-1) || resourceName,
		publisher: resourceName.includes("publishers/")
			? resourceName.split("publishers/")[1]?.split("/")[0] || null
			: "google",
		version: null,
		location: null,
		capabilities: [capability],
		adapter_family: resourceName.toLowerCase().includes("gemini")
			? "gemini"
			: "vertex_predict_text",
		embedding_output_dimension: null,
		source: "manual_resource_name",
	};
}

function targetLabel(target: GoogleAITarget | null | undefined) {
	return target?.display_name || target?.resource_name || "Default target";
}

export function ChatTargetPicker({
	value,
	configuredTarget,
	onChange,
	disabled = false,
	description = "Applies only to this chat thread.",
}: {
	value: GoogleAITarget | null;
	configuredTarget?: GoogleAITarget | null;
	onChange: (value: GoogleAITarget | null) => void;
	disabled?: boolean;
	description?: string;
}) {
	const [open, setOpen] = useState(false);
	const [manualDraft, setManualDraft] = useState(value?.resource_name ?? "");

	useEffect(() => {
		if (!open) {
			setManualDraft(value?.resource_name ?? "");
		}
	}, [open, value?.resource_name]);

	const options = [configuredTarget, value].filter(
		(target, index, array): target is GoogleAITarget =>
			Boolean(target) &&
			array.findIndex((candidate) => candidate?.resource_name === target?.resource_name) ===
				index,
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label="Select chat target"
					className={cn(
						"inline-flex h-8 max-w-[10rem] items-center gap-2 rounded-full border px-3 text-[11px] font-medium shadow-[0_10px_24px_rgba(4,8,16,0.28)] backdrop-blur-sm transition-colors duration-150",
						"border-[rgba(83,183,130,0.28)] bg-[rgba(12,18,18,0.94)] text-text-primary hover:border-[rgba(83,183,130,0.48)]",
						"focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50",
					)}
				>
					<span className="min-w-0 truncate">{targetLabel(value ?? configuredTarget)}</span>
					<ChevronDown className="size-3.5 shrink-0 text-text-tertiary" />
				</button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-[22rem] space-y-3 p-3">
					<div className="space-y-1">
						<div className="workspace-section-label">Google AI target</div>
						<p className="text-xs leading-5 text-text-secondary">{description}</p>
					</div>

				<div className="space-y-1.5">
					{options.map((target) => {
						const isSelected = value?.resource_name === target.resource_name;
						return (
							<button
								key={target.resource_name}
								type="button"
								onClick={() => {
									onChange(target);
									setOpen(false);
								}}
								className={cn(
									"flex w-full items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-left transition-colors duration-150",
									isSelected
										? "border-[rgba(83,183,130,0.42)] bg-[rgba(83,183,130,0.14)] text-text-primary"
										: "border-border-subtle bg-control/55 text-text-secondary hover:border-border-strong hover:bg-control-hover hover:text-text-primary",
								)}
							>
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium">
										{targetLabel(target)}
									</span>
									<span className="block truncate text-[11px] text-text-tertiary">
										{target.resource_name}
									</span>
								</span>
								<Check
									className={cn(
										"size-4 shrink-0",
										isSelected ? "opacity-100 text-accent" : "opacity-0",
									)}
								/>
							</button>
						);
					})}
				</div>

				<div className="rounded-[14px] border border-border-subtle bg-[rgba(255,255,255,0.03)] p-3">
					<div className="mb-2 flex items-center gap-1.5">
						<div className="text-xs font-medium text-text-primary">
							Manual resource
						</div>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label="Manual resource help"
									className="inline-flex size-4 items-center justify-center rounded-full text-text-tertiary transition-colors duration-150 hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
								>
									<Info className="size-3.5" />
								</button>
								</TooltipTrigger>
								<TooltipContent>
									Use a full endpoint resource or publisher model name.
								</TooltipContent>
							</Tooltip>
						</div>
					<Input
						value={manualDraft}
						onChange={(event) => {
							const nextValue = event.target.value;
							setManualDraft(nextValue);
							onChange(buildManualGoogleTarget(nextValue));
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								setOpen(false);
							}
							}}
							placeholder="publishers/google/models/gemini-2.5-flash"
							aria-label="Manual Google AI resource"
							className="h-8 text-xs"
						/>
				</div>
			</PopoverContent>
		</Popover>
	);
}
