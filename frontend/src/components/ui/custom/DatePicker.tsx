"use client";

import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";

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
		if (onChange) {
			onChange(date);
		}
		setOpen(false);
	};

	return (
		<div className="flex flex-col gap-1 dark">
			{label && (
				<Label htmlFor={id} className="text-white text-xs font-bold ml-2 py-2">
					{label}
				</Label>
			)}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						id={id}
						className="w-full justify-between hover:text-white !border-white !py-1 !px-3 !text-sm"
					>
						{value ? (
							value.toLocaleDateString()
						) : (
							<span className="text-white/50">{placeholder}</span>
						)}
						<ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
