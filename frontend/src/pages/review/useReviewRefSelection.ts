import { useCallback, useEffect, useMemo, useState } from "react";
import type { NavigateFunction } from "react-router-dom";

import type { Branch, Commit } from "@/lib/definitions/repo";
import { buildReviewRoute } from "@/lib/repoPaths";
import { DETACHED_HEAD_LABEL } from "@/pages/review/review-constants";
import {
	getReviewRefsStorageKey,
	getStoredReviewRefs,
	persistStoredReviewRefs,
} from "@/pages/review/review-storage";

type UseReviewRefSelectionArgs = {
	repoPath?: string | null;
	queryBaseRef?: string | null;
	queryHeadRef?: string | null;
	branches: Branch[];
	commits: Commit[];
	isRepoLoading: boolean;
	navigate: NavigateFunction;
};

export function useReviewRefSelection({
	repoPath,
	queryBaseRef,
	queryHeadRef,
	branches,
	commits,
	isRepoLoading,
	navigate,
}: UseReviewRefSelectionArgs) {
	const [baseRef, setBaseRef] = useState(queryBaseRef ?? "");
	const [headRef, setHeadRef] = useState(queryHeadRef ?? "");
	const reviewRefsStorageKey = useMemo(
		() => getReviewRefsStorageKey(repoPath),
		[repoPath],
	);

	const branchOptions = useMemo(
		() =>
			Array.from(
				new Set(
					branches
						.map((branch) => branch.name)
						.filter((name) => name && name !== DETACHED_HEAD_LABEL),
				),
			).sort((left, right) =>
				left.localeCompare(right, undefined, {
					numeric: true,
					sensitivity: "base",
				}),
			),
		[branches],
	);
	const branchOptionSet = useMemo(() => new Set(branchOptions), [branchOptions]);
	const commitBySha = useMemo(
		() => new Map(commits.map((commit) => [commit.sha, commit])),
		[commits],
	);
	const branchByName = useMemo(
		() => new Map(branches.map((branch) => [branch.name, branch])),
		[branches],
	);

	const resolveBranchTipCommit = useCallback(
		(refName: string) => {
			if (!refName) {
				return null;
			}

			const tipSha = branchByName.get(refName)?.commits?.[0];
			if (!tipSha) {
				return null;
			}

			return commitBySha.get(tipSha) ?? null;
		},
		[branchByName, commitBySha],
	);

	const baseTipCommit = useMemo(
		() => resolveBranchTipCommit(baseRef),
		[baseRef, resolveBranchTipCommit],
	);
	const headTipCommit = useMemo(
		() => resolveBranchTipCommit(headRef),
		[headRef, resolveBranchTipCommit],
	);

	const updateRoute = useCallback(
		(nextBaseRef: string, nextHeadRef: string) => {
			if (!repoPath) {
				return;
			}

			navigate(
				buildReviewRoute(repoPath, nextBaseRef || null, nextHeadRef || null),
				{
					replace: true,
				},
			);
		},
		[navigate, repoPath],
	);

	const setStoredReviewRefs = useCallback(
		(nextBaseRef: string, nextHeadRef: string) => {
			persistStoredReviewRefs(reviewRefsStorageKey, {
				baseRef: nextBaseRef,
				headRef: nextHeadRef,
			});
		},
		[reviewRefsStorageKey],
	);

	useEffect(() => {
		const storedReviewRefs = getStoredReviewRefs(reviewRefsStorageKey);
		const nextBaseRef = queryBaseRef ?? storedReviewRefs?.baseRef ?? "";
		const nextHeadRef = queryHeadRef ?? storedReviewRefs?.headRef ?? "";

		setBaseRef((current) => (current === nextBaseRef ? current : nextBaseRef));
		setHeadRef((current) => (current === nextHeadRef ? current : nextHeadRef));
		setStoredReviewRefs(nextBaseRef, nextHeadRef);

		if (
			repoPath &&
			(queryBaseRef == null || queryHeadRef == null) &&
			((queryBaseRef ?? "") !== nextBaseRef ||
				(queryHeadRef ?? "") !== nextHeadRef)
		) {
			updateRoute(nextBaseRef, nextHeadRef);
		}
	}, [
		queryBaseRef,
		queryHeadRef,
		repoPath,
		reviewRefsStorageKey,
		setStoredReviewRefs,
		updateRoute,
	]);

	useEffect(() => {
		if (isRepoLoading) {
			return;
		}

		// The repo hook starts with empty arrays before hydration kicks in. Avoid
		// clearing restored refs during that transient state, especially when
		// revisiting the page via browser history.
		if (branches.length === 0 && commits.length === 0) {
			return;
		}

		const nextBaseRef = baseRef && branchOptionSet.has(baseRef) ? baseRef : "";
		const nextHeadRef = headRef && branchOptionSet.has(headRef) ? headRef : "";

		if (nextBaseRef === baseRef && nextHeadRef === headRef) {
			return;
		}

		setBaseRef(nextBaseRef);
		setHeadRef(nextHeadRef);
		setStoredReviewRefs(nextBaseRef, nextHeadRef);

		if (
			repoPath &&
			((queryBaseRef ?? "") !== nextBaseRef ||
				(queryHeadRef ?? "") !== nextHeadRef)
		) {
			updateRoute(nextBaseRef, nextHeadRef);
		}
	}, [
		baseRef,
		branches.length,
		branchOptionSet,
		commits.length,
		headRef,
		isRepoLoading,
		queryBaseRef,
		queryHeadRef,
		repoPath,
		setStoredReviewRefs,
		updateRoute,
	]);

	const handleBaseRefChange = useCallback(
		(nextBaseRef: string) => {
			setBaseRef(nextBaseRef);
			setStoredReviewRefs(nextBaseRef, headRef);
			updateRoute(nextBaseRef, headRef);
		},
		[headRef, setStoredReviewRefs, updateRoute],
	);

	const handleHeadRefChange = useCallback(
		(nextHeadRef: string) => {
			setHeadRef(nextHeadRef);
			setStoredReviewRefs(baseRef, nextHeadRef);
			updateRoute(baseRef, nextHeadRef);
		},
		[baseRef, setStoredReviewRefs, updateRoute],
	);

	return {
		baseRef,
		headRef,
		branchOptions,
		baseTipCommit,
		headTipCommit,
		handleBaseRefChange,
		handleHeadRefChange,
	};
}
