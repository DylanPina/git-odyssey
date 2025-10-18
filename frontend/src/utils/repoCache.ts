import type { Commit, Branch } from "@/lib/definitions/repo";

export interface CachedRepoData {
	commits: Commit[];
	branches: Branch[];
	timestamp: number;
}

export interface CompressedCachedData {
	timestamp: number;
	commits: Array<{
		sha: string;
		message: string;
		time: number;
		parents: string[];
	}>;
	branches: Array<{
		name: string;
		commits: string[];
	}>;
}

class RepoCache {
	private readonly CACHE_PREFIX = "git-odyssey-repo-cache:";
	private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
	private memoryCache = new Map<string, CachedRepoData>();
	private useMemoryCache = false;

	/**
	 * Get cached data for a repository
	 */
	get(cacheKey: string): CachedRepoData | null {
		// If using memory cache, get from memory
		if (this.useMemoryCache) {
			return this.memoryCache.get(cacheKey) || null;
		}

		// Try localStorage first
		try {
			const cached = localStorage.getItem(`${this.CACHE_PREFIX}${cacheKey}`);
			if (cached) {
				const parsed = JSON.parse(cached) as CompressedCachedData;
				// Convert back to full data structure with all required fields
				return {
					timestamp: parsed.timestamp,
					commits: parsed.commits.map((c) => ({
						...c,
						author: "",
						file_changes: [],
						embedding: "",
						summary: "",
					})),
					branches: parsed.branches,
				};
			}
		} catch (error) {
			console.warn("Failed to parse cached data from localStorage:", error);
			// Fallback to memory cache
			this.useMemoryCache = true;
			return this.memoryCache.get(cacheKey) || null;
		}
		return null;
	}

	/**
	 * Set cached data for a repository
	 */
	set(cacheKey: string, data: CachedRepoData): void {
		// If using memory cache, save to memory
		if (this.useMemoryCache) {
			this.memoryCache.set(cacheKey, data);
			return;
		}

		try {
			// Compress the data by removing unnecessary fields to reduce size
			const compressedData: CompressedCachedData = {
				timestamp: data.timestamp,
				commits: data.commits.map((commit) => ({
					sha: commit.sha,
					message: commit.message,
					time: commit.time,
					parents: commit.parents,
					// Remove other fields that might not be essential for caching
				})),
				branches: data.branches.map((branch) => ({
					name: branch.name,
					commits: branch.commits,
					// Keep only essential branch data
				})),
			};

			// Try to save to localStorage
			try {
				localStorage.setItem(
					`${this.CACHE_PREFIX}${cacheKey}`,
					JSON.stringify(compressedData)
				);
			} catch {
				console.warn(
					"localStorage quota exceeded, switching to memory cache..."
				);

				// Switch to memory cache for this session
				this.useMemoryCache = true;
				this.memoryCache.set(cacheKey, data);

				// Clean up localStorage to free space for future use
				this.clearLocalStorage();
			}
		} catch (error) {
			console.warn(
				"Failed to cache data, falling back to memory cache:",
				error
			);
			this.useMemoryCache = true;
			this.memoryCache.set(cacheKey, data);
		}
	}

	/**
	 * Check if cached data is still valid (not expired)
	 */
	isValid(cachedData: CachedRepoData | null): boolean {
		if (!cachedData) return false;
		const now = Date.now();
		return now - cachedData.timestamp < this.CACHE_DURATION;
	}

	/**
	 * Clear cache entries
	 */
	clear(cacheKey?: string): void {
		try {
			// Clear memory cache
			if (cacheKey) {
				this.memoryCache.delete(cacheKey);
			} else {
				this.memoryCache.clear();
			}

			// Clear localStorage cache
			if (cacheKey) {
				localStorage.removeItem(`${this.CACHE_PREFIX}${cacheKey}`);
			} else {
				this.clearLocalStorage();
			}
		} catch (error) {
			console.warn("Failed to clear cache:", error);
		}
	}

	/**
	 * Clear all localStorage entries with our prefix
	 */
	private clearLocalStorage(): void {
		const allKeys = Object.keys(localStorage).filter((key) =>
			key.startsWith(this.CACHE_PREFIX)
		);
		allKeys.forEach((key) => localStorage.removeItem(key));
	}

	/**
	 * Get cache statistics
	 */
	getStats(): {
		memorySize: number;
		localStorageSize: number;
		useMemoryCache: boolean;
	} {
		const localStorageKeys = Object.keys(localStorage).filter((key) =>
			key.startsWith(this.CACHE_PREFIX)
		);
		return {
			memorySize: this.memoryCache.size,
			localStorageSize: localStorageKeys.length,
			useMemoryCache: this.useMemoryCache,
		};
	}
}

// Export a singleton instance
export const repoCache = new RepoCache();
