"use client";

import { useEffect, useState } from "react";
import "./App.css";
import {
	Navigate,
	Route,
	Routes,
	useLocation,
	useNavigate,
	useNavigationType,
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
	DesktopTitleBarChromeContext,
	DesktopTitleBarActionsContext,
	type DesktopTitleBarAction,
	type DesktopTitleBarChrome,
} from "@/lib/desktop-titlebar-actions";
import { resolveDesktopTitleBarMeta } from "@/lib/desktop-titlebar";
import {
	buildRepoRoute,
	readRepoPathFromSearchParams,
} from "@/lib/repoPaths";
import { getHistoryIndex, getRepoWorkflowRoute } from "@/lib/repoNavigation";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function App() {
	useRepoNavigationShortcuts();
	const navigate = useNavigate();
	const location = useLocation();
	const navigationType = useNavigationType();
	const [searchParams] = useSearchParams();
	const [titleBarActions, setTitleBarActions] = useState<DesktopTitleBarAction[]>([]);
	const [titleBarChrome, setTitleBarChrome] = useState<DesktopTitleBarChrome | null>(
		null,
	);
	const [maxHistoryIndex, setMaxHistoryIndex] = useState(() => getHistoryIndex());
	const repoPath = readRepoPathFromSearchParams(searchParams);
	const titleBarMeta = resolveDesktopTitleBarMeta(location.pathname, searchParams);
	const workflowRoute = getRepoWorkflowRoute(location.pathname);
	const showWorkflowActions = workflowRoute === "commit" || workflowRoute === "review";
	const currentHistoryIndex = getHistoryIndex();
	const canNavigateBack =
		workflowRoute === "repo"
			? false
			: currentHistoryIndex > 0 ||
				workflowRoute === "commit" ||
				workflowRoute === "review";
	const canNavigateForward = currentHistoryIndex < maxHistoryIndex;

	useEffect(() => {
		document.title = titleBarMeta.documentTitle;
	}, [titleBarMeta.documentTitle]);

	useEffect(() => {
		if (!showWorkflowActions) {
			setTitleBarActions([]);
		}
	}, [showWorkflowActions]);

	useEffect(() => {
		const historyIndex = getHistoryIndex();
		setMaxHistoryIndex((currentMaxHistoryIndex) =>
			navigationType === "PUSH"
				? historyIndex
				: Math.max(currentMaxHistoryIndex, historyIndex),
		);
	}, [location.key, navigationType]);

	const handleTitleBarBack = () => {
		if (!canNavigateBack) {
			return;
		}

		const historyIndex = getHistoryIndex();
		if (historyIndex > 0) {
			navigate(-1);
			return;
		}

		if (workflowRoute === "commit" || workflowRoute === "review") {
			navigate(repoPath ? buildRepoRoute(repoPath) : "/", { replace: true });
		}
	};

	const handleTitleBarForward = () => {
		if (!canNavigateForward) {
			return;
		}

		navigate(1);
	};

	return (
		<DesktopTitleBarActionsContext.Provider value={setTitleBarActions}>
			<DesktopTitleBarChromeContext.Provider value={setTitleBarChrome}>
				<div className="desktop-window-frame">
					<DesktopTitleBar
						meta={titleBarMeta}
						actions={titleBarActions}
						chrome={titleBarChrome}
						navigation={
							workflowRoute
								? {
										canGoBack: canNavigateBack,
										canGoForward: canNavigateForward,
										onGoBack: handleTitleBarBack,
										onGoForward: handleTitleBarForward,
									}
								: null
						}
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
			</DesktopTitleBarChromeContext.Provider>
		</DesktopTitleBarActionsContext.Provider>
	);
}

export default App;
