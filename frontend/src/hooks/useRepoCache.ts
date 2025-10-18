import { useCallback } from "react";
import { repoCache, type CachedRepoData } from "@/utils/repoCache";

/**
 * Hook for repository caching operations
 * Provides a convenient interface to the repoCache utility
 */
export function useRepoCache() {
	const get = useCallback((cacheKey: string): CachedRepoData | null => {
		return repoCache.get(cacheKey);
	}, []);

	const set = useCallback((cacheKey: string, data: CachedRepoData): void => {
		repoCache.set(cacheKey, data);
	}, []);

	const isValid = useCallback((data: CachedRepoData | null): boolean => {
		return repoCache.isValid(data);
	}, []);

	const clear = useCallback((cacheKey?: string): void => {
		repoCache.clear(cacheKey);
	}, []);

	const getStats = useCallback(() => {
		return repoCache.getStats();
	}, []);

	return {
		get,
		set,
		isValid,
		clear,
		getStats,
	};
}
