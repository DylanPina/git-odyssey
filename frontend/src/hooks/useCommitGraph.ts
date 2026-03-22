import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { Branch, Commit } from "@/lib/definitions/repo";
import {
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  filterCommits,
  hasActiveFilters,
  type FilterFormData,
} from "@/lib/filter-utils";
import {
  layoutGraph,
  nodeDefaults,
  type LayoutDirection,
} from "@/lib/graph/layout";

type UseCommitGraphArgs = {
  commits: Commit[];
  branches: Branch[];
};

type UseCommitGraph = {
  nodes: Node[];
  edges: Edge[];
  filteredCommits: Commit[];
  focusedCommitSha: string | null;
  lastSearchQuery: string;
  layoutDirection: LayoutDirection;
  toggleLayoutDirection: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (params: Connection) => void;
  handleCommitClick: (commitSha: string) => void;
  handleCommitSummaryUpdate: (commitSha: string, summary: string) => void;
  handleFiltersChange: (filters: FilterFormData) => void;
  handleSearchResults: (commitShas: string[], query?: string) => void;
  handleClearFilters: () => void;
  reactFlowInstanceRef: MutableRefObject<ReactFlowInstance | null>;
};

function applySelectedCommitShas(nodes: Node[], selectedCommitShas: Set<string>) {
  let changed = false;

  const nextNodes = nodes.map((node) => {
    const selected = selectedCommitShas.has(node.id);
    if (node.selected === selected) {
      return node;
    }

    changed = true;
    return {
      ...node,
      selected,
    };
  });

  return changed ? nextNodes : nodes;
}

function clearSelectedNodes(nodes: Node[]) {
  let changed = false;

  const nextNodes = nodes.map((node) => {
    if (!node.selected) {
      return node;
    }

    changed = true;
    return {
      ...node,
      selected: false,
    };
  });

  return changed ? nextNodes : nodes;
}

const FOCUSED_COMMIT_ZOOM = 0.65;

function panToCommit(instance: ReactFlowInstance, commitSha: string, duration: number) {
  const target = instance.getInternalNode(commitSha);
  if (!target) {
    return;
  }

  const width = target.measured.width ?? target.width ?? 0;
  const height = target.measured.height ?? target.height ?? 0;
  const viewport = instance.getViewport();

  void instance.setCenter(
    target.internals.positionAbsolute.x + width / 2,
    target.internals.positionAbsolute.y + height / 2,
    {
      zoom: Math.max(viewport.zoom, FOCUSED_COMMIT_ZOOM),
      duration,
    }
  );
}

export function useCommitGraph({
  commits,
  branches,
}: UseCommitGraphArgs): UseCommitGraph {
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [filteredCommitShas, setFilteredCommitShas] = useState<string[] | null>(
    null
  );
  const [focusedCommitSha, setFocusedCommitSha] = useState<string | null>(null);
  const [lastSearchQuery, setLastSearchQuery] = useState<string>("");
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>("TB");
  const [hasAnimated, setHasAnimated] = useState<boolean>(false);
  const [summaryBySha, setSummaryBySha] = useState<Record<string, string | null>>(
    {}
  );

  const highlightedCommitShas = useMemo(
    () => (filteredCommitShas ? new Set(filteredCommitShas) : null),
    [filteredCommitShas]
  );

  const commitsWithLocalSummary = useMemo(
    () =>
      commits.map((commit) => {
        if (summaryBySha[commit.sha] === undefined) {
          return commit;
        }

        return {
          ...commit,
          summary: summaryBySha[commit.sha],
        };
      }),
    [commits, summaryBySha]
  );

  const filteredCommits = useMemo(() => {
    if (!highlightedCommitShas) {
      return commitsWithLocalSummary;
    }

    return commitsWithLocalSummary.filter((commit) =>
      highlightedCommitShas.has(commit.sha)
    );
  }, [commitsWithLocalSummary, highlightedCommitShas]);

  const handleCommitSummaryUpdate = useCallback(
    (commitSha: string, summary: string) => {
      setSummaryBySha((current) => ({
        ...current,
        [commitSha]: summary,
      }));

      setNodes((current) =>
        current.map((node) =>
          node.id === commitSha
            ? {
                ...node,
                data: {
                  ...node.data,
                  summary,
                },
              }
            : node
        )
      );
    },
    []
  );

  const graphFromCommits = useMemo(() => {
    const nodesFromCommits: Node[] = commitsWithLocalSummary.map((commit) => ({
      id: commit.sha,
      position: { x: 0, y: 0 },
      data: {
        sha: commit.sha,
        message: commit.message,
        author: commit.author,
        time: commit.time,
        summary: commit.summary || null,
        onUpdateSummary: handleCommitSummaryUpdate,
      },
      type: "commit",
      ...nodeDefaults,
    }));

    const edgesFromCommits: Edge[] = [];
    commitsWithLocalSummary.forEach((commit) => {
      if (commit.parents && commit.parents.length > 0) {
        commit.parents.forEach((parentSha, index) => {
          edgesFromCommits.push({
            id: `e-${commit.sha}-${parentSha}-${index}`,
            source: commit.sha,
            target: parentSha,
          });
        });
      }
    });

    return { nodes: nodesFromCommits, edges: edgesFromCommits };
  }, [commitsWithLocalSummary, handleCommitSummaryUpdate]);

  useEffect(() => {
    const visibleCommitShas = new Set(commits.map((commit) => commit.sha));

    setSummaryBySha((current) => {
      let changed = false;
      const next: Record<string, string | null> = {};

      Object.entries(current).forEach(([sha, summary]) => {
        if (visibleCommitShas.has(sha)) {
          next[sha] = summary;
          return;
        }

        changed = true;
      });

      return changed ? next : current;
    });

    setFilteredCommitShas(null);
    setLastSearchQuery("");
    setFocusedCommitSha((current) =>
      current && visibleCommitShas.has(current) ? current : null
    );
  }, [commits]);

  useEffect(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = layoutGraph(
      graphFromCommits.nodes,
      graphFromCommits.edges,
      layoutDirection
    );

    if (focusedCommitSha) {
      setNodes(applySelectedCommitShas(layoutedNodes, new Set([focusedCommitSha])));
    } else if (highlightedCommitShas) {
      setNodes(applySelectedCommitShas(layoutedNodes, highlightedCommitShas));
    } else {
      setNodes(clearSelectedNodes(layoutedNodes));
    }

    setEdges(layoutedEdges);

    if (!hasAnimated && commits.length > 0) {
      setHasAnimated(true);
      setTimeout(() => {
        const instance = reactFlowInstanceRef.current;
        if (instance) {
          instance.fitView({ padding: 0.1, duration: 0 });

          setTimeout(() => {
            const currentViewport = instance.getViewport();
            instance.setViewport(
              {
                x: currentViewport.x,
                y: currentViewport.y,
                zoom: 0.1,
              },
              { duration: 0 }
            );

            const sortedCommits = [...commits].sort(
              (a, b) => (b.time || 0) - (a.time || 0)
            );
            const mostRecentCommits = sortedCommits.slice(0, 5);

            if (mostRecentCommits.length > 0) {
              setTimeout(() => {
                instance.fitView({
                  nodes: mostRecentCommits.map((commit) => ({ id: commit.sha })),
                  padding: 0.3,
                  duration: 2000,
                });
              }, 100);
            }
          }, 50);
        }
      }, 300);
    }
  }, [
    commits,
    focusedCommitSha,
    graphFromCommits,
    hasAnimated,
    highlightedCommitShas,
    layoutDirection,
  ]);

  useEffect(() => {
    setNodes((current) => {
      if (focusedCommitSha) {
        return applySelectedCommitShas(current, new Set([focusedCommitSha]));
      }

      if (highlightedCommitShas) {
        return applySelectedCommitShas(current, highlightedCommitShas);
      }

      return clearSelectedNodes(current);
    });
  }, [focusedCommitSha, highlightedCommitShas]);

  const handleClearFilters = useCallback(() => {
    setFilteredCommitShas(null);
    setFocusedCommitSha(null);
    setLastSearchQuery("");
    setNodes((current) => clearSelectedNodes(current));

    setTimeout(() => {
      const instance = reactFlowInstanceRef.current;
      if (instance) {
        instance.fitView({ padding: 0.3, duration: 800 });
      }
    }, 100);
  }, []);

  const toggleLayoutDirection = useCallback(() => {
    const next = layoutDirection === "TB" ? "LR" : "TB";
    setLayoutDirection(next);

    setTimeout(() => {
      const instance = reactFlowInstanceRef.current;
      if (instance) {
        instance.fitView({ padding: 0.3, duration: 800 });
      }
    }, 100);
  }, [layoutDirection]);

  const handleFiltersChange = useCallback(
    (filters: FilterFormData) => {
      const hasFilters = hasActiveFilters(filters);
      const filtered = hasFilters
        ? filterCommits(commitsWithLocalSummary, filters, branches)
        : commitsWithLocalSummary;

      setFilteredCommitShas(hasFilters ? filtered.map((commit) => commit.sha) : null);
      setFocusedCommitSha(null);
      setLastSearchQuery("");
    },
    [branches, commitsWithLocalSummary]
  );

  const handleSearchResults = useCallback((commitShas: string[], query?: string) => {
    setFilteredCommitShas(commitShas);
    setFocusedCommitSha(null);
    setLastSearchQuery(query ?? "");
  }, []);

  const handleCommitClick = useCallback(
    (commitSha: string) => {
      setFocusedCommitSha(commitSha);
      setNodes((current) => applySelectedCommitShas(current, new Set([commitSha])));

      const instance = reactFlowInstanceRef.current;
      if (!instance) {
        return;
      }

      panToCommit(instance, commitSha, 800);
    },
    []
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((snapshot) => {
        const updated = applyNodeChanges(changes, snapshot);

        if (focusedCommitSha) {
          return applySelectedCommitShas(updated, new Set([focusedCommitSha]));
        }

        if (highlightedCommitShas) {
          return applySelectedCommitShas(updated, highlightedCommitShas);
        }

        return updated;
      });
    },
    [focusedCommitSha, highlightedCommitShas]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((snapshot) => applyEdgeChanges(changes, snapshot)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((snapshot) => addEdge(params, snapshot)),
    []
  );

  return {
    nodes,
    edges,
    filteredCommits,
    focusedCommitSha,
    lastSearchQuery,
    layoutDirection,
    toggleLayoutDirection,
    onNodesChange,
    onEdgesChange,
    onConnect,
    handleCommitClick,
    handleCommitSummaryUpdate,
    handleFiltersChange,
    handleSearchResults,
    handleClearFilters,
    reactFlowInstanceRef,
  };
}
