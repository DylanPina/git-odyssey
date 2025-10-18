"use client";

import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
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

export function Combobox({
	options,
	onSelect,
	value,
}: {
	options: string[];
	onSelect: (value: string) => void;
	value?: string;
}) {
	const [open, setOpen] = React.useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="w-full justify-between hover:text-white !border-white !py-1 !px-3 !text-sm"
				>
					{value ? (
						options.find((option) => option === value)
					) : (
						<span className="text-white/50">Filter by branch...</span>
					)}
					<ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-full">
				<Command>
					<CommandInput placeholder="Search branch..." />
					<CommandList>
						<CommandEmpty>No branch found.</CommandEmpty>
						<CommandGroup>
							{options.map((option) => (
								<CommandItem
									key={option}
									value={option}
									onSelect={(currentValue) => {
										setOpen(false);
										onSelect(currentValue === value ? "" : currentValue);
									}}
								>
									<CheckIcon
										className={cn(
											"mr-2 h-4 w-4",
											value === option ? "opacity-100" : "opacity-0"
										)}
									/>
									{option}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
