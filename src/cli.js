// CLI — Selenyx 命令行入口。
// 命令：startPage / init / ask / theme / lang / config / providers / agents / version / help
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runOnboarding, loadConfig, saveConfig, configWithEnvOverrides } from './tui/onboarding.js';
import { listProviders, providerFromConfig } from './llm/registry.js';
import { listRoles, rolesForStage, PIPELINE_STAGES, STAGE_MOON } from './subagents/roles.js';
import { SubAgentManager } from './subagents/manager.js';
import { Engine, createCanon, CANON_REGISTRY } from './core/engine.js';
import { listThemes, getTheme, DEFAULT_THEME } from './tui/themes.js';
import {
  t, resolveLang, resolveRuntimeLang, defaultConfigPath, LANGS, DEFAULT_LANG,
} from './tui/i18n.js';
import {
  banner, box, keyValue, palette, stageLine, themeSwatch, divider,
} from './tui/ui.js';
import { GapAnalysisLens, ContradictionSetLens, ConfidenceMapLens } from './core/lens.js';

const VERSION = '0.6.0';

/* ---------- 参数解析 ---------- */

const VALUE_FLAGS = new Set(['--canon', '--count', '--lang', '--theme', '--provider', '--model']);

export function parseArgs(argv) {
  const flags = new Set();
  const flagValues = new Map();
  const positionals = [];
  let command = null;
  const skip = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    if (skip.has(i)) continue;
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        const name = arg.slice(0, eq);
        const val = arg.slice(eq + 1);
        flags.add(name);
        flagValues.set(name, val);
      } else {
        flags.add(arg);
        if (VALUE_FLAGS.has(arg) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          flagValues.set(arg, argv[i + 1]);
          skip.add(i + 1);
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      for (const c of arg.slice(1)) flags.add(`-${c}`);
    } else if (command === null) command = arg;
    else positionals.push(arg);
  }
  // 规范化长 flag
  const norm = new Set();
  for (const f of flags) {
    if (f === '-v' || f === '--version') norm.add('--version');
    else if (f === '-h' || f === '--help') norm.add('--help');
    else norm.add(f);
  }
  return { command, positionals, flags: norm, flagValues };
}

function getFlag(flags, long, short) {
  if (flags.has(long)) return long;
  if (short && flags.has(short)) return short;
  return null;
}

function getFlagValue(parsed, long) {
  if (parsed && parsed.flagValues && parsed.flagValues.has(long)) {
    return parsed.flagValues.get(long);
  }
  if (parsed instanceof Set) {
    const f = [...parsed].find((x) => x === long || x.startsWith(`${long}=`));
    if (!f) return null;
    if (f.includes('=')) return f.split('=').slice(1).join('=');
    return true;
  }
  return null;
}

/* ---------- 报告渲染 ---------- */

function renderReport({ question, lang, status, evaluation, graph, theme, stub }) {
  const c = palette(theme);
  const lensGaps = new GapAnalysisLens().fold(graph);
  const lensContra = new ContradictionSetLens().fold(graph);
  const confMap = new ConfidenceMapLens().fold(graph);
  const stats = graph.stats();
  const out = [];
  out.push(c.gold(`# ${t('report.title', lang)}`));
  out.push('');
  out.push(c.text(`**${t('report.question', lang)}:** ${question}`));
  out.push('');
  out.push(c.text(`**${t('report.status', lang)}:** ${status} `) + c.dim('— ' + evaluation.status_recommendation));
  out.push(c.text(`**${t('report.evidence', lang)}:** ${stats.atoms} ${t('report.atoms', lang)}, ${stats.relations} ${t('report.relations', lang)} · ${stats.primarySources} ${t('report.primarySources', lang)}`));
  out.push('');
  out.push(c.gold(`## ${t('report.reasons', lang)}`));
  for (const r of evaluation.reasons) out.push(`- ${c.text(r)}`);
  out.push('');
  if (lensGaps.critical.length) {
    out.push(c.gold(`## ${t('report.gaps', lang)} (${lensGaps.critical.length} critical)`));
    for (const g of lensGaps.critical) out.push(`- ${c.err('!')} ${c.text(g.content)}`);
    out.push('');
  }
  if (lensContra.unacknowledged.length) {
    out.push(c.gold(`## ${t('report.contradictions', lang)}`));
    for (const c1 of lensContra.unacknowledged) out.push(`- ${c.text(c1.sourceId)} ↔ ${c.text(c1.targetId)}`);
    out.push('');
  }
  out.push(c.gold(`## ${t('report.citations', lang)}`));
  for (const cite of graph.atomsOfType('citation')) {
    out.push(`- ${c.text(cite.content.slice(0, 100))}` + c.dim(`  [${cite.provenance.kind}:${cite.provenance.ref}]`));
  }
  out.push('');
  out.push(c.gold(`## ${t('report.nextSteps', lang)}`));
  out.push(`- ${c.text(lang === 'zh' ? '运行 `selenyx ask "<更细分的问题>"` 继续深挖' : 'Run `selenyx ask "<more specific question>"` to dig deeper')}`);
  out.push(`- ${c.text(lang === 'zh' ? '运行 `selenyx init` 配置大模型，获得真实抽取与综合' : 'Run `selenyx init` to configure an LLM for real extraction & synthesis')}`);
  if (stub) out.push('' + c.warn('  ⚠ ' + t('report.stubNote', lang)));
  return out.join('\n');
}

/* ---------- 命令实现 ---------- */

async function cmdStartPage(args, { io, config }) {
  const lang = resolveRuntimeLang(config);
  const theme = getTheme(config.theme ?? DEFAULT_THEME);
  const c = palette(theme);
  io.stdout.write(banner(theme, { version: VERSION, tagline: t('app.tagline', lang) }) + '\n\n');
  const statusRows = [
    [t('startPage.provider', lang), config.provider ? config.provider : 'stub (no key)'],
    [t('startPage.model', lang), config.model || '—'],
    [t('startPage.theme', lang), theme.name + ' (' + theme[lang] + ')'],
    [t('startPage.lang', lang), lang],
  ];
  io.stdout.write(c.text(`  ${t('startPage.status')}\n`));
  io.stdout.write(keyValue(statusRows, { theme, keyW: 12 }) + '\n\n');
  io.stdout.write(c.text(`  ${t('startPage.actions')}\n`));
  for (const line of t('startPage.actionsItems', lang)) io.stdout.write(`  ${c.dim('•')} ${c.text(line)}\n`);
  io.stdout.write('\n');
  if (!config.provider || config.provider === 'stub') {
    io.stdout.write(c.warn('  ⚠ ' + t('cli.stubNotice', lang)) + '\n\n');
  }
}

async function cmdInit(args, { io }) {
  const cfg = await runOnboarding();
  if (cfg) io.stdout.write(`${t('cli.initialized')}: ${defaultConfigPath()}\n`);
}

async function cmdAsk(args, { io, config }) {
  const lang = resolveRuntimeLang(config);
  const theme = getTheme(config.theme ?? DEFAULT_THEME);
  const c = palette(theme);
  const question = args.positionals.join(' ').trim() || (await new Promise((res) => {
    process.stderr.write(lang === 'zh' ? '研究问题: ' : 'Research question: ');
    process.stdin.once('data', (d) => res(d.toString().trim()));
  }));
  if (!question) throw new Error('no question provided');

  const canon = getFlagValue(args, '--canon') ?? 'general';
  const searchCount = Number(getFlagValue(args, '--count') ?? 3);
  if (!CANON_REGISTRY[canon]) throw new Error(`unknown canon '${canon}'. Known: ${Object.keys(CANON_REGISTRY).join(', ')}`);

  const home = os.homedir();
  const engine = new Engine({ canonName: canon, homeDir: home });
  const provider = providerFromConfig(config);
  const manager = new SubAgentManager({
    engine, provider, lang, searchBackend: config.provider === 'stub' ? 'web' : 'web',
  });

  io.stdout.write('\n' + c.gold(`  ${t('cli.pipelineDone')}`) + '\n');
  io.stdout.write(c.dim(`  ${STAGE_MOON.intake} ${t('stage.intake', lang)}  ${question}\n`));
  io.stdout.write(c.dim(`  ${divider(theme, '─', 60)}\n`));
  for (const stage of PIPELINE_STAGES) {
    const roles = rolesForStage(stage).map((r) => r.name).join(', ');
    io.stdout.write(stageLine(STAGE_MOON[stage], t(`stage.${stage}`, lang), t('stageLabel.start', lang), theme) + '  ' + c.dim(roles) + '\n');
  }
  io.stdout.write('\n');

  const result = await manager.runPipeline(question, {
    searchCount,
    onStage: (stage, moon, roles, status) => {
      io.stdout.write(stageLine(moon, t(`stage.${stage}`, lang), t(`stageLabel.${status}`, lang), theme) + '\n');
    },
  });

  io.stdout.write('\n' + c.gold(`  ${t('cli.pipelineDone')}`) + '  ' + c.ok(result.status) + '\n\n');
  const md = renderReport({
    question, lang, status: result.status,
    evaluation: result.evaluation, graph: engine.graph, theme, stub: provider.name === 'stub',
  });
  io.stdout.write(md + '\n\n');
  const reportPath = engine.saveReport(md);
  io.stdout.write(c.dim(`  ${t('cli.investigationSaved', lang)} ${reportPath}\n`) + '\n');
  return { result, reportPath };
}

async function cmdTheme(args, { io, config }) {
  const lang = resolveRuntimeLang(config);
  const theme = getTheme(config.theme ?? DEFAULT_THEME);
  const target = args.positionals[0];
  if (!target) {
    io.stdout.write(`${t('startPage.theme', lang)}: ${theme.name}\n`);
    for (const th of listThemes()) {
      const c = palette(getTheme(th.name));
      io.stdout.write(`  ${c.gold(th.name.padEnd(10))} ${c.text(th.label[lang].padEnd(20))} ${themeSwatch(getTheme(th.name))}\n`);
    }
    return;
  }
  if (!listThemes().find((th) => th.name === target)) {
    throw new Error(`unknown theme '${target}'. Available: ${listThemes().map((x) => x.name).join(', ')}`);
  }
  const next = { ...config, theme: target };
  saveConfig(next);
  io.stdout.write(`${t('cli.themeChanged', lang)} → ${target}\n`);
}

async function cmdLang(args, { io, config }) {
  const lang = resolveRuntimeLang(config);
  const target = args.positionals[0];
  if (!target) {
    io.stdout.write(`${t('startPage.lang', lang)}: ${lang}\n`);
    return;
  }
  const r = resolveLang(target);
  saveConfig({ ...config, lang: r });
  io.stdout.write(`${t('cli.langChanged', lang)} → ${r}\n`);
}

async function cmdConfig(args, { io, config }) {
  const lang = resolveRuntimeLang(config);
  const c = palette(getTheme(config.theme ?? DEFAULT_THEME));
  if (args.positionals[0] === 'path') {
    io.stdout.write(`${t('cli.configPath', lang)}: ${defaultConfigPath()}\n`);
    return;
  }
  const rows = [
    ['lang', config.lang || DEFAULT_LANG],
    ['theme', config.theme || DEFAULT_THEME],
    ['provider', config.provider || 'stub'],
    ['model', config.model || '(default)'],
    ['apiKey', config.apiKey ? '***set***' : '(unset)'],
    ['baseUrl', config.baseUrl || '(default)'],
  ];
  io.stdout.write(keyValue(rows, { theme: getTheme(config.theme ?? DEFAULT_THEME), keyW: 12 }) + '\n');
  io.stdout.write(c.dim(`${t('cli.configPath', lang)}: ${defaultConfigPath()}\n`));
}

async function cmdProviders(args, { io, config }) {
  const lang = resolveRuntimeLang(config);
  const c = palette(getTheme(config.theme ?? DEFAULT_THEME));
  io.stdout.write(c.gold('  providers\n'));
  for (const p of listProviders()) {
    io.stdout.write(`  ${c.accent(p.name.padEnd(12))} ${c.text(p.label.padEnd(22))} ${c.dim(p.keyHint)}\n`);
  }
}

async function cmdAgents(args, { io, config }) {
  const lang = resolveRuntimeLang(config);
  const c = palette(getTheme(config.theme ?? DEFAULT_THEME));
  io.stdout.write(c.gold('  sub-agents (10) — pipeline stages\n'));
  io.stdout.write(c.dim('  ' + '─'.repeat(64) + '\n'));
  for (const stage of PIPELINE_STAGES) {
    const roles = rolesForStage(stage);
    io.stdout.write(`  ${c.gold(STAGE_MOON[stage])} ${c.text(stage.padEnd(12))} ${c.dim(roles.map((r) => r.name).join(', '))}\n`);
  }
}

async function cmdVersion({ io }) {
  io.stdout.write(`selenyx ${VERSION}\n`);
}

async function cmdHelp({ io, config }) {
  const lang = resolveRuntimeLang(config);
  const c = palette(getTheme(config.theme ?? DEFAULT_THEME));
  const cmds = [
    ['selenyx', '打开月相起始页'],
    ['selenyx init', '运行首次配置向导'],
    ['selenyx ask <问题>', '启动 7 环节 / 10 子代理流水线'],
    ['selenyx theme [name]', '查看或切换 5 套月相主题'],
    ['selenyx lang [zh|en]', '查看或切换语言'],
    ['selenyx config [show|path]', '查看当前配置'],
    ['selenyx providers', '查看 7 家 LLM 厂商'],
    ['selenyx agents', '查看 10 个子代理角色与流水线'],
    ['selenyx version', '查看版本'],
    ['selenyx help', '显示本帮助'],
  ];
  io.stdout.write(c.gold('  Selenyx · 月相科研终端\n'));
  for (const [c1, d] of cmds) io.stdout.write(`  ${c.accent(c1.padEnd(28))} ${c.text(d)}\n`);
}

/* ---------- Main ---------- */

export async function main(argv, ioIn = {}) {
  const io = {
    stdout: ioIn.stdout ?? process.stdout,
    stderr: ioIn.stderr ?? process.stderr,
  };
  const args = parseArgs(argv);

  // 全局 flag：版本/帮助不需要 config
  if (args.flags.has('--version')) return cmdVersion({ io });
  if (args.flags.has('--help')) return cmdHelp({ io, config: {} });

  // 加载配置
  let config = loadConfig() ?? { lang: DEFAULT_LANG, theme: DEFAULT_THEME, provider: 'stub' };
  config = configWithEnvOverrides(config);
  if (getFlag(args.flags, '--lang')) config.lang = resolveLang(getFlagValue(args, '--lang'));
  if (getFlag(args.flags, '--theme')) config.theme = getFlagValue(args, '--theme');
  if (getFlag(args.flags, '--no-color')) process.env.SELENYX_NO_COLOR = '1';

  const command = args.command;

  try {
    if (!command || command === 'start') return await cmdStartPage(args, { io, config });
    if (command === 'init' || command === 'onboard' || command === 'setup') return await cmdInit(args, { io });
    if (command === 'ask' || command === 'research') return await cmdAsk(args, { io, config });
    if (command === 'theme') return await cmdTheme(args, { io, config });
    if (command === 'lang') return await cmdLang(args, { io, config });
    if (command === 'config') return await cmdConfig(args, { io, config });
    if (command === 'providers') return await cmdProviders(args, { io, config });
    if (command === 'agents' || command === 'subagents') return await cmdAgents(args, { io, config });
    if (command === 'version') return await cmdVersion({ io });
    if (command === 'help') return await cmdHelp({ io, config });
    throw new Error(`${t('cli.unknown', resolveRuntimeLang(config))}: ${command}. ${t('cli.tryHelp', resolveRuntimeLang(config))}`);
  } catch (err) {
    io.stderr.write(`\n  ✗ ${err.message}\n\n`);
    if (process.env.SELENYX_DEBUG) io.stderr.write(`${err.stack}\n`);
    process.exitCode = 1;
  }
}
