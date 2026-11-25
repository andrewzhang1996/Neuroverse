export type NodeStatus =
  | "default"
  | "running"
  | "tool_calling"
  | "waiting"
  | "completed"
  | "idle"
  | "error"
  | (string & {});

export type EdgeStatus = "default" | "active" | "completed" | "error" | (string & {});

export type FieldKind = "text" | "multiline" | "badge" | "code" | "timestamp" | "tags";

export interface InspectorFieldDefinition {
  key: string;
  label: string;
  kind: FieldKind;
}

export interface StellarNeuronAppearance {
  coreColor: string;
  haloColor: string;
  emissiveIntensity: number;
  scale: number;
  pulseSpeed: number;
  pulseAmplitude: number;
  orbitRingOpacity: number;
  turbulence: number;
}

export interface NodeDefinition {
  type: string;
  label: string;
  typeLabel?: string;
  description?: string;
  orbitTier: number;
  ttlSeconds?: number;
  defaultConfig: Record<string, unknown>;
  fields: InspectorFieldDefinition[];
  appearance: Record<string, StellarNeuronAppearance>;
}

export interface SynapseEdgeAppearance {
  color: string;
  opacity: number;
  curveArc: number;
  pulseCount: number;
  pulseSpeed: number;
  pulseColor: string;
}

export interface EdgeDefinition {
  type: string;
  typeLabel: string;
  description?: string;
  appearance: Record<string, SynapseEdgeAppearance>;
}

export interface FlowDefinitionsRegistry {
  schemaVersion: string;
  nodeDefinitions: NodeDefinition[];
  edgeDefinitions: EdgeDefinition[];
}

export interface NodeLink {
  id?: string;
  target: string;
  type?: string;
  status?: EdgeStatus;
  label?: string;
}

export interface FlowNodeInstance {
  schemaVersion: string;
  id: string;
  type: string;
  parentId?: string | null;
  label: string;
  status: NodeStatus;
  updatedAt: string;
  expiresAt?: string | null;
  config?: Record<string, unknown>;
  links?: NodeLink[];
  metadata?: Record<string, unknown>;
}

export interface ResolvedSynapseEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  status: EdgeStatus;
  label: string;
}

export interface AggregatedFlowSnapshot {
  schemaVersion: string;
  stateDir: string;
  generatedAt: string;
  definitions: FlowDefinitionsRegistry;
  nodes: FlowNodeInstance[];
  edges: ResolvedSynapseEdge[];
}
