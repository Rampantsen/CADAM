import { Database } from './database.ts';
export type Model = string;
export type CreativeModel = 'quality' | 'fast' | 'ultra';

export type Prompt = {
  text?: string;
  images?: string[];
  mesh?: string;
  model?: Model;
};

export type Message = Omit<
  Database['public']['Tables']['messages']['Row'],
  'content' | 'role'
> & {
  role: 'user' | 'assistant';
  content: Content;
};

export type CoreMessage = Pick<Message, 'id' | 'role' | 'content'>;

export type MeshFileType = Database['public']['Enums']['mesh_file_type'];

export type Mesh = {
  id: string;
  fileType: MeshFileType;
};

export type MeshData = Omit<
  Database['public']['Tables']['meshes']['Row'],
  'prompt'
> & {
  prompt: Prompt;
};

export type ToolCall = {
  name: string;
  status: 'pending' | 'error';
  id?: string;
  result?: { id: string; fileType?: MeshFileType };
};

export type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
};

export type ModelCallUsage = {
  provider?: string;
  model?: string;
  requested_model?: string;
  duration_ms?: number;
  finish_reason?: string | null;
  token_usage?: TokenUsage;
};

export type MessageUsage = {
  duration_ms?: number;
  model_call?: ModelCallUsage;
};

export type Content = {
  text?: string;
  model?: Model;
  // When the user sends an error, its related to the fix with AI function
  // When the assistant sends an error, its related to any error that occurred during generation
  error?: string;
  artifact?: ParametricArtifact;
  index?: number;
  images?: string[];
  mesh?: Mesh;
  // Parametric mode: bounding box dimensions from STL parsing
  meshBoundingBox?: { x: number; y: number; z: number };
  // Parametric mode: original filename for import() in OpenSCAD
  meshFilename?: string;
  suggestions?: string[];
  // For streaming support - shows in-progress tool calls
  toolCalls?: ToolCall[];
  // Mesh topology preference (quads vs polys) for quality model
  meshTopology?: 'quads' | 'polys';
  // Polygon count preference for quality model
  polygonCount?: number;
  // File format preference for quad topology models
  preferredFormat?: 'glb' | 'fbx';
  // Local backend usage/timing metadata for generated assistant messages.
  usage?: MessageUsage;
};

export type ParametricArtifact = {
  title: string;
  version: string;
  code: string;
  parameters: Parameter[];
  parts?: ParametricPart[];
  articulations?: ParametricArticulation[];
  suggestions?: string[];
};

export type ParametricPart = {
  id: string;
  name: string;
  module: string;
  parentId?: string | null;
  color?: string;
  role?: string;
};

export type ParametricArticulationType =
  | 'hinge'
  | 'slider'
  | 'revolute'
  | 'prismatic';

export type ParametricArticulation = {
  id: string;
  partId: string;
  parentId?: string | null;
  type: ParametricArticulationType;
  axis?: [number, number, number];
  origin?: [number, number, number];
  range?: [number, number];
  defaultValue?: number;
};

export type ParameterOption = { value: string | number; label: string };

export type ParameterRange = { min?: number; max?: number; step?: number };

export type ParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'string[]'
  | 'number[]'
  | 'boolean[]';

export type Parameter = {
  name: string;
  displayName: string;
  value: string | boolean | number | string[] | number[] | boolean[];
  defaultValue: string | boolean | number | string[] | number[] | boolean[];
  // Type should always exist, but old messages don't have it.
  type?: ParameterType;
  description?: string;
  group?: string;
  range?: ParameterRange;
  options?: ParameterOption[];
  maxLength?: number;
};

export type Conversation = Omit<
  Database['public']['Tables']['conversations']['Row'],
  'settings'
> & {
  settings: ConversationSettings;
};

export type GenerationStatus = Database['public']['Enums']['generation-status'];

export type ConversationSettings = {
  model?: Model;
} | null;

export type Profile = Database['public']['Tables']['profiles']['Row'];
