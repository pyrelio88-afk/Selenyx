import { describe, expect, it } from 'vitest';
import { filterTools, TOOL_CATEGORIES, TOOL_DEFINITIONS, TOOL_RUNTIME_LABELS } from '../ToolsView';

describe('Tools workbench directory', () => {
  it('keeps every existing tool in the stable directory', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(11);
    expect(new Set(TOOL_DEFINITIONS.map((tool) => tool.key)).size).toBe(11);
    expect(TOOL_CATEGORIES).toHaveLength(5);
  });

  it('declares an icon and honest runtime constraint for every tool', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.icon).toBeTruthy();
      expect(tool.constraint.length).toBeGreaterThan(8);
      expect(TOOL_RUNTIME_LABELS[tool.runtime]).toBeTruthy();
    }
    expect(TOOL_DEFINITIONS.find((tool) => tool.key === 'doi')?.runtime).toBe('network');
    expect(TOOL_DEFINITIONS.find((tool) => tool.key === 'browser')?.runtime).toBe('network');
    expect(TOOL_DEFINITIONS.find((tool) => tool.key === 'models')?.runtime).toBe('ollama');
  });

  it('searches labels, descriptions, constraints and keywords within a category', () => {
    expect(filterTools('Crossref', 'all').map((tool) => tool.key)).toEqual(['doi']);
    expect(filterTools('本机', 'literature').map((tool) => tool.key)).toContain('cite');
    expect(filterTools('', 'visual').map((tool) => tool.key)).toEqual(['chart', 'matrix']);
    expect(filterTools('伦理', 'utility')).toEqual([]);
  });
});
