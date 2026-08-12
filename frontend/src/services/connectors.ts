/** Local connector and MCP APIs kept separate from the extensions workbench. */

import { request } from './api';

export type ConnectorStatus = 'ok' | 'off' | 'error' | 'unknown' | 'disabled';

export interface ConnectorSummary {
  key: string;
  name: string;
  status: ConnectorStatus;
  detail: string;
}

export interface AcademicProbeItem {
  key: string;
  name: string;
  status: 'ok' | 'error' | 'timeout';
  statusCode: number | null;
  latencyMs: number;
  detail: string;
}

export interface AcademicProbe {
  checkedAt: string;
  cached: boolean;
  timeoutSeconds: number;
  cacheTtlSeconds: number;
  connectors: AcademicProbeItem[];
}

export interface McpCapability {
  name: string;
  tool: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerInfo {
  name?: string;
  version?: string;
}

export interface McpServer {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  command: string;
  args: string[];
  url: string;
  timeoutSeconds: number;
  enabled: boolean;
  status: ConnectorStatus;
  lastError: string;
  lastCheckedAt: string | null;
  protocolVersion: string;
  serverInfo: McpServerInfo;
  capabilities: McpCapability[];
  createdAt: string;
  updatedAt: string;
}

export interface McpServerInput {
  name: string;
  transport: 'stdio' | 'sse';
  command: string;
  args: string[];
  url: string;
  timeoutSeconds: number;
  enabled: boolean;
}

export interface McpProbeResult {
  ok: boolean;
  detail: string;
  latencyMs: number;
  server: McpServer;
}

export interface ConnectorOverview {
  connectors: ConnectorSummary[];
  academicProbe: AcademicProbe | null;
  mcpServers: McpServer[];
}

/** One stdio argument per line keeps command execution shell-free and inspectable. */
export function parseMcpArgs(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export const connectorsApi = {
  overview: () => request<ConnectorOverview>('/connectors'),
  probeAcademic: (force = false) => request<AcademicProbe>(`/connectors/academic/probe${force ? '?force=true' : ''}`),
  listMcp: () => request<{ servers: McpServer[] }>('/connectors/mcp'),
  createMcp: (body: McpServerInput) => request<McpServer>('/connectors/mcp', {
    method: 'POST', body: JSON.stringify(body),
  }),
  updateMcp: (id: string, body: McpServerInput) => request<McpServer>(`/connectors/mcp/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(body),
  }),
  removeMcp: (id: string) => request<{ deleted: string }>(`/connectors/mcp/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }),
  probeMcp: (id: string) => request<McpProbeResult>(`/connectors/mcp/${encodeURIComponent(id)}/probe`, {
    method: 'POST',
  }),
};
