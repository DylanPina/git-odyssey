import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronsDown, LogOut } from "lucide-react";

type CommitToolbarProps = {
	owner?: string;
	repoName?: string;
	shortSha?: string;
	onExit?: () => void;
	onCollapseAll?: () => void;
};

export function CommitToolbar({
	owner,
	repoName,
	shortSha,
	onExit,
	onCollapseAll,
}: CommitToolbarProps) {
	return (
		<>
			<Button
				onClick={onCollapseAll}
				className="absolute top-4 right-20 z-10 bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-all duration-200"
				size="icon"
				aria-label="Collapse all"
				title="Collapse all"
			>
				<ChevronsDown className="w-4 h-4" />
			</Button>
			<Button
				onClick={onExit}
				className="absolute top-4 right-4 z-10 bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-all duration-200"
				size="sm"
			>
				<LogOut className="w-4 h-4" />
			</Button>

			<div className="flex items-center gap-2 mb-4">
				<span className="px-1.5 py-0.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white/70 text-[10px]">
					{owner}
				</span>
				<ChevronRight className="w-2.5 h-2.5 text-white/50" />
				<span className="px-1.5 py-0.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-[10px] font-medium">
					{repoName}
				</span>
				<ChevronRight className="w-2.5 h-2.5 text-white/50" />
				<span className="px-1.5 py-0.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded text-white text-[10px] font-medium">
					{shortSha}
				</span>
			</div>
		</>
	);
}

export default CommitToolbar;
