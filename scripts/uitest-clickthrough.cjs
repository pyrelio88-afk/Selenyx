/* v0.02 全界面交互穿透测试：
   1. 遍历 7 项主导航 + 容器页 tab，收集 console/pageerror
   2. 验证关键交互的"深度思考"反馈态（提交中转圈/禁用、AI 回复流式或诚实失败）
   3. 验证版本号 v0.02、新导航图标渲染
   输出 JSON 结果 + 截图到 artifacts/uitest/ */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'artifacts', 'uitest');
const BASE = 'http://127.0.0.1:5173/';
const results = [];
const errors = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.USERPROFILE + '\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(12000);
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text().slice(0, 160)}`); });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 160)}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  // 1. 版本号
  const brand = await page.locator('.workspace-brand-subtitle').textContent().catch(() => '');
  record('版本号 v0.02', (brand || '').includes('0.02'), `侧栏显示 "${brand}"`);

  // 2. 新导航图标（SVG 渲染数量）
  const navIcons = await page.locator('.sidebar-nav .nav-item svg').count();
  record('导航图标渲染', navIcons >= 7, `${navIcons} 个 SVG`);

  // 3. 主导航遍历
  const navs = ['助理', '项目', '知识库', '专家·技能·连接器', '自动化', '更多', '新建任务'];
  for (const label of navs) {
    await page.locator(`nav button:has-text("${label}")`).first().click();
    await page.waitForTimeout(700);
    const active = await page.locator('nav button.active').first().textContent().catch(() => '');
    record(`导航「${label}」`, (active || '').includes(label.slice(0, 2)), `active=${(active || '').trim()}`);
  }

  // 4. 知识库 6 tab
  await page.locator('nav button:has-text("知识库")').first().click();
  await page.waitForTimeout(700);
  for (const tab of ['文献', '文档·笔记', '证据卡', '表格', '临床数据', '图片·文件']) {
    const btn = page.locator(`.tabbar button:has-text("${tab}")`).first();
    const exists = await btn.count();
    if (!exists) { record(`知识库 tab「${tab}」`, false, 'tab 不存在'); continue; }
    await btn.click();
    await page.waitForTimeout(500);
    record(`知识库 tab「${tab}」`, true, '可点击切换');
  }
  await page.screenshot({ path: path.join(OUT, 'tab-evidence.png') });

  // 5. 专家·技能·连接器 3 tab
  await page.locator('nav button:has-text("专家·技能·连接器")').first().click();
  await page.waitForTimeout(700);
  for (const tab of ['专家', '技能', '连接器']) {
    const btn = page.locator(`.tabbar button:has-text("${tab}")`).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(500); record(`扩展 tab「${tab}」`, true, 'ok'); }
    else record(`扩展 tab「${tab}」`, false, 'tab 不存在');
  }

  // 6. 设置弹窗：Ctrl+, 打开 → 9 分区 → Esc 关闭
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(700);
  const sections = await page.locator('.settings-modal-rail button, .settings-modal-tab').count();
  record('设置弹窗 9 分区', sections >= 9, `${sections} 个分区`);
  await page.screenshot({ path: path.join(OUT, 'settings-modal.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const modalGone = (await page.locator('.settings-modal-rail').count()) === 0;
  record('设置弹窗 Esc 关闭', modalGone, modalGone ? '已关闭' : '仍可见');

  // 7. 用户浮层
  await page.locator('.user-trigger').first().click();
  await page.waitForTimeout(500);
  const popRows = await page.locator('.user-popover-item, .user-popover-row').count();
  record('用户浮层内容', popRows >= 4, `${popRows} 行（显示宠物/外观/设置/更新/反馈/关于）`);
  await page.screenshot({ path: path.join(OUT, 'user-popover.png') });
  await page.keyboard.press('Escape');

  // 8. 新建任务：模板卡填入 → 芯片开关 → 提交反馈态（深度思考起点）
  await page.locator('nav button:has-text("新建任务")').first().click();
  await page.waitForTimeout(800);
  const templateBtn = page.locator('.newtask-template:has-text("证据梳理")').first();
  try {
    await templateBtn.click({ timeout: 6000 });
  } catch {
    await page.screenshot({ path: path.join(OUT, 'debug-step8.png') });
    const cls = await page.locator('main > div, main div').first().getAttribute('class').catch(() => '?');
    record('模板卡填入输入框', false, `模板卡不可点，main 首节点 class=${cls}，截图 debug-step8.png`);
    throw new Error('step8 abort');
  }
  await page.waitForTimeout(300);
  const filled = await page.locator('.newtask-composer-textarea').inputValue();
  record('模板卡填入输入框', filled.length > 10, `填入 ${filled.length} 字`);
  const reviewChip = page.locator('.newtask-chip:has-text("成稿前批评审查")').first();
  await reviewChip.click();
  const chipOn = await reviewChip.getAttribute('class');
  record('芯片开关切换', (chipOn || '').includes('is-on'), `class=${chipOn}`);

  // 提交 → 观察"创建中…"禁用态 → 任务详情时间线（深度思考的落点）
  const submitBtn = page.locator('.newtask-submit');
  await submitBtn.click();
  const midState = await submitBtn.textContent().catch(() => '');
  const midDisabled = await submitBtn.isDisabled().catch(() => true); // 已跳转=视为提交中态结束
  let landed = false;
  try {
    await page.locator('text=运行记录').first().waitFor({ timeout: 10000 });
    landed = true;
  } catch { /* 停留在主页 */ }
  await page.waitForTimeout(2500);
  const steps = await page.locator('.agent-step').count();
  const detailGoal = await page.locator('text=盘点当前项目的证据链').count();
  record(
    '任务提交反馈态（深度思考）',
    landed && (steps > 0 || detailGoal > 0),
    `提交中文案="${(midState || '').trim()}" disabled=${midDisabled}；落地任务视图=${landed} 时间线步骤=${steps} 详情目标=${detailGoal}`
  );
  await page.screenshot({ path: path.join(OUT, 'after-submit.png') });

  // 9. 助理页：发送 → 流式/思考态或诚实错误
  await page.locator('nav button:has-text("助理")').first().click();
  await page.waitForTimeout(900);
  const chatInput = page.locator('textarea').last();
  await chatInput.fill('你好，测试流式反馈');
  await chatInput.press('Enter');
  await page.waitForTimeout(600);
  const thinking = await page.locator('[class*="stream"], [class*="thinking"], [class*="loading"], [class*="pending"]').count();
  await page.waitForTimeout(2500);
  const bubbles = await page.locator('[class*="msg"], [class*="bubble"]').count();
  const bodyText = await page.locator('main').textContent().catch(() => '');
  const honest = (bodyText || '').includes('设置') || (bodyText || '').includes('Key') || (bodyText || '').includes('后端');
  record('助理发送反馈（思考态/诚实失败）', thinking > 0 || bubbles > 0, `思考态节点=${thinking} 气泡=${bubbles} 诚实提示=${honest}`);
  await page.screenshot({ path: path.join(OUT, 'assistant-send.png') });

  // 10. 自动化：切到 cron 节奏 → 校验反馈
  await page.locator('nav button:has-text("自动化")').first().click();
  await page.waitForTimeout(800);
  await page.locator('select').first().selectOption('cron');
  await page.waitForTimeout(400);
  const cronInput = page.locator('input[aria-label="cron 表达式"]');
  if (await cronInput.count()) {
    await cronInput.fill('61 * * * *');
    await page.waitForTimeout(400);
    const invalid = await cronInput.getAttribute('aria-invalid');
    record('cron 非法即时校验', invalid === 'true', `aria-invalid=${invalid}`);
    await cronInput.fill('0 8 * * 1-5');
    await page.waitForTimeout(400);
    const valid = await cronInput.getAttribute('aria-invalid');
    record('cron 合法通过', valid !== 'true', `aria-invalid=${valid}`);
  } else record('cron 输入框', false, '切换 cron 节奏后仍未出现');

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(`\n== ${results.filter(r => r.pass).length}/${results.length} 通过；console/pageerror ${errors.length} 条 ==`);
  errors.slice(0, 10).forEach((e) => console.log('  ', e));
  await browser.close();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
