import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "react-toastify";

import {
	cancelReviewRun,
	getReviewSession,
	onReviewRuntimeEvent,
} from "@/api/api";
import type { ReviewSession } from "@/lib/definitions/review";
import type { Branch, Commit } from "@/lib/definitions/repo";
import {
	buildReviewRoute,
	type ReviewRouteTarget,
} from "@/lib/repoPaths";
import {
	ACTIVE_RUN_STATUSES,
	DETACHED_HEAD_LABEL,
	REVIEW_TABS_STORAGE_VERSION,
} from "@/pages/review/review-constants";
import { getErrorMessage } from "@/pages/review/review-formatters";
import {
	getReviewRefsStorageKey,
	getReviewTabsStorageKey,
	getStoredReviewRefs,
	getStoredReviewTabsState,
	persistStoredReviewRefs,
	persistStoredReviewTabsState,
} from "@/pages/review/review-storage";
import type {
	PersistedReviewTabsState,
	ReviewTab,
	ReviewTabTarget,
} from "@/pages/review/review-types";

type UseReviewTabsArgs = {
	repoPath?: string | null;
	reviewTarget: ReviewRouteTarget;
	routeTabId?: string | null;
	branches: Branch[];
	commits: Commit[];
	isRepoLoading: boolean;
	navigate: NavigateFunction;
};

type UseReviewTabsReturn = {
	tabs: ReviewTab[];
	activeTab: ReviewTab | null;
	activeTabId: string | null;
	activeTarget: ReviewTabTarget | null;
	activateTab: (tabId: string) => void;
	activateNextTab: () => void;
	activatePreviousTab: () => void;
	createCompareTab: () => void;
	closeTab: (tabId: string) => Promise<void>;
	updateActiveCompareRefs: (
		nextBaseRef: string,
		nextHeadRef: string,
	) => Promise<void>;
	syncActiveTabSession: (session: ReviewSession | null | undefined) => void;
};

type CompareReviewTabTarget = Extract<ReviewTabTarget, { mode: "compare" }>;
type CommitReviewTabTarget = Extract<ReviewTabTarget, { mode: "commit" }>;

function createReviewTabId() {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
	return new Date().toISOString();
}

function createEmptyTabsState(): PersistedReviewTabsState {
	return {
		version: REVIEW_TABS_STORAGE_VERSION,
		activeTabId: null,
		tabs: [],
	};
}

function createReviewTab(target: ReviewTabTarget): ReviewTab {
	const timestamp = nowIso();
	return {
		id: createReviewTabId(),
		target,
		sessionId: null,
		sessionStatus: null,
		sessionBaseHeadSha: null,
		sessionHeadHeadSha: null,
		latestRunId: null,
		latestRunStatus: null,
		latestSummary: null,
		latestFindingsCount: null,
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

function clearReviewTabSessionSnapshot(tab: ReviewTab): ReviewTab {
	return {
		...tab,
		sessionId: null,
		sessionStatus: null,
		sessionBaseHeadSha: null,
		sessionHeadHeadSha: null,
		latestRunId: null,
		latestRunStatus: null,
		latestSummary: null,
		latestFindingsCount: null,
		updatedAt: nowIso(),
	};
}

function buildDefaultCompareTarget(repoPath?: string | null): CompareReviewTabTarget {
	const storedRefs = getStoredReviewRefs(getReviewRefsStorageKey(repoPath));
	return {
		mode: "compare",
		baseRef: storedRefs?.baseRef ?? "",
		headRef: storedRefs?.headRef ?? "",
	};
}

function isCompleteReviewTarget(target: ReviewRouteTarget | ReviewTabTarget): boolean {
	if (target.mode === "commit") {
		return Boolean(target.commitSha);
	}

	return Boolean(target.baseRef && target.headRef);
}

function normalizeTabsState(state: PersistedReviewTabsState): PersistedReviewTabsState {
	if (!state.tabs.length) {
		return createEmptyTabsState();
	}

	const activeTabId = state.tabs.some((tab) => tab.id === state.activeTabId)
		? state.activeTabId
		: state.tabs[0]?.id ?? null;

	return {
		version: REVIEW_TABS_STORAGE_VERSION,
		activeTabId,
		tabs: state.tabs,
	};
}

function areTabsStatesEqual(
	left: PersistedReviewTabsState,
	right: PersistedReviewTabsState,
) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function findTabById(
	state: PersistedReviewTabsState,
	tabId: string | null | undefined,
): ReviewTab | null {
	if (!tabId) {
		return null;
	}

	return state.tabs.find((tab) => tab.id === tabId) ?? null;
}

function getActiveTab(state: PersistedReviewTabsState): ReviewTab | null {
	return findTabById(state, state.activeTabId) ?? state.tabs[0] ?? null;
}

function tabMatchesTarget(tab: ReviewTab, target: ReviewRouteTarget | ReviewTabTarget) {
	if (target.mode === "commit") {
		return (
			tab.target.mode === "commit" && tab.target.commitSha === target.commitSha
		);
	}

	return (
		tab.target.mode === "compare" &&
		tab.target.baseRef === target.baseRef &&
		tab.target.headRef === target.headRef
	);
}

function updateTabInState(
	state: PersistedReviewTabsState,
	tabId: string,
	mapper: (tab: ReviewTab) => ReviewTab,
): PersistedReviewTabsState {
	const nextTabs = state.tabs.map((tab) => (tab.id === tabId ? mapper(tab) : tab));
	return normalizeTabsState({
		...state,
		tabs: nextTabs,
	});
}

function setActiveTabId(
	state: PersistedReviewTabsState,
	tabId: string,
): PersistedReviewTabsState {
	if (!state.tabs.some((tab) => tab.id === tabId)) {
		return state;
	}

	return normalizeTabsState({
		...state,
		activeTabId: tabId,
	});
}

export function getRelativeReviewTabId(
	tabs: ReviewTab[],
	activeTabId: string | null,
	offset: number,
): string | null {
	if (tabs.length === 0) {
		return null;
	}

	if (tabs.length === 1) {
		return tabs[0]?.id ?? activeTabId;
	}

	const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
	const startIndex = currentIndex >= 0 ? currentIndex : 0;
	const nextIndex = (startIndex + offset + tabs.length) % tabs.length;
	return tabs[nextIndex]?.id ?? tabs[startIndex]?.id ?? null;
}

function setRelativeActiveTab(
	state: PersistedReviewTabsState,
	offset: number,
): PersistedReviewTabsState {
	if (state.tabs.length <= 1) {
		return state;
	}

	const nextTabId = getRelativeReviewTabId(state.tabs, state.activeTabId, offset);

	return nextTabId ? setActiveTabId(state, nextTabId) : state;
}

function appendTab(
	state: PersistedReviewTabsState,
	tab: ReviewTab,
): PersistedReviewTabsState {
	return normalizeTabsState({
		version: REVIEW_TABS_STORAGE_VERSION,
		activeTabId: tab.id,
		tabs: [...state.tabs, tab],
	});
}

function removeTab(
	state: PersistedReviewTabsState,
	tabId: string,
): PersistedReviewTabsState {
	const currentIndex = state.tabs.findIndex((tab) => tab.id === tabId);
	if (currentIndex < 0) {
		return state;
	}

	const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
	if (!nextTabs.length) {
		return createEmptyTabsState();
	}

	const nextActiveTabId =
		state.activeTabId === tabId
			? nextTabs[Math.min(currentIndex, nextTabs.length - 1)]?.id ?? null
			: state.activeTabId;

	return normalizeTabsState({
		version: REVIEW_TABS_STORAGE_VERSION,
		activeTabId: nextActiveTabId,
		tabs: nextTabs,
	});
}

function applySessionToTab(tab: ReviewTab, session: ReviewSession): ReviewTab {
	const latestRun = session.runs[0] ?? null;
	return {
		...tab,
		sessionId: session.id,
		sessionStatus: session.status,
		sessionBaseHeadSha: session.base_head_sha,
		sessionHeadHeadSha: session.head_head_sha,
		latestRunId: latestRun?.id ?? null,
		latestRunStatus: latestRun?.status ?? null,
		latestSummary: latestRun?.result?.summary ?? null,
		latestFindingsCount: latestRun?.result?.findings.length ?? 0,
		updatedAt: session.updated_at ?? nowIso(),
	};
}

function hasActiveRun(tab: ReviewTab): boolean {
	return Boolean(tab.latestRunStatus && ACTIVE_RUN_STATUSES.has(tab.latestRunStatus));
}

function buildRouteTargetFromTab(tab: ReviewTab): ReviewRouteTarget {
	if (tab.target.mode === "commit") {
		return {
			mode: "commit",
			commitSha: tab.target.commitSha,
			searchContext: tab.target.searchContext ?? null,
		};
	}

	return {
		mode: "compare",
		baseRef: tab.target.baseRef || null,
		headRef: tab.target.headRef || null,
	};
}

function updateCommitSearchContext(
	tab: ReviewTab,
	target: CommitReviewTabTarget,
): ReviewTab {
	if (tab.target.mode !== "commit") {
		return tab;
	}

	return {
		...tab,
		target: {
			...tab.target,
			searchContext: target.searchContext ?? null,
		},
		updatedAt: nowIso(),
	};
}

function createRouteBackedTab(target: ReviewRouteTarget): ReviewTab {
	if (target.mode === "commit") {
		return createReviewTab({
			mode: "commit",
			commitSha: target.commitSha,
			searchContext: target.searchContext ?? null,
		});
	}

	return createReviewTab({
		mode: "compare",
		baseRef: target.baseRef ?? "",
		headRef: target.headRef ?? "",
	});
}

function resolveRouteTabsState(input: {
	state: PersistedReviewTabsState;
	repoPath?: string | null;
	reviewTarget: ReviewRouteTarget;
	routeTabId?: string | null;
}): PersistedReviewTabsState {
	const state = normalizeTabsState(input.state);
	const { reviewTarget, routeTabId } = input;

	if (routeTabId) {
		const routeTab = findTabById(state, routeTabId);
		if (routeTab) {
			return setActiveTabId(state, routeTab.id);
		}

		if (state.tabs.length > 0) {
			return state;
		}

		const fallbackTab = createReviewTab(buildDefaultCompareTarget(input.repoPath));
		return appendTab(createEmptyTabsState(), fallbackTab);
	}

	if (isCompleteReviewTarget(reviewTarget)) {
		const activeTab = getActiveTab(state);
		if (activeTab && tabMatchesTarget(activeTab, reviewTarget)) {
			if (reviewTarget.mode === "commit") {
				return updateTabInState(state, activeTab.id, (tab) =>
					updateCommitSearchContext(tab, reviewTarget),
				);
			}

			return state;
		}

		const matchingTab = state.tabs.find((tab) => tabMatchesTarget(tab, reviewTarget));
		if (matchingTab) {
			if (reviewTarget.mode === "commit") {
				return setActiveTabId(
					updateTabInState(state, matchingTab.id, (tab) =>
						updateCommitSearchContext(tab, reviewTarget),
					),
					matchingTab.id,
				);
			}

			return setActiveTabId(state, matchingTab.id);
		}

		return appendTab(state, createRouteBackedTab(reviewTarget));
	}

	if (state.tabs.length > 0) {
		return state;
	}

	return appendTab(createEmptyTabsState(), createReviewTab(buildDefaultCompareTarget(input.repoPath)));
}

async function cancelTabRun(tab: ReviewTab): Promise<void> {
	if (!tab.sessionId || !tab.latestRunId || !hasActiveRun(tab)) {
		return;
	}

	await cancelReviewRun({
		sessionId: tab.sessionId,
		runId: tab.latestRunId,
	});
}

export function useReviewTabs({
	repoPath,
	reviewTarget,
	routeTabId = null,
	branches,
	commits,
	isRepoLoading,
	navigate,
}: UseReviewTabsArgs): UseReviewTabsReturn {
	const tabsStorageKey = useMemo(() => getReviewTabsStorageKey(repoPath), [repoPath]);
	const reviewRefsStorageKey = useMemo(
		() => getReviewRefsStorageKey(repoPath),
		[repoPath],
	);
	const [tabsState, setTabsState] = useState<PersistedReviewTabsState>(() =>
		getStoredReviewTabsState(tabsStorageKey) ?? createEmptyTabsState(),
	);
	const tabsStateRef = useRef(tabsState);
	const previousTabsStorageKeyRef = useRef(tabsStorageKey);

	useEffect(() => {
		tabsStateRef.current = tabsState;
	}, [tabsState]);

	useEffect(() => {
		if (previousTabsStorageKeyRef.current === tabsStorageKey) {
			return;
		}

		previousTabsStorageKeyRef.current = tabsStorageKey;
		setTabsState(getStoredReviewTabsState(tabsStorageKey) ?? createEmptyTabsState());
	}, [tabsStorageKey]);

	useEffect(() => {
		if (!repoPath) {
			return;
		}

		setTabsState((current) => {
			const next = resolveRouteTabsState({
				state: current,
				repoPath,
				reviewTarget,
				routeTabId,
			});
			return areTabsStatesEqual(current, next) ? current : next;
		});
	}, [repoPath, reviewTarget, routeTabId]);

	const activeTab = useMemo(() => getActiveTab(tabsState), [tabsState]);
	const activeTarget = activeTab?.target ?? null;

	useEffect(() => {
		persistStoredReviewTabsState(tabsStorageKey, tabsState);
	}, [tabsState, tabsStorageKey]);

	useEffect(() => {
		if (activeTarget?.mode !== "compare") {
			return;
		}

		persistStoredReviewRefs(reviewRefsStorageKey, {
			baseRef: activeTarget.baseRef,
			headRef: activeTarget.headRef,
		});
	}, [activeTarget, reviewRefsStorageKey]);

	useEffect(() => {
		if (!repoPath || !activeTab) {
			return;
		}

		const nextRoute = buildReviewRoute(repoPath, buildRouteTargetFromTab(activeTab), {
			tabId: activeTab.id,
		});
		const currentRoute = buildReviewRoute(repoPath, reviewTarget, {
			tabId: routeTabId,
		});

		if (nextRoute === currentRoute) {
			return;
		}

		navigate(nextRoute, { replace: true });
	}, [activeTab, navigate, repoPath, reviewTarget, routeTabId]);

	useEffect(() => {
		if (
			!activeTab ||
			activeTab.target.mode !== "compare" ||
			hasActiveRun(activeTab) ||
			isRepoLoading
		) {
			return;
		}

		// Avoid clearing restored refs during the initial empty-data hydration pass.
		if (branches.length === 0 && commits.length === 0) {
			return;
		}

		const validBranchNames = new Set(
			branches
				.map((branch) => branch.name)
				.filter((name) => name && name !== DETACHED_HEAD_LABEL),
		);
		const nextBaseRef = validBranchNames.has(activeTab.target.baseRef)
			? activeTab.target.baseRef
			: "";
		const nextHeadRef = validBranchNames.has(activeTab.target.headRef)
			? activeTab.target.headRef
			: "";

		if (
			nextBaseRef === activeTab.target.baseRef &&
			nextHeadRef === activeTab.target.headRef
		) {
			return;
		}

		setTabsState((current) =>
			updateTabInState(current, activeTab.id, (tab) => {
				if (tab.target.mode !== "compare") {
					return tab;
				}

				return clearReviewTabSessionSnapshot({
					...tab,
					target: {
						mode: "compare",
						baseRef: nextBaseRef,
						headRef: nextHeadRef,
					},
					updatedAt: nowIso(),
				});
			}),
		);
	}, [activeTab, branches, commits.length, isRepoLoading]);

	useEffect(() => {
		if (!repoPath) {
			return;
		}

		const refreshTimers = new Map<string, number>();
		const unsubscribe = onReviewRuntimeEvent((event) => {
			if (event.type !== "review-runtime-changed" || !event.sessionId) {
				return;
			}

			const currentState = tabsStateRef.current;
			const matchingTab = currentState.tabs.find(
				(tab) => tab.sessionId === event.sessionId && tab.id !== currentState.activeTabId,
			);
			if (!matchingTab) {
				return;
			}

			const existingTimer = refreshTimers.get(event.sessionId);
			if (existingTimer != null) {
				window.clearTimeout(existingTimer);
			}

			const timerId = window.setTimeout(() => {
				void getReviewSession(event.sessionId as string)
					.then((session) => {
						setTabsState((current) => {
							const tab = current.tabs.find(
								(item) => item.sessionId === session.id && item.id !== current.activeTabId,
							);
							if (!tab) {
								return current;
							}

							return updateTabInState(current, tab.id, (currentTab) =>
								applySessionToTab(currentTab, session),
							);
						});
					})
					.catch(() => {
						// Ignore background refresh failures for inactive tabs.
					})
					.finally(() => {
						refreshTimers.delete(event.sessionId as string);
					});
			}, 180);

			refreshTimers.set(event.sessionId, timerId);
		});

		return () => {
			unsubscribe();
			refreshTimers.forEach((timerId) => window.clearTimeout(timerId));
			refreshTimers.clear();
		};
	}, [repoPath]);

	const activateTab = useCallback((tabId: string) => {
		setTabsState((current) => setActiveTabId(current, tabId));
	}, []);
	const activateNextTab = useCallback(() => {
		setTabsState((current) => setRelativeActiveTab(current, 1));
	}, []);
	const activatePreviousTab = useCallback(() => {
		setTabsState((current) => setRelativeActiveTab(current, -1));
	}, []);

	const createCompareTab = useCallback(() => {
		const baseTarget: CompareReviewTabTarget =
			activeTab?.target.mode === "compare"
				? activeTab.target
				: buildDefaultCompareTarget(repoPath);
		const nextTab = createReviewTab({
			mode: "compare",
			baseRef: baseTarget.baseRef,
			headRef: baseTarget.headRef,
		});

		setTabsState((current) => appendTab(current, nextTab));
	}, [activeTab, repoPath]);

	const closeTab = useCallback(
		async (tabId: string) => {
			const currentTab = tabsStateRef.current.tabs.find((tab) => tab.id === tabId);
			if (!currentTab) {
				return;
			}

			if (hasActiveRun(currentTab)) {
				const confirmed = window.confirm(
					"This review tab still has an active run. Cancel the run and close the tab?",
				);
				if (!confirmed) {
					return;
				}

				try {
					await cancelTabRun(currentTab);
				} catch (error) {
					toast.error(getErrorMessage(error), { theme: "dark" });
					return;
				}
			}

			setTabsState((current) => {
				const next = removeTab(current, tabId);
				if (next.tabs.length > 0) {
					return next;
				}

				return appendTab(next, createReviewTab(buildDefaultCompareTarget(repoPath)));
			});
		},
		[repoPath],
	);

	const updateActiveCompareRefs = useCallback(
		async (nextBaseRef: string, nextHeadRef: string) => {
			const currentTab = tabsStateRef.current.tabs.find(
				(tab) => tab.id === tabsStateRef.current.activeTabId,
			);
			if (!currentTab || currentTab.target.mode !== "compare") {
				return;
			}

			if (
				currentTab.target.baseRef === nextBaseRef &&
				currentTab.target.headRef === nextHeadRef
			) {
				return;
			}

			const nextTarget: ReviewTabTarget = {
				mode: "compare",
				baseRef: nextBaseRef,
				headRef: nextHeadRef,
			};
			const matchingTab = isCompleteReviewTarget(nextTarget)
				? tabsStateRef.current.tabs.find(
						(tab) => tab.id !== currentTab.id && tabMatchesTarget(tab, nextTarget),
				  ) ?? null
				: null;

			if (matchingTab) {
				if (hasActiveRun(currentTab)) {
					const confirmed = window.confirm(
						"This tab has an active review run. Cancel it and switch to the existing review tab instead?",
					);
					if (!confirmed) {
						return;
					}

					try {
						await cancelTabRun(currentTab);
					} catch (error) {
						toast.error(getErrorMessage(error), { theme: "dark" });
						return;
					}
				}

				setTabsState((current) =>
					setActiveTabId(removeTab(current, currentTab.id), matchingTab.id),
				);
				return;
			}

			setTabsState((current) =>
				updateTabInState(current, currentTab.id, (tab) => {
					if (tab.target.mode !== "compare") {
						return tab;
					}

					return clearReviewTabSessionSnapshot({
						...tab,
						target: nextTarget,
						updatedAt: nowIso(),
					});
				}),
			);
		},
		[],
	);

	const syncActiveTabSession = useCallback(
		(session: ReviewSession | null | undefined) => {
			if (!session) {
				return;
			}

			setTabsState((current) => {
				const currentTab = getActiveTab(current);
				if (!currentTab) {
					return current;
				}

				return updateTabInState(current, currentTab.id, (tab) =>
					applySessionToTab(tab, session),
				);
			});
		},
		[],
	);

	return {
		tabs: tabsState.tabs,
		activeTab,
		activeTabId: tabsState.activeTabId,
		activeTarget,
		activateTab,
		activateNextTab,
		activatePreviousTab,
		createCompareTab,
		closeTab,
		updateActiveCompareRefs,
		syncActiveTabSession,
	};
}
