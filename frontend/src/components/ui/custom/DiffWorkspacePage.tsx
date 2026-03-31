import type { ReactNode } from "react";

type DiffWorkspacePageProps = {
	topSections?: Array<ReactNode | null | undefined | false>;
	bottomSections?: Array<ReactNode | null | undefined | false>;
	workspace: ReactNode;
	spacing?: "default" | "compact";
	layout?: "scroll" | "fixed";
};

export function DiffWorkspacePage({
	topSections = [],
	bottomSections = [],
	workspace,
	spacing = "default",
	layout = "scroll",
}: DiffWorkspacePageProps) {
	const renderedTopSections = topSections.filter(Boolean);
	const renderedBottomSections = bottomSections.filter(Boolean);
	const isCompact = spacing === "compact";
	const isFixed = layout === "fixed";
	const pagePaddingClass = isCompact ? "pb-0" : "pb-4";
	const topSectionClass = isCompact ? "px-3 pt-1.5" : "px-4 pt-4";
	const workspaceSectionClass = isCompact ? "px-3 py-1.5" : "px-4 pb-4 pt-4";
	const workspaceStickyClass = isCompact
		? "sticky top-2 z-10 h-[calc(var(--app-content-height)-0.5rem)]"
		: "sticky top-4 z-10 h-[calc(var(--app-content-height)-2rem)]";
	const bottomSectionClass = isCompact ? "px-3 pb-1.5" : "px-4 pb-4";

	if (isFixed) {
		return (
			<div className="workspace-shell h-full overflow-hidden">
				<div className="flex h-full min-h-0 flex-col">
					{renderedTopSections.map((section, index) => (
						<div key={index} className={`${topSectionClass} shrink-0`}>
							<div className="max-h-[28vh] overflow-y-auto">{section}</div>
						</div>
					))}

					<div className={`${workspaceSectionClass} min-h-0 flex-1`}>
						<div className="h-full min-h-0">{workspace}</div>
					</div>

					{renderedBottomSections.map((section, index) => (
						<div key={index} className={`${bottomSectionClass} shrink-0`}>
							<div className="max-h-[22vh] overflow-y-auto">{section}</div>
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="workspace-shell overflow-y-auto">
			<div className={`flex min-h-full flex-col ${pagePaddingClass}`}>
				{renderedTopSections.map((section, index) => (
					<div key={index} className={topSectionClass}>
						{section}
					</div>
				))}

				<div className={workspaceSectionClass}>
					<div className={workspaceStickyClass}>
						{workspace}
					</div>
				</div>

				{renderedBottomSections.map((section, index) => (
					<div key={index} className={bottomSectionClass}>
						{section}
					</div>
				))}
			</div>
		</div>
	);
}

export default DiffWorkspacePage;
