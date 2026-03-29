import type { ReactNode } from "react";

type DiffWorkspaceHeaderProps = {
	icon: ReactNode;
	title: ReactNode;
	titleMeta?: ReactNode;
	subtitle?: ReactNode;
};

export function DiffWorkspaceHeader({
	icon,
	title,
	titleMeta,
	subtitle,
}: DiffWorkspaceHeaderProps) {
	return (
		<div className="flex min-w-0 items-center gap-3">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-border-subtle bg-[rgba(255,255,255,0.035)]">
				{icon}
			</div>

			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<div className="text-sm font-semibold text-text-primary">{title}</div>
					{titleMeta}
				</div>
				{subtitle ? (
					<div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
						{subtitle}
					</div>
				) : null}
			</div>
		</div>
	);
}

export default DiffWorkspaceHeader;
