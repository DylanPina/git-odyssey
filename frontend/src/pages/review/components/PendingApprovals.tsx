import { Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import type {
	ReviewApproval,
	ReviewApprovalDecision,
} from "@/lib/definitions/review";
import {
	formatLabel,
	getApprovalTone,
} from "@/pages/review/review-formatters";

type PendingApprovalsProps = {
	approvals: ReviewApproval[];
	loadingById: Record<string, boolean>;
	onDecision: (
		approval: ReviewApproval,
		decision: ReviewApprovalDecision,
	) => void;
};

export function PendingApprovals({
	approvals,
	loadingById,
	onDecision,
}: PendingApprovalsProps) {
	if (approvals.length === 0) {
		return null;
	}

	return (
		<section className="rounded-[20px] border border-[rgba(199,154,86,0.28)] bg-[rgba(199,154,86,0.09)] p-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<ShieldAlert className="size-4 text-warning" />
					<div className="text-sm font-semibold text-text-primary">
						Codex is waiting for approval
					</div>
				</div>
				<StatusPill tone="warning">{approvals.length}</StatusPill>
			</div>
			<div className="mt-3 space-y-3">
				{approvals.map((approval) => {
					const isLoading = Boolean(loadingById[approval.id]);
					const requestPayload = JSON.stringify(
						approval.request_payload,
						null,
						2,
					);

					return (
						<div
							key={approval.id}
							className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(15,23,42,0.32)] p-3"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="min-w-0">
									<div className="text-sm font-medium text-text-primary">
										{approval.summary || formatLabel(approval.method)}
									</div>
									<div className="mt-1 font-mono text-[11px] text-text-tertiary">
										{approval.method}
									</div>
								</div>
								<StatusPill tone={getApprovalTone(approval.status)}>
									{formatLabel(approval.status)}
								</StatusPill>
							</div>
							<pre className="workspace-scrollbar mt-3 max-h-40 overflow-auto rounded-[12px] border border-border-subtle bg-[rgba(2,6,23,0.52)] p-3 font-mono text-[11px] leading-5 text-text-secondary">
								{requestPayload}
							</pre>
							<div className="mt-3 flex flex-wrap gap-2">
								<Button
									size="sm"
									variant="accent"
									disabled={isLoading}
									onClick={() => onDecision(approval, "accept")}
								>
									{isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
									Approve
								</Button>
								<Button
									size="sm"
									variant="subtle"
									disabled={isLoading}
									onClick={() => onDecision(approval, "acceptForSession")}
								>
									Allow For Session
								</Button>
								<Button
									size="sm"
									variant="toolbar"
									disabled={isLoading}
									onClick={() => onDecision(approval, "decline")}
								>
									Decline
								</Button>
								<Button
									size="sm"
									variant="danger"
									disabled={isLoading}
									onClick={() => onDecision(approval, "cancel")}
								>
									Cancel Run
								</Button>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

export default PendingApprovals;
