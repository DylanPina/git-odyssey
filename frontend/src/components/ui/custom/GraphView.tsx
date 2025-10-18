import {
	ReactFlow,
	Controls,
	MiniMap,
	Background,
	type NodeTypes,
	type Node,
	type Edge,
	type NodeChange,
	type EdgeChange,
	type Connection,
	type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FlipHorizontal } from "lucide-react";
import type { LayoutDirection } from "@/lib/graph/layout";
import { Input } from "@/components/ui/input";

type GraphViewProps = {
	nodes: Node[];
	edges: Edge[];
	nodeTypes: NodeTypes;
	onNodesChange: (changes: NodeChange[]) => void;
	onEdgesChange: (changes: EdgeChange[]) => void;
	onConnect: (params: Connection) => void;
	onInit: (instance: ReactFlowInstance) => void;
	isLoading: boolean;
	isIngesting: boolean;
	ingestStatus: string;
	layoutDirection: LayoutDirection;
	toggleLayoutDirection: () => void;
	repoUrl: string;
	onSearchResults: (commitShas: string[], query?: string) => void;
};

export function GraphView({
	nodes,
	edges,
	nodeTypes,
	onNodesChange,
	onEdgesChange,
	onConnect,
	onInit,
	isLoading,
	isIngesting,
	ingestStatus,
	layoutDirection,
	toggleLayoutDirection,
	repoUrl,
	onSearchResults,
}: GraphViewProps) {
	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			nodeTypes={nodeTypes}
			onNodesChange={onNodesChange}
			onEdgesChange={onEdgesChange}
			onConnect={onConnect}
			onInit={onInit}
			fitView
			fitViewOptions={{ padding: 0.3 }}
			className="w-full h-full relative"
			defaultViewport={{ x: 0, y: 0, zoom: 1 }}
			minZoom={0.1}
			maxZoom={2}
		>
			<Background />
			<Controls
				position="bottom-right"
				className="react-flow__controls-dark"
				showInteractive={true}
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 8,
					transform: "scale(1.2)",
					margin: "25px 30px",
				}}
			>
				<button
					onClick={toggleLayoutDirection}
					className="react-flow__controls-button"
					title={
						layoutDirection === "TB"
							? "Switch to Horizontal Layout"
							: "Switch to Vertical Layout"
					}
				>
					<FlipHorizontal className="w-4 h-4" />
				</button>
			</Controls>
			<MiniMap
				position="bottom-left"
				style={{
					width: 130,
					height: 180,
				}}
				className="react-flow__minimap-dark min-sm:w-[150px] w-[300px]"
				nodeStrokeWidth={2}
				pannable
				zoomable
				maskColor="rgba(255, 255, 255, 0.15)"
			/>
			{/* Search bar positioned at bottom center, with margins to avoid overlapping controls */}
			<div
				className="absolute bottom-4 z-10 flex justify-center"
				style={{
					left: "max(150px, 10px)",
					right: "max(80px, 10px)",
				}}
			>
				<Input
					placeholder="Search commits"
					onChange={(e) => onSearchResults([e.target.value])}
				/>
			</div>
		</ReactFlow>
	);
}
