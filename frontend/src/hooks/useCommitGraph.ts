import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Commit, Branch } from "@/lib/definitions/repo";
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
  lastSearchQuery: string;
  layoutDirection: LayoutDirection;
  toggleLayoutDirection: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (params: Connection) => void;
  handleCommitClick: (commitSha: string) => void;
  handleFiltersChange: (filters: FilterFormData) => void;
  handleSearchResults: (commitShas: string[], query?: string) => void;
  handleClearFilters: () => void;
  reactFlowInstanceRef: React.MutableRefObject<ReactFlowInstance | null>;
};

export function useCommitGraph({
  commits,
  branches,
}: UseCommitGraphArgs): UseCommitGraph {
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [filteredCommits, setFilteredCommits] = useState<Commit[]>(commits);
  const [lastSearchQuery, setLastSearchQuery] = useState<string>("");
  const [filterSelectedNodes, setFilterSelectedNodes] = useState<Set<string>>(
    new Set()
  );
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>("TB");
  const [hasAnimated, setHasAnimated] = useState<boolean>(false);

  // Convert commits to nodes/edges, memoized to avoid re-creating on unrelated changes
  const graphFromCommits = useMemo(() => {
    const nodesFromCommits: Node[] = commits.map((commit) => ({
      id: commit.sha,
      position: { x: 0, y: 0 },
      data: {
        sha: commit.sha,
        message: commit.message,
        author: commit.author,
        time: commit.time,
        summary: commit.summary || null,
        onUpdateSummary: (sha: string, summary: string) => {
          setNodes((current) =>
            current.map((node) =>
              node.id === sha
                ? { ...node, data: { ...node.data, summary } }
                : node
            )
          );
        },
      },
      type: "commit",
      ...nodeDefaults,
    }));

    const edgesFromCommits: Edge[] = [];
    commits.forEach((commit) => {
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
  }, [commits]);

  // Build and layout graph whenever commits or direction change
  useEffect(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = layoutGraph(
      graphFromCommits.nodes,
      graphFromCommits.edges,
      layoutDirection
    );
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    setFilteredCommits(commits);

    // Trigger initial zoom animation on first load
    if (!hasAnimated && commits.length > 0) {
      setHasAnimated(true);
      setTimeout(() => {
        const instance = reactFlowInstanceRef.current;
        if (instance) {
          // First, fit the entire graph to show the whole structure and get centered position
          instance.fitView({ padding: 0.1, duration: 0 });
          
          // Then zoom out while keeping the centered position
          setTimeout(() => {
            const currentViewport = instance.getViewport();
            instance.setViewport({ 
              x: currentViewport.x, 
              y: currentViewport.y, 
              zoom: 0.1 
            }, { duration: 0 });
            
            // Find the 3 most recent commits by timestamp
            const sortedCommits = [...commits].sort((a, b) => (b.time || 0) - (a.time || 0));
            const mostRecentCommits = sortedCommits.slice(0, 5);
            
            if (mostRecentCommits.length > 0) {
              // Animate to focus on the most recent commits
              setTimeout(() => {
                instance.fitView({
                  nodes: mostRecentCommits.map(commit => ({ id: commit.sha })),
                  padding: 0.3,
                  duration: 2000,
                });
              }, 100);
            }
          }, 50);
        }
      }, 300); // Small delay to ensure the graph is rendered
    }
  }, [graphFromCommits, layoutDirection, commits, hasAnimated]);

  const updateNodeSelection = useCallback((selectedShas: Set<string>) => {
    setFilterSelectedNodes(selectedShas);
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        selected: selectedShas.has(node.id),
      }))
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilteredCommits(commits);
    updateNodeSelection(new Set());
    setLastSearchQuery("");
    setTimeout(() => {
      const instance = reactFlowInstanceRef.current;
      if (instance) instance.fitView({ padding: 0.3, duration: 800 });
    }, 100);
  }, [commits, updateNodeSelection]);

  const toggleLayoutDirection = useCallback(() => {
    const next = layoutDirection === "TB" ? "LR" : "TB";
    setLayoutDirection(next);
    setTimeout(() => {
      const instance = reactFlowInstanceRef.current;
      if (instance) instance.fitView({ padding: 0.3, duration: 800 });
    }, 100);
  }, [layoutDirection]);

  const handleFiltersChange = useCallback(
    (filters: FilterFormData) => {
      const hasFilters = hasActiveFilters(filters);
      const filtered = hasFilters
        ? filterCommits(commits, filters, branches)
        : commits;
      setFilteredCommits(filtered);
      setLastSearchQuery("");
      const selectedShas = hasFilters
        ? new Set(filtered.map((c) => c.sha))
        : new Set<string>();
      updateNodeSelection(selectedShas);
    },
    [commits, branches, updateNodeSelection]
  );

  const handleSearchResults = useCallback(
    (commitShas: string[], query?: string) => {
      const filtered = commits.filter((c) => commitShas.includes(c.sha));
      setFilteredCommits(filtered);
      setLastSearchQuery(query ?? "");
      updateNodeSelection(new Set(commitShas));
    },
    [commits, updateNodeSelection]
  );

  const handleCommitClick = useCallback(
    (commitSha: string) => {
      const instance = reactFlowInstanceRef.current;
      if (!instance) return;
      const target = nodes.find((n) => n.id === commitSha);
      if (!target) return;
      setNodes((current) =>
        current.map((n) => ({ ...n, selected: n.id === commitSha }))
      );
      instance.fitView({
        nodes: [{ id: commitSha }],
        padding: 0.3,
        duration: 800,
      });
    },
    [nodes]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((snapshot) => {
        let updated = applyNodeChanges(changes, snapshot);
        // Always maintain filter highlighting for filtered commits
        if (filterSelectedNodes.size > 0) {
          updated = updated.map((node) => ({
            ...node,
            selected: filterSelectedNodes.has(node.id),
          }));
        }
        return updated;
      });
    },
    [filterSelectedNodes]
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
    lastSearchQuery,
    layoutDirection,
    toggleLayoutDirection,
    onNodesChange,
    onEdgesChange,
    onConnect,
    handleCommitClick,
    handleFiltersChange,
    handleSearchResults,
    handleClearFilters,
    reactFlowInstanceRef,
  };
}
