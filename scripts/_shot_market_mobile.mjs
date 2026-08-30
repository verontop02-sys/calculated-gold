import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'scripts/_shots';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:5559';

const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(BASE + '/ru/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  const tiles = page.locator('.rl-market-tiles').first();
  await tiles.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('.rl-market-tile')];
    return imgs.length > 0;
  }, { timeout: 15000 });
  await page.waitForTimeout(600);
  await tiles.screenshot({ path: `${OUT}/market-mobile-${theme}.png` });
  console.log(`OK market-mobile-${theme}`);
  await ctx.close();
}
await browser.close();
