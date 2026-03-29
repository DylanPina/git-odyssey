import { Github, Settings } from "lucide-react";
import { Link } from "react-router-dom";

import { GitProjectPicker } from "@/components/ui/custom/GitProjectPicker";
import { HomeSpaceBackdrop } from "@/components/ui/custom/HomeSpaceBackdrop";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { buildSettingsRoute } from "@/lib/repoPaths";

const GITHUB_URL = "https://github.com/DylanPina/git-odyssey";
const homeUtilityButtonClass =
	"h-10 rounded-full border-white/14 bg-white/[0.04] px-4 font-mono font-medium tracking-[0.01em] text-[rgba(255,255,255,0.72)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md hover:border-white/24 hover:bg-white/[0.08] hover:text-text-primary";

export function Home() {
	const { isLoading, desktopHealth } = useAuth();
	const backendReady = desktopHealth?.backend?.state === "running";
	const textGenerationReady = desktopHealth?.ai?.textGeneration?.ready ?? false;

	const setupMessage = isLoading
		? "Checking local setup."
		: !backendReady
			? "Local backend needs attention."
			: !textGenerationReady
				? "AI is not configured yet."
				: null;

	return (
		<div className="workspace-shell workspace-shell-plain relative overflow-x-hidden overflow-y-auto">
			<HomeSpaceBackdrop />

			<div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-14 sm:px-6">
				<div className="w-full space-y-10">
					<header className="flex flex-col items-center gap-6 text-center">
						<h1 className="font-sans text-[42px] font-bold leading-none tracking-[-0.08em] text-text-primary sm:text-[52px]">
							GitOdyssey
						</h1>

						{setupMessage ? (
							<p className="max-w-xl font-mono text-sm font-normal tracking-[0.01em] text-[rgba(255,255,255,0.56)]">
								{setupMessage}
							</p>
						) : null}
					</header>

					<GitProjectPicker />

					<div className="flex flex-wrap items-center justify-center gap-3">
						<Button
							variant="toolbar"
							size="toolbar"
							className={homeUtilityButtonClass}
							asChild
						>
							<Link to={buildSettingsRoute()}>
								<Settings className="size-4 -translate-y-px" />
								Settings
							</Link>
						</Button>

						<Button
							variant="toolbar"
							size="toolbar"
							className={homeUtilityButtonClass}
							asChild
						>
							<a href={GITHUB_URL} target="_blank" rel="noreferrer">
								<Github className="size-4 -translate-y-px" />
								GitHub
							</a>
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
