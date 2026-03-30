import type { ReactNode } from "react";

type DiffWorkspacePageProps = {
	topSections?: Array<ReactNode | null | undefined | false>;
	bottomSections?: Array<ReactNode | null | undefined | false>;
	workspace: ReactNode;
};

export function DiffWorkspacePage({
	topSections = [],
	bottomSections = [],
	workspace,
}: DiffWorkspacePageProps) {
	const renderedTopSections = topSections.filter(Boolean);
	const renderedBottomSections = bottomSections.filter(Boolean);

	return (
		<div className="workspace-shell overflow-y-auto">
			<div className="flex min-h-full flex-col pb-4">
				{renderedTopSections.map((section, index) => (
					<div key={index} className="px-4 pt-4">
						{section}
					</div>
				))}

				<div className="px-4 pb-4 pt-4">
					<div className="sticky top-4 z-10 h-[calc(var(--app-content-height)-2rem)]">
						{workspace}
					</div>
				</div>

				{renderedBottomSections.map((section, index) => (
					<div key={index} className="px-4 pb-4">
						{section}
					</div>
				))}
			</div>
		</div>
	);
}

export default DiffWorkspacePage;
