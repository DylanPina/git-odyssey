export type Branch = {
	name: string;
	commits: string[];
};

export type FileHunk = {
	id: number;
	commit_sha: string;
	content?: string;
	diff_embedding?: number[] | null;
	new_lines: number;
	new_start: number;
	old_lines: number;
	old_start: number;
	summary?: string;
};

export type FileSnapshot = {
	id: number;
	path: string;
	content: string;
	previous_snapshot?: FileSnapshot | null;
	commit_sha: string;
};

export type FileChange = {
	id?: number;
	commit_sha: string;
	embedding?: number[] | null;
	hunks: FileHunk[];
	path: string;
	status: string;
	snapshot?: FileSnapshot | null;
	summary?: string;
};

export type Commit = {
	sha: string;
	message: string;
	author: string | null;
	time: number;
	file_changes: FileChange[];
	parents: string[];
	embedding?: number[] | null;
	summary?: string | null;
};
