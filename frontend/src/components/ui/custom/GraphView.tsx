import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeMouseHandler,
  type Node,
  type NodeChange,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import { FlipHorizontal } from "lucide-react";

import { LoadingOverlay } from "@/components/ui/custom/LoadingOverlay";
import type { LayoutDirection } from "@/lib/graph/layout";

type GraphViewProps = {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (params: Connection) => void;
  onInit: (instance: ReactFlowInstance) => void;
  onNodeClick: NodeMouseHandler;
  isLoading: boolean;
  isIngesting: boolean;
  ingestStatus: string;
  ingestProgressPercent?: number | null;
  ingestProgressPhase?: string | null;
  ingestProgressLabel?: string | null;
  ingestProgressCompletedUnits?: number | null;
  ingestProgressTotalUnits?: number | null;
  layoutDirection: LayoutDirection;
  toggleLayoutDirection: () => void;
};

export function GraphView({
  nodes,
  edges,
  nodeTypes,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onInit,
  onNodeClick,
  isLoading,
  isIngesting,
  ingestStatus,
  ingestProgressPercent,
  ingestProgressPhase,
  ingestProgressLabel,
  ingestProgressCompletedUnits,
  ingestProgressTotalUnits,
  layoutDirection,
  toggleLayoutDirection,
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
      onNodeClick={onNodeClick}
      fitView={false}
      className="h-full w-full"
      defaultViewport={{ x: 0, y: 0, zoom: 0.1 }}
      minZoom={0.05}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={28}
        size={1}
        color="rgba(255,255,255,0.08)"
      />

      <LoadingOverlay
        isVisible={isLoading || isIngesting}
        isIngesting={isIngesting}
        ingestStatus={ingestStatus}
        progressPercent={ingestProgressPercent}
        progressPhase={ingestProgressPhase}
        progressLabel={ingestProgressLabel}
        progressCompletedUnits={ingestProgressCompletedUnits}
        progressTotalUnits={ingestProgressTotalUnits}
      />

      <Controls
        position="bottom-right"
        showInteractive={false}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          margin: "20px 20px",
        }}
      >
        <button
          onClick={toggleLayoutDirection}
          className="react-flow__controls-button"
          title={
            layoutDirection === "TB"
              ? "Switch to horizontal layout"
              : "Switch to vertical layout"
          }
        >
          <FlipHorizontal className="size-4" />
        </button>
      </Controls>

      <MiniMap
        position="bottom-left"
        style={{
          width: 148,
          height: 152,
          margin: "20px",
        }}
        nodeColor={(node) =>
          node.selected ? "rgba(122,162,255,0.78)" : "rgba(255,255,255,0.16)"
        }
        nodeStrokeWidth={2}
        pannable
        zoomable
        maskColor="rgba(13,15,16,0.72)"
      />
    </ReactFlow>
  );
}
