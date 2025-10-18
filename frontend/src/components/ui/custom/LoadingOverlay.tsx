import { Database, Loader2 } from "lucide-react";

export function LoadingOverlay({
	isVisible,
	isIngesting,
	ingestStatus,
}: {
	isVisible: boolean;
	isIngesting?: boolean;
	ingestStatus?: string;
}) {
	if (!isVisible) return null;
	return (
		<div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
			<div className="flex flex-col items-center gap-4">
				{isIngesting ? (
					<Database className="w-12 h-12 text-blue-400 animate-pulse" />
				) : (
					<Loader2 className="w-12 h-12 text-white animate-spin" />
				)}
				<div className="text-white text-base font-medium">
					{isIngesting && "Loading repository data..."}
				</div>
				<div className="text-white/70 text-sm">
					{isIngesting
						? "This process clones the repository and analyzes its commit history. Large repositories may take a few minutes."
						: "This may take a moment for large repositories"}
				</div>
				{ingestStatus && (
					<div className="text-white/60 text-sm">{ingestStatus}</div>
				)}
			</div>
		</div>
	);
}
