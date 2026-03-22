import { useEffect, useMemo, useState } from "react";
import {
	ChevronDown,
	ChevronRight,
	FileCode2,
	Folder,
	FolderOpen,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { FileChange } from "@/lib/definitions/repo";
import {
	buildCommitFileTree,
	getFileChangeLabelPath,
	normalizeDiffFileStatus,
	type CommitFileTreeNode,
	type DiffFileStatus,
} from "@/lib/diff";

type CommitFileTreeProps = {
	files: FileChange[];
	totalFileCount: number;
	selectedFilePath: string | null;
	forceExpandAll?: boolean;
	onSelectFile: (path: string) => void;
};

function getStatusDotClass(status?: DiffFileStatus) {
	if (status === "added") {
		return "bg-success";
	}

	if (status === "deleted") {
		return "bg-danger";
	}

	if (status === "renamed") {
		return "bg-accent";
	}

	return "bg-text-tertiary";
}

function collectFolderPaths(nodes: CommitFileTreeNode[]): string[] {
	const folderPaths: string[] = [];

	const visit = (treeNodes: CommitFileTreeNode[]) => {
		treeNodes.forEach((node) => {
			if (node.kind === "folder") {
				folderPaths.push(node.path);
				visit(node.children);
			}
		});
	};

	visit(nodes);

	return folderPaths;
}

export function CommitFileTree({
	files,
	totalFileCount,
	selectedFilePath,
	forceExpandAll = false,
	onSelectFile,
}: CommitFileTreeProps) {
	const treeNodes = useMemo(
		() =>
			buildCommitFileTree(
				files.map((fileChange) => ({
					path: getFileChangeLabelPath(fileChange),
					status: normalizeDiffFileStatus(fileChange.status),
				})),
			),
		[files],
	);
	const folderPaths = useMemo(() => collectFolderPaths(treeNodes), [treeNodes]);
	const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

	useEffect(() => {
		if (folderPaths.length === 0) {
			setOpenFolders({});
			return;
		}

		setOpenFolders((prev) => {
			const next: Record<string, boolean> = {};
			folderPaths.forEach((path) => {
				next[path] = prev[path] ?? true;
			});
			return next;
		});
	}, [folderPaths]);

	const renderNodes = (nodes: CommitFileTreeNode[], depth = 0) =>
		nodes.map((node) => {
			const paddingLeft = `${0.6 + depth * 0.8}rem`;

			if (node.kind === "folder") {
				const isOpen = forceExpandAll || (openFolders[node.path] ?? true);

				return (
					<div key={node.id}>
						<button
							type="button"
							className={cn(
								"flex w-full items-center gap-2 rounded-[10px] py-2 pr-2 text-left text-sm text-text-secondary transition-colors hover:bg-control hover:text-text-primary",
								isOpen && "text-text-primary",
							)}
							style={{ paddingLeft }}
							onClick={() => {
								if (forceExpandAll) return;
								setOpenFolders((prev) => ({
									...prev,
									[node.path]: !(prev[node.path] ?? true),
								}));
							}}
						>
							<span className="flex size-4 items-center justify-center text-text-tertiary">
								{isOpen ? (
									<ChevronDown className="size-3.5" />
								) : (
									<ChevronRight className="size-3.5" />
								)}
							</span>
							{isOpen ? (
								<FolderOpen className="size-4 shrink-0 text-text-tertiary" />
							) : (
								<Folder className="size-4 shrink-0 text-text-tertiary" />
							)}
							<span className="truncate">{node.name}</span>
						</button>

						{isOpen ? <div>{renderNodes(node.children, depth + 1)}</div> : null}
					</div>
				);
			}

			const isSelected = selectedFilePath === node.path;

			return (
				<button
					key={node.id}
					type="button"
					className={cn(
						"flex w-full items-center gap-2 rounded-[10px] py-2 pr-2 text-left text-sm transition-colors",
						isSelected
							? "bg-[rgba(122,162,255,0.14)] text-text-primary"
							: "text-text-secondary hover:bg-control hover:text-text-primary",
					)}
					style={{ paddingLeft }}
					onClick={() => onSelectFile(node.path)}
					aria-current={isSelected ? "true" : undefined}
				>
					<span
						className={cn(
							"ml-1 size-2 shrink-0 rounded-full",
							getStatusDotClass(node.status),
						)}
					/>
					<FileCode2 className="size-4 shrink-0 text-text-tertiary" />
					<span className="truncate font-mono text-[12px]">{node.name}</span>
				</button>
			);
		});

	return (
		<aside className="workspace-panel flex min-h-[15rem] flex-col overflow-hidden xl:min-h-0 xl:w-[19rem] xl:min-w-[19rem]">
			<div className="border-b border-border-subtle px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<div className="workspace-section-label">Changed Files</div>
					<div className="font-mono text-xs text-text-tertiary">
						{files.length} / {totalFileCount}
					</div>
				</div>
			</div>

			<div className="workspace-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
				{treeNodes.length > 0 ? (
					<div>{renderNodes(treeNodes)}</div>
				) : (
					<div className="px-3 py-4 text-sm text-text-secondary">
						No matching files.
					</div>
				)}
			</div>
		</aside>
	);
}

export default CommitFileTree;
