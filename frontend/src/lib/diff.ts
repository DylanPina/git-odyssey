import type { FileHunk } from "@/lib/definitions/repo";

export function inferLanguage(path?: string): string | undefined {
	if (!path) return undefined;
	const ext = path.split(".").pop() || "";
	switch (ext) {
		case "ts":
		case "tsx":
			return "typescript";
		case "js":
		case "jsx":
			return "javascript";
		case "py":
			return "python";
		case "rb":
			return "ruby";
		case "go":
			return "go";
		case "rs":
			return "rust";
		case "java":
			return "java";
		case "cs":
			return "csharp";
		case "cpp":
		case "cc":
		case "cxx":
			return "cpp";
		case "c":
			return "c";
		case "json":
			return "json";
		case "yml":
		case "yaml":
			return "yaml";
		case "md":
			return "markdown";
		case "css":
			return "css";
		case "scss":
			return "scss";
		case "html":
			return "html";
		case "sql":
			return "sql";
		case "sh":
		case "bash":
			return "shell";
		default:
			return undefined;
	}
}

export function formatHunkLabel(hunk: FileHunk): string {
	const oldRange = `${hunk.old_start}${hunk.old_lines ? "," + hunk.old_lines : ""}`;
	const newRange = `${hunk.new_start}${hunk.new_lines ? "," + hunk.new_lines : ""}`;
	return `-${oldRange} +${newRange}`;
}
