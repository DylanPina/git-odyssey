import dagre from "dagre";
import { Position, type Edge, type Node } from "@xyflow/react";

export type LayoutDirection = "TB" | "LR";

export const nodeWidth = 350;
export const nodeHeight = 130;

// Default node port positions; React Flow uses these when edges are drawn
export const nodeDefaults = {
	sourcePosition: Position.Right,
	targetPosition: Position.Left,
};

// Dagre layout configuration - keep a singleton graph instance
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

export function layoutGraph(
	nodes: Node[],
	edges: Edge[],
	direction: LayoutDirection = "TB"
) {
	const isHorizontal = direction === "LR";

	// Configure graph per layout run
	dagreGraph.setGraph({ rankdir: direction, ranksep: 80, nodesep: 200 });

	// Register nodes with dimensions
	nodes.forEach((node) => {
		dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
	});

	// Register edges (we only need source/target ids)
	edges.forEach((edge) => {
		dagreGraph.setEdge(edge.source, edge.target);
	});

	// Compute layout
	dagre.layout(dagreGraph);

	// Return a new nodes array with positioned nodes (do not mutate input)
	const layoutedNodes: Node[] = nodes.map((node) => {
		const nodeWithPosition = dagreGraph.node(node.id);
		return {
			...node,
			targetPosition: isHorizontal ? Position.Left : Position.Top,
			sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
			position: {
				x: nodeWithPosition.x - nodeWidth / 2,
				y: nodeWithPosition.y - nodeHeight / 2,
			},
		};
	});

	return { nodes: layoutedNodes, edges };
}
