/**
 * 개발 전용 — doc-search 하네스를 헤드리스로 열어 스크린샷을 남기고
 * 페이지네이션 동작을 확인한다.
 *
 * 사용:
 *   npx vite --port 3097 --strictPort &
 *   node scripts/verify-doc-search-harness.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = process.env.HARNESS_URL || 'http://localhost:3097/doc-search-harness.html';
const OUT = '/tmp/doc-search-harness';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('nav', { timeout: 15000 });

// ── 1. 초과 안내는 배너가 아니라 호버 표식 ───────────────────────────
const noticeMark = page.getByRole('note');
const noticeText = (await noticeMark.getAttribute('aria-label')) ?? '';
check(
  'notice: i18n 해소',
  !noticeText.includes('com_document_search') && noticeText.length > 10,
  JSON.stringify(noticeText),
);
check('notice: 상한 100 표기', noticeText.includes('100'), noticeText);
check(
  'notice: 평상시엔 문구가 안 보인다',
  !(await page.getByText(noticeText, { exact: true }).count()),
);

const markBox = await noticeMark.boundingBox();
check('notice: 표식이 작다 (배너 아님)', markBox.width < 40 && markBox.height < 40,
  `${Math.round(markBox.width)}x${Math.round(markBox.height)}px`);

// Ariakit 툴팁은 표시까지 지연이 있다 (실측 ~700ms).
await noticeMark.hover();
let tooltipShown = false;
try {
  await page.locator('[role="tooltip"]').first().waitFor({ state: 'visible', timeout: 5000 });
  tooltipShown = true;
} catch {
  tooltipShown = false;
}
check('notice: 호버하면 툴팁이 뜬다', tooltipShown);
check(
  'notice: 툴팁 내용이 안내 문구다',
  tooltipShown && (await page.locator('[role="tooltip"]').first().innerText()).includes('100건'),
);

await page.screenshot({ path: `${OUT}/tooltip.png`, fullPage: true });

// 툴팁을 걷어내야 이후 스크린샷·클릭에 안 걸린다.
await page.mouse.move(0, 0);
await page.locator('[role="tooltip"]').first().waitFor({ state: 'detached' }).catch(() => {});

// ── 1b. 다중 검색어 하이라이트 ───────────────────────────────────────
const marks = await page.locator('mark').allInnerTexts();
const uniqueMarks = [...new Set(marks)];
check(
  '하이라이트: 쉼표로 구분한 검색어를 모두 칠한다',
  uniqueMarks.includes('세종텔레콤') && uniqueMarks.includes('아이즈비전'),
  uniqueMarks.join(','),
);

// 케이스는 10/3/2/1 페이지 4개인데, 1페이지짜리는 네비게이션을 통째로
// 감춰야 하므로 nav 는 3개여야 한다.
const navs = page.locator('nav');
check('1페이지 케이스는 nav 를 렌더하지 않음', (await navs.count()) === 3, `nav=${await navs.count()}`);

// ── 2. 10페이지 케이스 ───────────────────────────────────────────────
const tenPager = navs.nth(0);
const numbers = await tenPager.locator('button[aria-current], button').allInnerTexts();
check(
  '10페이지: 1~10 버튼 존재',
  Array.from({ length: 10 }, (_, i) => String(i + 1)).every((n) => numbers.includes(n)),
  numbers.join(','),
);
check(
  '10페이지: 이전/다음 라벨',
  numbers[0] === '이전' && numbers[numbers.length - 1] === '다음',
  `${numbers[0]} / ${numbers[numbers.length - 1]}`,
);
check(
  '초기 상태: 이전 비활성',
  await tenPager.getByRole('button', { name: '이전' }).isDisabled(),
);
check(
  '초기 상태: 1번 강조',
  (await tenPager.locator('button[aria-current="page"]').innerText()) === '1',
);

// 한 줄에 들어가는지 (줄바꿈/오버플로 확인)
const box = await tenPager.boundingBox();
const btnBoxes = await tenPager.locator('button').evaluateAll((els) =>
  els.map((e) => e.getBoundingClientRect().top),
);
check(
  '10페이지: 한 줄 유지 (줄바꿈 없음)',
  new Set(btnBoxes.map((t) => Math.round(t))).size === 1,
  `행 수=${new Set(btnBoxes.map((t) => Math.round(t))).size}, 폭=${Math.round(box.width)}px`,
);

await page.screenshot({ path: `${OUT}/light.png`, fullPage: true });

// ── 3. 3페이지 케이스에서 마지막 페이지로 이동 ───────────────────────
const threePager = navs.nth(1);
await threePager.getByRole('button', { name: '3', exact: true }).click();
await page.waitForTimeout(200);

const section = page.locator('section', { hasText: '3페이지 (25건)' });
check(
  '페이지 이동: 현재 페이지 갱신',
  (await section.innerText()).includes('현재 3 페이지'),
);
check(
  '페이지 이동: 3번 강조',
  (await threePager.locator('button[aria-current="page"]').innerText()) === '3',
);
check(
  '마지막 페이지: 다음 비활성',
  await threePager.getByRole('button', { name: '다음' }).isDisabled(),
);
check(
  '마지막 페이지: 이전 활성',
  await threePager.getByRole('button', { name: '이전' }).isEnabled(),
);

await page.screenshot({ path: `${OUT}/page3.png`, fullPage: true });

// ── 4. 다크 모드 ─────────────────────────────────────────────────────
await page.getByRole('button', { name: '다크 모드' }).click();
await page.waitForTimeout(300);

const darkMark = await page
  .locator('mark')
  .first()
  .evaluate((el) => getComputedStyle(el).backgroundColor);
check('다크: 하이라이트가 남아 있다', /\d/.test(darkMark), darkMark);
check('다크: 초과 표식이 남아 있다', (await page.getByRole('note').count()) > 0);

await page.screenshot({ path: `${OUT}/dark.png`, fullPage: true });

check('콘솔 에러 없음', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
console.log(`screenshots: ${OUT}/{light,page3,dark}.png`);
process.exit(failed.length ? 1 : 0);
