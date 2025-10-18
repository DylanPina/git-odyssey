import type { FileChange, Branch, Commit } from "@/lib/definitions/repo";

export interface FilterFormData {
	message: string;
	branch: string;
	commit: string;
	file: string;
	summary: string;
	startDate: string;
	endDate: string;
}

/**
 * Filters commits based on the provided filter criteria
 * @param commits - Array of commits to filter
 * @param filters - Filter criteria to apply
 * @param branches - Array of branches with associated commits
 * @returns Filtered array of commits
 */
export function filterCommits(
	commits: Commit[],
	filters: FilterFormData,
	branches: Branch[]
): Commit[] {
	// Return all commits if no filters are applied
	if (
		!filters.message &&
		!filters.branch &&
		!filters.commit &&
		!filters.file &&
		!filters.summary &&
		!filters.startDate &&
		!filters.endDate
	) {
		return commits;
	}

	return commits.filter((commit) => {
		// Filter by commit message (case-insensitive)
		const messageMatch =
			!filters.message ||
			commit.message.toLowerCase().includes(filters.message.toLowerCase());

		// Filter by branch name (case-insensitive)
		const branchMatch = filterByBranch(commit.sha, filters.branch, branches);

		// Filter by commit hash (case-insensitive, partial match)
		const commitMatch =
			!filters.commit ||
			commit.sha.toLowerCase().includes(filters.commit.toLowerCase());

		// Filter by file path (case-insensitive)
		const fileMatch =
			!filters.file ||
			commit.file_changes.some(
				(fileChange: FileChange) =>
					fileChange.new_path
						.toLowerCase()
						.includes(filters.file.toLowerCase()) ||
					fileChange.old_path
						?.toLowerCase()
						.includes(filters.file.toLowerCase())
			);

		// Filter by summary (case-insensitive)
		const summaryMatch =
			!filters.summary ||
			commit.summary?.toLowerCase().includes(filters.summary.toLowerCase());

		// Filter by date range
		const dateMatch = filterByDateRange(
			commit.time,
			filters.startDate,
			filters.endDate
		);

		return (
			messageMatch &&
			branchMatch &&
			commitMatch &&
			fileMatch &&
			summaryMatch &&
			dateMatch
		);
	});
}

/**
 * Filters commits by date range
 * @param commitTimestamp - Unix timestamp of the commit
 * @param startDate - Start date filter (ISO string)
 * @param endDate - End date filter (ISO string)
 * @returns Whether the commit falls within the date range
 */
function filterByDateRange(
	commitTimestamp: number,
	startDate: string,
	endDate: string
): boolean {
	if (!startDate && !endDate) {
		return true; // No date filtering
	}

	const commitDate = new Date(commitTimestamp * 1000); // Convert Unix timestamp to Date
	const start = startDate ? new Date(startDate) : null;
	const end = endDate ? new Date(endDate) : null;

	// If only start date is provided
	if (start && !end) {
		return commitDate >= start;
	}

	// If only end date is provided
	if (!start && end) {
		return commitDate <= end;
	}

	// If both dates are provided
	if (start && end) {
		return commitDate >= start && commitDate <= end;
	}

	return true;
}

/**
 * Filters commits by branch name
 * @param commitSha - SHA of the commit to check
 * @param branchName - Branch name to filter by (case-insensitive)
 * @param branches - Array of branches with associated commits
 * @returns Whether the commit belongs to the specified branch
 */
function filterByBranch(
	commitSha: string,
	branchName: string,
	branches: Branch[]
): boolean {
	if (!branchName) {
		return true; // No branch filtering
	}

	// Find the branch by name (case-insensitive)
	const branch = branches.find(
		(b) => b.name.toLowerCase() === branchName.toLowerCase()
	);

	if (!branch) {
		return false; // Branch not found
	}

	// Check if the commit SHA is in the branch's commits array
	return branch.commits.includes(commitSha);
}

/**
 * Checks if any filters are currently applied
 * @param filters - Filter criteria to check
 * @returns Whether any filters have values
 */
export function hasActiveFilters(filters: FilterFormData): boolean {
	return !!(
		filters.message ||
		filters.branch ||
		filters.commit ||
		filters.file ||
		filters.summary ||
		filters.startDate ||
		filters.endDate
	);
}
