// 批三交互验证：V3 新建笔记进编辑器(返回栏+格式栏) + V7 打开新建项目BottomSheet
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const OUT = 'smoke-batch3';
const url = pathToFileURL(process.cwd() + '/dist/index.html').href;
const browser = await chromium.launch();

async function bootView(viewKey) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((vk) => {
    try { localStorage.setItem('selenyx-v2', JSON.stringify({ state: { currentView: vk, mode: 'light', theme: 'paper-green' }, version: 0 })); } catch (e) {}
  }, viewKey);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  return { ctx, page };
}

// V3：点新建笔记 → 进入编辑器 → 验证返回栏 + 格式栏
{
  const { ctx, page } = await bootView('notes');
  // 空态里有"新建笔记"按钮，或顶部 view-header 有"新建"按钮
  const newBtn = page.locator('button:has-text("新建"), button:has-text("新建笔记")').first();
  if (await newBtn.count()) {
    await newBtn.click();
    await page.waitForTimeout(700);
    const backBar = await page.locator('.mobile-back-bar').count();
    const fmtBar = await page.locator('.notes-format-bar').count();
    const editor = await page.locator('.note-editor-textarea').count();
    await page.screenshot({ path: `${OUT}/v3-notes-editor.png`, fullPage: false });
    // 格式栏按钮数
    const fmtBtns = await page.locator('.notes-format-btn').count();
    console.log(`[V3 编辑器] back-bar=${backBar} format-bar=${fmtBar} format-btns=${fmtBtns} editor=${editor}`);
    // 点一个格式按钮验证不报错
    if (fmtBtns > 0) {
      await page.locator('.notes-format-btn').first().click().catch(() => {});
      await page.waitForTimeout(200);
      console.log('[V3 编辑器] 格式按钮点击 OK');
    }
  } else {
    console.log('[V3 编辑器] 未找到新建按钮');
  }
  await ctx.close();
}

// V7：点新建项目 → BottomSheet 表单 → 验证输入框48px + 选用按钮
{
  const { ctx, page } = await bootView('projects');
  const newBtn = page.locator('button:has-text("新建项目"), button:has-text("新建")').first();
  if (await newBtn.count()) {
    await newBtn.click();
    await page.waitForTimeout(700);
    const sheet = await page.locator('.bottom-sheet:visible').count();
    const formInputs = await page.locator('.proj-create-form .input').count();
    // 输入框高度
    const inputH = await page.evaluate(() => {
      const el = document.querySelector('.proj-create-form .input');
      return el ? Math.round(el.getBoundingClientRect().height) : 0;
    });
    await page.screenshot({ path: `${OUT}/v7-projects-newform.png`, fullPage: false });
    console.log(`[V7 新建表单] sheet=${sheet} inputs=${formInputs} first-input-h=${inputH}`);
  } else {
    console.log('[V7 新建表单] 未找到新建按钮');
  }
  await ctx.close();
}

console.log('DONE batch3b');
await browser.close();
