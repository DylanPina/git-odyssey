"use client";

import { useEffect, useState } from "react";
import "./App.css";
import {
	matchPath,
	Navigate,
	Route,
	Routes,
	useLocation,
	useNavigate,
	useSearchParams,
} from "react-router-dom";
import { Home } from "@/pages/Home";
import { Repo } from "@/pages/Repo";
import { Commit } from "@/pages/Commit";
import { Review } from "@/pages/Review";
import { Settings } from "@/pages/Settings";
import { DesktopTitleBar } from "@/components/ui/custom/DesktopTitleBar";
import { useRepoNavigationShortcuts } from "@/hooks/useRepoNavigationShortcuts";
import {
	DesktopTitleBarActionsContext,
	type DesktopTitleBarAction,
} from "@/lib/desktop-titlebar-actions";
import { resolveDesktopTitleBarMeta } from "@/lib/desktop-titlebar";
import {
	buildRepoRoute,
	readRepoPathFromSearchParams,
} from "@/lib/repoPaths";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function App() {
	useRepoNavigationShortcuts();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const [titleBarActions, setTitleBarActions] = useState<DesktopTitleBarAction[]>([]);
	const repoPath = readRepoPathFromSearchParams(searchParams);
	const titleBarMeta = resolveDesktopTitleBarMeta(location.pathname, searchParams);
	const showWorkflowBackButton = Boolean(
		location.pathname === "/repo/review" ||
			matchPath("/repo/commit/:commitSha", location.pathname),
	);

	useEffect(() => {
		document.title = titleBarMeta.documentTitle;
	}, [titleBarMeta.documentTitle]);

	useEffect(() => {
		if (!showWorkflowBackButton) {
			setTitleBarActions([]);
		}
	}, [showWorkflowBackButton]);

	const handleTitleBarBack = () => {
		const historyIndex = window.history.state?.idx;
		if (typeof historyIndex === "number" && historyIndex > 0) {
			navigate(-1);
			return;
		}

		navigate(repoPath ? buildRepoRoute(repoPath) : "/", { replace: true });
	};

	return (
		<DesktopTitleBarActionsContext.Provider value={setTitleBarActions}>
			<div className="desktop-window-frame">
				<DesktopTitleBar
					meta={titleBarMeta}
					actions={titleBarActions}
					showGoBack={showWorkflowBackButton}
					onGoBack={showWorkflowBackButton ? handleTitleBarBack : undefined}
				/>

				<main className="desktop-window-content">
					<div className="desktop-window-view">
						<Routes>
							<Route path="/" element={<Home />} />
							<Route path="/index.html" element={<Navigate to="/" replace />} />
							<Route path="/repo" element={<Repo />} />
							<Route path="/repo/commit/:commitSha" element={<Commit />} />
							<Route path="/repo/review" element={<Review />} />
							<Route path="/settings" element={<Settings />} />
						</Routes>
					</div>
				</main>

				<ToastContainer
					theme="dark"
					position="top-right"
					autoClose={3000}
					hideProgressBar
					newestOnTop
					closeOnClick
					rtl={false}
					pauseOnFocusLoss
					draggable
					pauseOnHover
					style={{ top: "calc(var(--desktop-titlebar-height) + 0.75rem)" }}
				/>
			</div>
		</DesktopTitleBarActionsContext.Provider>
	);
}

export default App;
