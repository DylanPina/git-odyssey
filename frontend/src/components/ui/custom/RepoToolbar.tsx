import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ChevronRight, Database, LogOut, RotateCcw } from "lucide-react";

type RepoToolbarProps = {
	owner?: string;
	repoName?: string;
	isLoading?: boolean;
	isIngesting?: boolean;
	ingestStatus?: string;
	onExit?: () => void;
	onClearFilters?: () => void;
};

export function RepoToolbar({
	owner,
	repoName,
	isLoading,
	isIngesting,
	ingestStatus,
	onExit,
	onClearFilters,
}: RepoToolbarProps) {
	return (
		<>
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							onClick={onExit}
							className="absolute top-4 right-4 z-10 bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-all duration-200"
							size="sm"
						>
							<LogOut className="w-4 h-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent className="text-white">Exit</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<div className="flex items-center gap-2 absolute top-4 left-4 z-10">
				<SidebarTrigger className="hover:text-white !hover:bg-neutral-200 !hover:border-0" />
				<div className="flex items-center gap-1">
					<span className="px-1.5 py-0.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white/70 text-[10px]">
						{owner}
					</span>
					<ChevronRight className="w-2.5 h-2.5 text-white/50" />
					<span className="px-1.5 py-0.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-[10px] font-medium">
						{repoName}
					</span>
					{isLoading && !isIngesting && (
						<div className="flex items-center gap-1 ml-2">
							<div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
							<span className="text-[10px] text-white/60">Fetching...</span>
						</div>
					)}
					{isIngesting && (
						<div className="flex items-center gap-1 ml-2">
							<Database className="w-2 h-2 text-blue-400 animate-pulse" />
							<span className="text-[10px] text-white/60">Creating...</span>
						</div>
					)}
				</div>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={onClearFilters}
								size="icon"
								className="h-7 w-7 bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-all duration-200"
							>
								<RotateCcw className="w-3.5 h-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent className="text-white">
							Show All Commits
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
			{/* Hidden status holder for potential future use */}
			{ingestStatus && <div className="sr-only">{ingestStatus}</div>}
		</>
	);
}
