import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LoadingOverlay } from "@/components/ui/custom/LoadingOverlay";
import { useCommitDetails } from "@/hooks/useCommitDetails";
import { CommitToolbar } from "@/components/ui/custom/CommitToolbar";
import { CommitFilePanel } from "@/components/ui/custom/CommitFilePanel";

export function Commit() {
	const { owner, repo_name, commitSha } = useParams();
	const navigate = useNavigate();

	const shortSha = useMemo(
		() => (commitSha ? commitSha.slice(0, 8) : ""),
		[commitSha]
	);

	const {
		isLoading,
		error,
		commit: targetCommit,
		expanded,
		setExpanded,
		fileSummaries,
		summaryOpen,
		setSummaryOpen,
		hunkSummaries,
		hunkSummaryOpen,
		setHunkSummaryOpen,
		handleSummarizeFile,
		handleSummarizeHunk,
	} = useCommitDetails({ owner, repoName: repo_name, commitSha });

	const collapseAll = () => {
		setExpanded((prev) => {
			const next: Record<string, boolean> = {};
			for (const key of Object.keys(prev)) next[key] = false;
			return next;
		});
	};

	// Data management moved into useCommitDetails

	const renderDiffEditors = () => {
		if (!targetCommit) return null;
		const files = targetCommit.file_changes || [];
		if (files.length === 0) {
			return (
				<div className="text-white/60">No file changes in this commit.</div>
			);
		}
		return (
			<div className="flex flex-col gap-6">
				{files.map((fc) => {
					const labelPath = fc.new_path || fc.old_path || "unknown";
					const isExpanded = expanded[labelPath] ?? true;
					const summaryKey = fc.id != null ? String(fc.id) : labelPath;
					const summaryState = fileSummaries[summaryKey];
					const isSummaryOpen = summaryOpen[summaryKey] ?? false;
					return (
						<CommitFilePanel
							key={`${targetCommit.sha}-${labelPath}`}
							owner={owner}
							repoName={repo_name}
							commit={targetCommit}
							fileChange={fc}
							isExpanded={isExpanded}
							onToggleExpanded={() =>
								setExpanded((prev) => ({
									...prev,
									[labelPath]: !(prev[labelPath] ?? true),
								}))
							}
							fileSummary={summaryState}
							isFileSummaryOpen={isSummaryOpen}
							onToggleFileSummary={() =>
								setSummaryOpen((prev) => ({
									...prev,
									[summaryKey]: !(prev[summaryKey] ?? false),
								}))
							}
							onSummarizeFile={() => handleSummarizeFile(fc)}
							hunkSummaries={hunkSummaries}
							hunkSummaryOpen={hunkSummaryOpen}
							onToggleHunkSummary={(hKey) =>
								setHunkSummaryOpen((prev) => ({
									...prev,
									[hKey]: !(prev[hKey] ?? false),
								}))
							}
							onSummarizeHunk={(hunk) => handleSummarizeHunk(hunk)}
						/>
					);
				})}
			</div>
		);
	};

	return (
		<div className="w-screen h-screen relative p-4 overflow-auto">
			<CommitToolbar
				owner={owner}
				repoName={repo_name}
				shortSha={shortSha}
				onExit={() => navigate(`/repo/${owner}/${repo_name}`)}
				onCollapseAll={collapseAll}
			/>

			<LoadingOverlay isVisible={Boolean(isLoading)} />
			{error && <div className="text-red-400">{error}</div>}
			{!isLoading && !error && renderDiffEditors()}
		</div>
	);
}

export default Commit;
