import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'scripts/_shots';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:5558';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + '/ru/prodat/', { waitUntil: 'networkidle', timeout: 45000 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

const kpis = page.locator('.rl-kpis').first();
await kpis.scrollIntoViewIfNeeded();
await page.waitForFunction(() => {
  const imgs = [...document.querySelectorAll('.rl-kpis img')];
  return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
}, { timeout: 15000 });
await page.waitForTimeout(500);

// Обычный вид (idle), чтобы проверить анимации в статичном кадре
await kpis.screenshot({ path: `${OUT}/kpi-hover-idle.png` });

// Наводим курсор в верхний левый угол третьей карточки, чтобы увидеть наклон+блик
const card = page.locator('.rl-kpi').nth(2);
const box = await card.boundingBox();
await page.mouse.move(box.x + box.width * 0.22, box.y + box.height * 0.22, { steps: 15 });
await page.waitForTimeout(200);
await kpis.screenshot({ path: `${OUT}/kpi-hover-active.png` });

await browser.close();
console.log('done');
