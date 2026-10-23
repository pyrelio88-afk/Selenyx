import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AgentStep } from '@services/agent';
import { StepRow } from '../StepRow';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: vi.fn(actual.useState) };
});

vi.mock('@components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <svg data-icon={name} aria-hidden="true" />,
}));

const makeStep = (overrides: Partial<AgentStep> = {}): AgentStep => ({
  step: 1, ts: '2026-10-24T00:00:00Z', kind: 'tool', tool: 'search_library', ...overrides,
});
const render = (step: AgentStep) => renderToStaticMarkup(<StepRow step={step} />);
const expand = () => vi.mocked(useState).mockReturnValue([true, vi.fn()]);

afterEach(() => vi.mocked(useState).mockReset());

describe('StepRow tool disclosures', () => {
  it('uses a closed native disclosure with a named summary and the actual query', () => {
    const markup = render(makeStep({ args: { query: '睡眠护理', limit: 20 } }));
    expect(markup).toContain('<li class="agent-step is-tool">');
    expect(markup).toContain('<details class="agent-tool-disclosure"><summary>');
    expect(markup).toContain('<span class="agent-tool-title">调用工具 检索文献库</span>');
    expect(markup).toContain('<span class="agent-tool-summary">查询：睡眠护理</span>');
    expect(markup).toContain('<span class="agent-tool-action">详情</span></summary>');
    expect(markup).not.toContain(' open');
    expect(markup).not.toContain('agent-tool-body');
    expect(markup).not.toContain('<pre>');
    expect(markup).not.toContain('<button');
  });

  it.each([
    ['read_memory', '读取记忆'],
    ['write_memory', '写入记忆'],
  ])('labels %s without replacing it with an invented action', (tool, label) => {
    const markup = render(makeStep({ tool }));
    expect(markup).toContain(`调用工具 ${label}`);
    expect(markup).not.toContain('<a');
  });

  it('names observation disclosures and preserves zero results', () => {
    const markup = render(makeStep({ kind: 'observation', result: { count: 0, results: [] } }));
    expect(markup).toContain('<li class="agent-step is-observation">');
    expect(markup).toContain('<details class="agent-tool-disclosure"><summary>');
    expect(markup).toContain('工具返回 检索文献库');
    expect(markup).toContain('0 条结果');
    expect(markup).toContain('详情</span></summary>');
    expect(markup).not.toContain('若干');
    expect(markup).not.toContain('agent-tool-body');
  });

  it.each([0, 4])('reports the recorded count %i exactly', (count) => {
    expect(render(makeStep({ kind: 'observation', result: { count } }))).toContain(`${count} 条结果`);
  });

  it('reports a saved result with its actual message', () => {
    const markup = render(makeStep({
      kind: 'observation', tool: 'save_evidence', result: { saved: true, message: '证据卡已进入待裁决队列' },
    }));
    expect(markup).toContain('已保存 · 证据卡已进入待裁决队列');
    expect(markup).not.toContain('条结果');
  });

  it.each([
    { error: '连接超时' },
    { error: true, message: '连接超时' },
    { saved: false, message: '连接超时' },
    { success: false, message: '连接超时' },
    { isError: true, message: '连接超时' },
    { saved: true, error: '连接超时' },
  ])('uses a warning and textual failure instead of green success for %j', (result) => {
    const markup = render(makeStep({ kind: 'observation', result }));
    expect(markup).toContain('<li class="agent-step is-error">');
    expect(markup).toContain('data-icon="warning"');
    expect(markup).toMatch(/工具错误|保存失败/);
    expect(markup).toContain('连接超时');
    expect(markup).not.toContain('is-observation');
    expect(markup).not.toContain('data-icon="check"');
    expect(markup).not.toContain('已保存');
  });

  it('respects the persisted step error flag and message', () => {
    const markup = render(makeStep({ kind: 'observation', error: true, message: '插件无法响应', result: null }));
    expect(markup).toContain('data-icon="warning"');
    expect(markup).toContain('工具错误 · 插件无法响应');
  });

  it('shows an actual message without inventing a count or success', () => {
    const markup = render(makeStep({ kind: 'observation', result: { message: '需要人工确认' } }));
    expect(markup).toContain('需要人工确认');
    expect(markup).not.toContain('条结果');
    expect(markup).not.toContain('已保存');
    expect(markup).not.toContain('data-icon="check"');
  });

  it('keeps unknown plugin names and result payloads inspectable', () => {
    const step = makeStep({ kind: 'observation', tool: 'plugin_custom_search', result: { custom: { opaque: [1, 'value'] } } });
    const closed = render(step);
    expect(closed).toContain('工具返回 plugin_custom_search');
    expect(closed).toContain('已返回结果');
    expect(closed).not.toContain('条结果');
    expect(closed).not.toContain('已保存');
    expect(closed).not.toContain('data-icon="check"');
    expand();
    const opened = render(step);
    expect(opened).toContain('<b>返回结果</b><pre>');
    expect(opened).toContain('&quot;opaque&quot;: [\n      1,\n      &quot;value&quot;');
    expect(opened).not.toContain('<a');
    expect(opened).not.toContain('<button');
  });

  it('shows queries and all arguments for unknown tools', () => {
    const step = makeStep({ tool: 'plugin_query', args: { query: '真实查询', options: { limit: 0, includeArchived: false } } });
    expect(render(step)).toContain('查询：真实查询');
    expand();
    const markup = render(step);
    expect(markup).toContain('调用工具 plugin_query');
    expect(markup).toContain('<b>调用参数</b><pre>');
    expect(markup).toContain('&quot;limit&quot;: 0');
    expect(markup).toContain('&quot;includeArchived&quot;: false');
  });

  it('does not serialize or mount arguments or results until expanded, and removes them when collapsed', () => {
    const argsJSON = vi.fn(() => ({ query: '完整参数', nested: { enabled: false } }));
    const resultJSON = vi.fn(() => ({ data: ['完整结果'] }));
    const step = makeStep({ kind: 'observation', args: { toJSON: argsJSON }, result: { toJSON: resultJSON } });
    expect(render(step)).not.toContain('<pre>');
    expect(argsJSON).not.toHaveBeenCalled();
    expect(resultJSON).not.toHaveBeenCalled();
    const state = expand();
    const opened = render(step);
    expect(opened).toContain('agent-tool-body');
    expect(opened).toContain('完整参数');
    expect(opened).toContain('完整结果');
    expect(argsJSON).toHaveBeenCalledTimes(1);
    expect(resultJSON).toHaveBeenCalledTimes(1);
    state.mockReturnValue([false, vi.fn()]);
    expect(render(step)).not.toContain('agent-tool-body');
    expect(argsJSON).toHaveBeenCalledTimes(1);
    expect(resultJSON).toHaveBeenCalledTimes(1);
  });

  it('renders string results unquoted and escapes HTML in both arguments and results', () => {
    expand();
    const markup = render(makeStep({
      kind: 'observation', args: { content: '<img src=x onerror=alert(1)>' }, result: '<script>alert(1)</script>',
    }));
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).toContain('<pre>&lt;script&gt;alert(1)&lt;/script&gt;</pre>');
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<img');
  });

  it.each([null, false, 0, ''])('preserves primitive result %j rather than inventing a missing value', (result) => {
    expand();
    expect(render(makeStep({ kind: 'observation', result }))).toContain(`<pre>${String(result)}</pre>`);
  });

  it('distinguishes missing data from recorded empty inputs and results', () => {
    expand();
    expect(render(makeStep())).toContain('<pre>未记录参数</pre>');
    expect(render(makeStep({ args: {} }))).toContain('<pre>{}</pre>');
    expect(render(makeStep({ kind: 'observation' }))).toContain('<pre>未记录结果</pre>');
    const emptyResult = render(makeStep({ kind: 'observation', result: [] }));
    expect(emptyResult).toContain('0 条结果');
    expect(emptyResult).toContain('<pre>[]</pre>');
  });
});

describe('StepRow other step kinds', () => {
  it('keeps the execution plan and final rendering behavior unchanged', () => {
    const plan = render(makeStep({ kind: 'plan', items: ['检索证据', '审阅结论'] }));
    expect(plan).toContain('class="agent-step is-plan"');
    expect(plan).toContain('<b>执行计划</b>');
    expect(plan).toContain('<li>检索证据</li><li>审阅结论</li>');
    expect(plan).not.toContain('<details');
    expect(render(makeStep({ kind: 'final', text: '单独展示的成稿' }))).toBe('');
  });

  it.each([
    { kind: 'thought', text: '思考内容', expected: '思考内容', className: 'is-thought' },
    { kind: 'review', critic: '方法专家', text: '审阅内容', expected: '方法专家审阅', className: 'is-review' },
    { kind: 'subagent', expert: '统计专家', expected: '统计专家', className: 'is-subagent' },
    { kind: 'coverage', expected: '证据校验：0/0', className: 'is-observation' },
    { kind: 'steer', text: '补充要求', expected: '补充要求', className: 'is-steer' },
    { kind: 'waiting', expected: '等待人工确认', className: 'is-waiting' },
    { kind: 'error', message: '任务失败', expected: '任务失败', className: 'is-error' },
  ] as const)('preserves the $kind row', ({ expected, className, ...step }) => {
    const markup = render(makeStep(step));
    expect(markup).toContain(`class="agent-step ${className}"`);
    expect(markup).toContain(expected);
    expect(markup).not.toContain('<details');
  });
});
