"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useNavigate } from "react-router-dom";

import { Form, FormControl, FormField, FormItem, FormMessage } from "../form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "../button";
import { Loader2, ArrowRight } from "lucide-react";
import { useState } from "react";

const FormSchema = z.object({
	githubUrl: z
		.string()
		.min(1, {
			message: "Please enter a GitHub repository URL.",
		})
		.refine(
			(url) => {
				const githubUrlRegex =
					/^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\/.*)?$/;
				const ownerRepoRegex = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

				return githubUrlRegex.test(url) || ownerRepoRegex.test(url);
			},
			{
				message:
					"Please enter a valid GitHub repository URL or owner/repo format.",
			}
		),
});

export function RepoInput() {
	const [isLoading, setIsLoading] = useState(false);
	const navigate = useNavigate();

	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			githubUrl: "DylanPina/git-odyssey",
		},
	});

	function onSubmit(data: z.infer<typeof FormSchema>) {
		setIsLoading(true);

		// Handle both full URLs and owner/repo format
		let owner: string, name: string;

		try {
			if (data.githubUrl.startsWith("http")) {
				// Parse full GitHub URL
				const url = new URL(data.githubUrl);
				if (url.hostname !== "github.com" && !url.hostname.includes("github")) {
					throw new Error("Not a GitHub URL");
				}
				const pathParts = url.pathname
					.split("/")
					.filter((part) => part.length > 0);
				if (pathParts.length < 2) {
					throw new Error("Invalid GitHub URL format");
				}
				owner = pathParts[0];
				name = pathParts[1];
			} else {
				// Parse owner/repo format
				const parts = data.githubUrl.split("/");
				if (
					parts.length !== 2 ||
					parts[0].length === 0 ||
					parts[1].length === 0
				) {
					throw new Error("Invalid owner/repo format");
				}
				owner = parts[0];
				name = parts[1];
			}
		} catch {
			form.setError("githubUrl", {
				message: "Please enter a valid repository format",
			});
			setIsLoading(false);
			return;
		}

		// Navigate to repo page - it will handle ingestion if needed
		navigate(`/repo/${owner}/${name}`);
		setIsLoading(false);
	}

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="w-full max-w-2xl">
				<FormField
					control={form.control}
					name="githubUrl"
					render={({ field }) => (
						<FormItem className="flex flex-row items-center justify-center">
							<FormControl>
								<Select
									disabled={isLoading}
									value={field.value}
									onValueChange={field.onChange}
								>
									<SelectTrigger className="w-[300px] h-14 !bg-neutral-800 backdrop-blur-sm border-white/20 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-2 focus:ring-white/20 rounded-xl">
										<SelectValue placeholder="Select a GitHub repository URL or owner/repo" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="DylanPina/git-odyssey">
											DylanPina/git-odyssey
										</SelectItem>
										<SelectItem value="DylanPina/RUCS-Hub">
											DylanPina/RUCS-Hub
										</SelectItem>
										<SelectItem value="DylanPina/dsp.dev">
											DylanPina/dsp.dev
										</SelectItem>
									</SelectContent>
								</Select>
							</FormControl>
							<Button
								type="submit"
								disabled={isLoading || !field.value}
								className="!bg-neutral-800 text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all duration-200"
							>
								{isLoading ? (
									<Loader2 className="w-4 h-4 text-white animate-spin" />
								) : (
									<ArrowRight className="w-4 h-4 text-white" />
								)}
							</Button>
							<FormMessage className="text-red-400 mt-2" />
						</FormItem>
					)}
				/>

				<div className="mt-4 text-center">
					<p className="text-sm text-white/50">
						Try it out on{" "}
						<span
							className="text-blue-400 cursor-pointer hover:text-blue-300"
							onClick={() =>
								form.setValue("githubUrl", "DylanPina/git-odyssey")
							}
						>
							DylanPina/git-odyssey{" "}
						</span>
					</p>
				</div>
			</form>
		</Form>
	);
}
