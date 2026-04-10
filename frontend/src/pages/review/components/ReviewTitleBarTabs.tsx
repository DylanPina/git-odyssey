import {
	AlertTriangle,
	Check,
	GitBranch,
	GitCommitHorizontal,
	Loader2,
	Plus,
	X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReviewTab } from "@/pages/review/review-types";

type ReviewTitleBarTabsProps = {
	repoLabel: string;
	tabs: ReviewTab[];
	activeTabId: string | null;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void | Promise<void>;
	onCreateTab: () => void;
};

function getReviewTabLabel(tab: ReviewTab) {
	if (tab.target.mode === "commit") {
		return `commit ${tab.target.commitSha.slice(0, 8)}`;
	}

	if (tab.target.baseRef && tab.target.headRef) {
		return `${tab.target.baseRef} -> ${tab.target.headRef}`;
	}

	if (tab.target.baseRef || tab.target.headRef) {
		return `${tab.target.baseRef || "Base"} -> ${tab.target.headRef || "Head"}`;
	}

	return "New review";
}

function getReviewTabTitle(tab: ReviewTab) {
	const label = getReviewTabLabel(tab);

	if (tab.latestRunStatus === "completed") {
		if ((tab.latestFindingsCount ?? 0) > 0) {
			return `${label} · ${tab.latestFindingsCount} finding${tab.latestFindingsCount === 1 ? "" : "s"}`;
		}

		return `${label} · clean review`;
	}

	if (tab.latestRunStatus === "failed") {
		return `${label} · review failed`;
	}

	if (tab.latestRunStatus === "cancelled") {
		return `${label} · review cancelled`;
	}

	if (tab.latestRunStatus === "pending" || tab.latestRunStatus === "running") {
		return `${label} · review running`;
	}

	if (tab.latestRunStatus === "awaiting_approval") {
		return `${label} · awaiting approval`;
	}

	return label;
}

function ReviewTabStatus({ tab }: { tab: ReviewTab }) {
	if (
		tab.latestRunStatus === "pending" ||
		tab.latestRunStatus === "running" ||
		tab.latestRunStatus === "awaiting_approval"
	) {
		return <Loader2 className="review-titlebar-tabs__status-icon animate-spin" />;
	}

	if (tab.latestRunStatus === "failed") {
		return (
			<AlertTriangle className="review-titlebar-tabs__status-icon text-[rgba(255,166,166,0.92)]" />
		);
	}

	if ((tab.latestFindingsCount ?? 0) > 0) {
		return (
			<span className="review-titlebar-tabs__count-badge">
				{tab.latestFindingsCount}
			</span>
		);
	}

	if (tab.latestRunStatus === "completed") {
		return <Check className="review-titlebar-tabs__status-icon text-success" />;
	}

	return null;
}

export function ReviewTitleBarTabs({
	repoLabel,
	tabs,
	activeTabId,
	onSelectTab,
	onCloseTab,
	onCreateTab,
}: ReviewTitleBarTabsProps) {
	return (
		<div className="review-titlebar-tabs">
			<div className="review-titlebar-tabs__repo" title={repoLabel}>
				<span className="review-titlebar-tabs__repo-label">{repoLabel}</span>
			</div>

			<div className="review-titlebar-tabs__scroll" role="tablist" aria-label="Review tabs">
				{tabs.map((tab) => {
					const isActive = tab.id === activeTabId;
					const label = getReviewTabLabel(tab);

					return (
						<div
							key={tab.id}
							className="review-titlebar-tabs__tab"
							data-active={isActive}
						>
							<button
								type="button"
								role="tab"
								aria-selected={isActive}
								aria-controls={undefined}
								className="review-titlebar-tabs__select"
								onClick={() => onSelectTab(tab.id)}
								title={getReviewTabTitle(tab)}
							>
								<span
									className={cn(
										"review-titlebar-tabs__type-icon",
										tab.target.mode === "commit"
											? "review-titlebar-tabs__type-icon--commit"
											: "review-titlebar-tabs__type-icon--compare",
									)}
								>
									{tab.target.mode === "commit" ? (
										<GitCommitHorizontal className="size-3.5" />
									) : (
										<GitBranch className="size-3.5" />
									)}
								</span>
								<span className="review-titlebar-tabs__label">{label}</span>
								<ReviewTabStatus tab={tab} />
							</button>

							<button
								type="button"
								className="review-titlebar-tabs__close"
								onClick={() => {
									void onCloseTab(tab.id);
								}}
								aria-label={`Close ${label}`}
								title={`Close ${label}`}
							>
								<X className="size-3.5" />
							</button>
						</div>
					);
				})}
			</div>

			<Button
				variant="toolbar"
				size="toolbar-icon"
				className="review-titlebar-tabs__create"
				onClick={onCreateTab}
				aria-label="New review tab"
				title="New review tab"
			>
				<Plus className="size-4" />
			</Button>
		</div>
	);
}

export default ReviewTitleBarTabs;
