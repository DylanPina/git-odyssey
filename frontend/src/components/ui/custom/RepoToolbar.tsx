import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
	ChevronRight,
	Database,
	LogOut,
	RefreshCw,
	RotateCcw,
} from "lucide-react";
import { getRepoDisplayName } from "@/lib/repoPaths";

type RepoToolbarProps = {
	repoPath?: string | null;
	isLoading?: boolean;
	isIngesting?: boolean;
	ingestStatus?: string;
	onExit?: () => void;
	onClearFilters?: () => void;
	onRefresh?: () => void;
};

export function RepoToolbar({
	repoPath,
	isLoading,
	isIngesting,
	ingestStatus,
	onExit,
	onClearFilters,
	onRefresh,
}: RepoToolbarProps) {
	const repoName = repoPath ? getRepoDisplayName(repoPath) : "Git Project";

	return (
		<>
			<TooltipProvider>
				<div className="absolute top-4 right-4 z-10 flex items-center gap-2">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={onRefresh}
								className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-all duration-200"
								size="icon"
								disabled={!onRefresh || isIngesting}
							>
								<RefreshCw className="w-4 h-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent className="text-white">
							Refresh From Disk
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={onExit}
								className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-all duration-200"
								size="sm"
							>
								<LogOut className="w-4 h-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent className="text-white">Exit</TooltipContent>
					</Tooltip>
				</div>
			</TooltipProvider>
			<div className="flex items-center gap-2 absolute top-4 left-4 z-10">
				<SidebarTrigger className="hover:text-white !hover:bg-neutral-200 !hover:border-0" />
				<div className="flex items-center gap-2">
					<span className="px-1.5 py-0.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white/70 text-[10px]">
						Git Project
					</span>
					<ChevronRight className="w-2.5 h-2.5 text-white/50" />
					<span className="px-1.5 py-0.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-[10px] font-medium">
						{repoName}
					</span>
					{repoPath && (
						<span className="max-w-[24rem] truncate text-[10px] text-white/45">
							{repoPath}
						</span>
					)}
					{isLoading && !isIngesting && (
						<div className="flex items-center gap-1 ml-2">
							<div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
							<span className="text-[10px] text-white/60">Fetching...</span>
						</div>
					)}
					{isIngesting && (
						<div className="flex items-center gap-1 ml-2">
							<Database className="w-2 h-2 text-blue-400 animate-pulse" />
							<span className="text-[10px] text-white/60">Refreshing...</span>
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
