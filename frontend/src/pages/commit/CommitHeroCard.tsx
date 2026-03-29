import { useMemo } from "react";

import { useClipboardToast } from "@/hooks/useClipboardToast";

type CommitHeroCardProps = {
	title: string;
	body: string | null;
	fullSha: string;
	authorLabel: string;
	formattedTime: string;
};

export function CommitHeroCard({
	title,
	body,
	fullSha,
	authorLabel,
	formattedTime,
}: CommitHeroCardProps) {
	const copyToClipboard = useClipboardToast();

	const metadataButtons = useMemo(
		() => [
			{
				key: "sha",
				label: "Commit",
				value: fullSha,
				copyLabel: "Commit hash",
			},
			{
				key: "author",
				label: "Author",
				value: authorLabel,
				copyLabel: "Author",
			},
			{
				key: "date",
				label: "Date",
				value: formattedTime,
				copyLabel: "Date",
			},
		],
		[authorLabel, formattedTime, fullSha],
	);

	return (
		<div className="rounded-[22px] border border-border-strong bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-4">
			<div className="flex flex-col items-start gap-3">
				<div className="w-full max-w-5xl space-y-2">
					<div className="line-clamp-1 text-base font-semibold leading-tight text-text-primary sm:text-lg">
						{title}
					</div>
					{body ? (
						<div className="line-clamp-2 text-sm leading-6 text-text-secondary">
							{body}
						</div>
					) : null}
					<div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
						{metadataButtons.map((button) => (
							<button
								key={button.key}
								type="button"
								className="rounded-full border border-border-subtle bg-control px-2.5 py-1 text-left text-text-primary transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-border-strong hover:bg-control-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
								title={button.value}
								onClick={() =>
									void copyToClipboard(button.value, button.copyLabel)
								}
							>
								<span className="text-text-tertiary">{button.label}:</span>{" "}
								<span
									className={
										button.key === "sha" ? "font-mono text-[11px]" : undefined
									}
								>
									{button.value}
								</span>
							</button>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export default CommitHeroCard;
