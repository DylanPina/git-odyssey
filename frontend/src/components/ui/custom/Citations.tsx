import { GitCommit, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/definitions/chat";
import { useState, useEffect } from "react";

interface CitationsProps {
	citedCommits: Citation[];
	onCommitClick?: (commitSha: string) => void;
	className?: string;
}

const CITATIONS_TOGGLE_KEY = "git-odyssey-citations-expanded";

export function Citations({
	citedCommits,
	onCommitClick,
	className,
}: CitationsProps) {
	const [isExpanded, setIsExpanded] = useState(true);

	// Load toggle state from localStorage on mount
	useEffect(() => {
		try {
			const stored = localStorage.getItem(CITATIONS_TOGGLE_KEY);
			if (stored !== null) {
				setIsExpanded(JSON.parse(stored));
			}
		} catch (error) {
			console.error("Failed to load citations toggle state:", error);
		}
	}, []);

	// Save toggle state to localStorage when it changes
	const handleToggle = () => {
		const newState = !isExpanded;
		setIsExpanded(newState);
		try {
			localStorage.setItem(CITATIONS_TOGGLE_KEY, JSON.stringify(newState));
		} catch (error) {
			console.error("Failed to save citations toggle state:", error);
		}
	};

	if (!citedCommits || citedCommits.length === 0) {
		return null;
	}

	// Filter out any invalid commits and ensure we have valid data
	const validCommits = citedCommits.filter(
		(commit) =>
			commit &&
			commit.sha &&
			typeof commit.sha === "string" &&
			commit.sha.length > 0
	);

	if (validCommits.length === 0) {
		console.warn("No valid commits found in citations:", citedCommits);
		return null;
	}

	console.log(
		`Rendering Citations component with ${validCommits.length} valid commits:`,
		validCommits.map((c: Citation) => ({
			sha: c?.sha?.substring(0, 8) || "unknown",
			similarity: c?.similarity
				? (c.similarity * 100).toFixed(1) + "%"
				: "unknown",
			message: c?.message ? c.message.substring(0, 30) + "..." : "no message",
		}))
	);

	return (
		<div className={cn("mt-3 pt-3 border-t border-neutral-700", className)}>
			<button
				onClick={handleToggle}
				className="flex items-center gap-2 mb-2 hover:bg-neutral-800/50 rounded-md px-1 py-1 -mx-1 transition-colors w-full"
				title={isExpanded ? "Hide cited commits" : "Show cited commits"}
			>
				{isExpanded ? (
					<ChevronDown className="w-4 h-4 text-neutral-400" />
				) : (
					<ChevronRight className="w-4 h-4 text-neutral-400" />
				)}
				<GitCommit className="w-4 h-4 text-neutral-400" />
				<span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
					Cited Commits ({validCommits.length})
				</span>
			</button>

			<div
				className={`transition-all duration-200 ease-in-out overflow-hidden ${isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
			>
				<div className="flex flex-wrap gap-2 w-full bg-neutral-900 rounded-md p-2">
					{validCommits.map((citedCommit) => {
						const sha = citedCommit?.sha || "unknown";
						const similarity = citedCommit?.similarity || 0;
						const message = citedCommit?.message || "";

						return (
							<button
								key={sha}
								onClick={() => onCommitClick?.(sha)}
								className={cn(
									"flex flex-col items-start gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors",
									"bg-neutral-700 hover:bg-neutral-700/50 text-neutral-300 hover:text-white",
									"border border-neutral-700 hover:border-neutral-600",
									"w-full text-left"
								)}
								title={`View commit ${sha} (similarity: ${(similarity * 100).toFixed(1)}%)`}
							>
								<div className="flex items-center gap-2 w-full">
									<span className="font-mono text-blue-400">
										{sha.substring(0, 8)}
									</span>
									<span className="text-neutral-500 text-[10px]">|</span>
									<span className="text-neutral-500 text-[10px]">
										{(similarity * 100).toFixed(0)}%
									</span>
								</div>
								{message && (
									<div className="text-neutral-400 text-[11px] leading-tight truncate w-full">
										{message}
									</div>
								)}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
