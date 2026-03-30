import type { ReactNode } from "react";

type DiffWorkspacePageProps = {
	topSections?: Array<ReactNode | null | undefined | false>;
	bottomSections?: Array<ReactNode | null | undefined | false>;
	workspace: ReactNode;
	spacing?: "default" | "compact";
};

export function DiffWorkspacePage({
	topSections = [],
	bottomSections = [],
	workspace,
	spacing = "default",
}: DiffWorkspacePageProps) {
	const renderedTopSections = topSections.filter(Boolean);
	const renderedBottomSections = bottomSections.filter(Boolean);
	const isCompact = spacing === "compact";
	const pagePaddingClass = isCompact ? "pb-0" : "pb-4";
	const topSectionClass = isCompact ? "px-4 pt-2" : "px-4 pt-4";
	const workspaceSectionClass = isCompact ? "px-4 py-2" : "px-4 pb-4 pt-4";
	const workspaceStickyClass = isCompact
		? "sticky top-2 z-10 h-[calc(var(--app-content-height)-0.5rem)]"
		: "sticky top-4 z-10 h-[calc(var(--app-content-height)-2rem)]";
	const bottomSectionClass = isCompact ? "px-4 pb-2" : "px-4 pb-4";

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
