import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('keepassxc-browser');
const stylesheet = fs.readFileSync(path.join(source, 'css/autocomplete.css'), 'utf8');
const colors = fs.readFileSync(path.join(source, 'css/colors.css'), 'utf8');

declare const testMenu: any;
declare const Autocomplete: any;
declare const kpxc: any;
declare const kpxcFields: any;
declare const kpxcUI: any;

type Options = {
    compact?: boolean;
    groups?: boolean;
    top?: number;
    height?: number;
    zoom?: number;
    relative?: boolean;
    popover?: boolean;
    delay?: number;
    styleDelay?: number;
    count?: number;
    footer?: boolean;
};

async function openMenu(page: Page, options: Options = {}) {
    const settings = { compact: true, groups: false, top: 200, height: 300, zoom: 1,
        relative: false, popover: true, delay: 0, styleDelay: 0, count: 60, footer: false, ...options };
    await page.setViewportSize({ width: 690, height: settings.height });
    await page.setContent(`<style>body { margin: 20px; zoom: ${settings.zoom};
        position: ${settings.relative ? 'relative' : 'static'}; }
        input { position: absolute; top: ${settings.top / settings.zoom}px; left: 40px;
        width: 400px; height: 40px; box-sizing: border-box; }</style><input id="username">`);
    // Load the real element/coordinate helpers, without the unrelated banner and browser APIs.
    const uiSource = fs.readFileSync(path.join(source, 'content/ui.js'), 'utf8');
    const uiHelpers = uiSource.split('kpxcUI.isRTL =')[0];
    const wrapperObserver = uiSource.slice(uiSource.indexOf('kpxcUI.createWrapperObserver ='),
        uiSource.indexOf('// Observer <html>'));
    await page.addScriptTag({ content: uiHelpers + wrapperObserver + 'kpxcUI.createWrapperObserver();' });
    await page.addScriptTag({ content: `
        const SORT_BY_MATCHING_CREDENTIALS_SETTING = 0;
        const SORT_BY_RELEVANT_ENTRY = 1;
        const kpxc = { settings: { useCompactMode: ${settings.compact}, autoCompleteUsernames: true },
            updateTOTPList: async () => {} };
        const kpxcFields = { popoverSupported: ${settings.popover} };
        const kpxcSites = { detectUsernameFromPage: () => '' };
        const sendMessage = async () => {
            await new Promise(resolve => setTimeout(resolve, ${settings.delay}));
            return '';
        };
        const Pixels = value => value + 'px';
        const initColorTheme = () => {};
        const tr = () => 'Press Enter to sign in';
        const createStylesheet = name => {
            const style = document.createElement('style');
            setTimeout(() => {
                style.textContent = name.includes('autocomplete') ? ${JSON.stringify(stylesheet)} : ${JSON.stringify(colors)};
                style.dispatchEvent(new Event('load'));
            }, ${settings.styleDelay});
            return style;
        };
    ` });
    await page.addScriptTag({ path: path.join(source, 'content/autocomplete.js') });
    await page.evaluate(async settings => {
        const menu = new Autocomplete();
        (window as any).testMenu = menu;
        (window as any).kpxcUserAutocomplete = menu;
        (window as any).kpxcTOTPAutocomplete = { updatePosition() {}, closeList() {} };
        menu.elements = Array.from({ length: settings.count }, (_, index) => ({
            title: `Account ${index + 1}`, value: `user${index + 1}@example.test`,
            group: 'Test accounts', uuid: `test-${index}`
        }));
        const input = document.querySelector('input');
        await menu.create(input, false, settings.footer, settings.compact, settings.groups);
        await menu.showList(input);
        input.focus();
    }, settings);
    await expect.poll(() => page.evaluate(() => testMenu.list.children.length)).toBe(settings.count);
    await expect.poll(() => page.evaluate(() => testMenu.container.getBoundingClientRect().height)).toBeGreaterThan(20);
    // Wait until the delayed stylesheet has been applied, without forcing a reposition in the test.
    await expect.poll(() => page.evaluate(() => getComputedStyle(testMenu.list).overflowY)).toBe('auto');
}

async function bounds(page: Page) {
    return page.evaluate(() => {
        const menu = testMenu.container.getBoundingClientRect();
        const input = testMenu.input.getBoundingClientRect();
        return { top: menu.top, bottom: menu.bottom, height: menu.height,
            inputTop: input.top, inputBottom: input.bottom, viewport: window.innerHeight,
            scrollHeight: testMenu.list.scrollHeight, clientHeight: testMenu.list.clientHeight };
    });
}

for (const compact of [ true, false ]) {
    for (const top of [ 20, 150, 240 ]) {
        test(`fits the viewport: ${compact ? 'compact' : 'normal'}, input at ${top}`, async ({ page }) => {
            await openMenu(page, { compact, top });
            const box = await bounds(page);
            expect(box.top).toBeGreaterThanOrEqual(0);
            expect(box.bottom).toBeLessThanOrEqual(box.viewport);
            expect(box.bottom <= box.inputTop + 1 || box.top >= box.inputBottom - 1).toBe(true);
            expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
        });
    }
}

test('repositions after delayed credentials and styles arrive', async ({ page }) => {
    await openMenu(page, { delay: 100, styleDelay: 200 });
    const box = await bounds(page);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.viewport);
});

for (const groups of [ true, false ]) {
  test(`compact keyboard navigation reveals the last account (groups: ${groups})`, async ({ page }, testInfo) => {
    await openMenu(page, { groups });
    await page.keyboard.press('ArrowUp');
    const visible = await page.evaluate(() => {
        const item = testMenu.getAllItems()[59].firstElementChild.getBoundingClientRect();
        const list = testMenu.list.getBoundingClientRect();
        return { top: item.top, bottom: item.bottom, listTop: list.top, listBottom: list.bottom,
            scrollTop: testMenu.list.scrollTop, pageScroll: window.scrollY };
    });
    expect(visible.scrollTop).toBeGreaterThan(0);
    expect(visible.top).toBeGreaterThanOrEqual(visible.listTop - 1);
    expect(visible.bottom).toBeLessThanOrEqual(visible.listBottom + 1);
    expect(visible.pageScroll).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('last-account.png') });
  });
}

test('mouse wheel scrolls the credential list', async ({ page }) => {
    await openMenu(page);
    const point = await page.evaluate(() => {
        const rect = testMenu.list.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: Math.max(0, rect.top) + 30 };
    });
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => page.evaluate(() => testMenu.list.scrollTop)).toBeGreaterThan(0);
});

for (const zoom of [ 0.8, 1.25 ]) {
    test(`supports CSS zoom ${zoom} with a positioned body`, async ({ page }) => {
        await openMenu(page, { zoom, relative: true });
        const box = await bounds(page);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(box.viewport + 1);
        expect(Math.min(Math.abs(box.bottom - box.inputTop), Math.abs(box.top - box.inputBottom))).toBeLessThan(2);
    });
}

test('recalculates available height when the viewport grows', async ({ page }) => {
    await openMenu(page, { footer: true });
    const small = await bounds(page);
    await page.setViewportSize({ width: 690, height: 700 });
    await expect.poll(async () => (await bounds(page)).height).toBeGreaterThan(small.height);
    const large = await bounds(page);
    expect(large.bottom).toBeLessThanOrEqual(large.viewport);
});

test('preserves the CSS height limit in a tall viewport', async ({ page }) => {
    await openMenu(page, { height: 1000 });
    expect(await page.evaluate(() => testMenu.list.getBoundingClientRect().height)).toBeLessThanOrEqual(250);
});

test('keeps the selected account visible after shrinking the viewport', async ({ page }) => {
    await openMenu(page, { height: 700 });
    await page.keyboard.press('ArrowUp');
    await page.setViewportSize({ width: 690, height: 300 });
    await expect.poll(() => page.evaluate(() => {
        const item = testMenu.getAllItems()[59].firstElementChild.getBoundingClientRect();
        const list = testMenu.list.getBoundingClientRect();
        return item.top >= list.top - 1 && item.bottom <= list.bottom + 1;
    })).toBe(true);
});

test('positions without the Popover API', async ({ page }) => {
    await openMenu(page, { popover: false, relative: true });
    const box = await bounds(page);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.viewport);
});

for (const popover of [ true, false ]) {
    test(`stays aligned on a scrolled page (popover: ${popover})`, async ({ page }) => {
        await openMenu(page, { popover, relative: true });
        await page.evaluate(async () => {
            testMenu.closeList();
            document.body.style.height = '1500px';
            const input = document.querySelector('input')!;
            input.style.top = '600px';
            window.scrollTo(0, 450);
            await testMenu.showList(input);
        });
        const box = await bounds(page);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(box.viewport);
        expect(Math.min(Math.abs(box.bottom - box.inputTop), Math.abs(box.top - box.inputBottom))).toBeLessThan(2);
    });
}
