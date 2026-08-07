/**
 * Selenyx AI/LLM 模型 — BYOK + MCP + Agent 编排 + 知识图谱
 */

export type LLMProvider = 'openai' | 'openrouter' | 'anthropic' | 'google' | 'ollama' | 'custom';

export interface LLMConfig {
  provider: LLMProvider;
  /** Browser-development compatibility only; never persist this field. */
  apiKey?: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  tokenBudget: number;
  tokensUsed: number;
}

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls: ToolCall[];
  referenceIds: string[];
  annotationIds: string[];
  timestamp: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: string | null;
  status: 'pending' | 'running' | 'success' | 'error';
}

export interface MCPTool {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  endpoint: string;
  enabled: boolean;
}

export interface ResearchRecipe {
  id: string;
  name: string;
  description: string;
  type: 'literature_review' | 'paper_critique' | 'idea_generation' | 'data_extraction' | 'quality_assessment' | 'writing_assist' | 'custom';
  systemPrompt: string;
  userPromptTemplate: string;
  toolIds: string[];
  outputFormat: 'text' | 'json' | 'table' | 'markdown';
  requiresApproval: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface AgentRun {
  id: string;
  recipeId: string;
  projectId: string;
  status: 'staged' | 'approved' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: string;
  output: string;
  auditLog: AuditEntry[];
  tokensUsed: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: 'user' | 'agent' | 'system';
  details: string;
  riskClass: 'info' | 'low' | 'medium' | 'high' | 'critical';
}

export interface RetrievalResult {
  referenceId: string;
  page: number | null;
  section: string | null;
  charOffset: { start: number; end: number } | null;
  excerpt: string;
  score: number;
}

export interface GraphNode {
  id: string;
  type: 'note' | 'source' | 'claim' | 'task' | 'project';
  label: string;
  entityId: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'cites' | 'supports' | 'contradicts' | 'relates' | 'derives' | 'questions';
  weight: number;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
