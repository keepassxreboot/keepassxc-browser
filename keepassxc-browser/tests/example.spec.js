'use strict';

const { chromium, test, expect } = require('@playwright/test');
const fileUrl = require('file-url');

const DEST = 'keepassxc-browser/tests';

test.beforeEach(async ({ page }) => {
    await page.goto(fileUrl(`${DEST}/tests.html`));
});

test.describe('Content script tests', () => {
    test('General tests', async ({ page }) => {
        const resultCount = await page.locator('css=#general-results >> css=.fa').count();
        await expect.soft(resultCount).toBeGreaterThan(0);

        for (var i = 0; i < resultCount; i++) {
            const elem = await page.locator('css=#general-results >> css=.fa').nth(i);
            const id = await elem.getAttribute('id');
            await expect.soft(elem, id).toHaveClass('fa fa-check');
        }
    });

    test('Input field matching tests', async ({ page }) => {
        const resultCount = await page.locator('css=#input-field-results >> css=.fa').count();
        await expect.soft(resultCount).toBeGreaterThan(0);

        for (var i = 0; i < resultCount; i++) {
            const elem = await page.locator('css=#input-field-results >> css=.fa').nth(i);
            const id = await elem.getAttribute('id');
            await expect.soft(elem, id).toHaveClass('fa fa-check');
        }
    });

    test('Search field tests', async ({ page }) => {
        const resultCount = await page.locator('css=#search-field-results >> css=.fa').count();
        await expect.soft(resultCount).toBeGreaterThan(0);

        for (var i = 0; i < resultCount; i++) {
            const elem = await page.locator('css=#search-field-results >> css=.fa').nth(i);
            const id = await elem.getAttribute('id');
            await expect.soft(elem, id).toHaveClass('fa fa-check');
        }
    });

    test('TOTP field tests', async ({ page }) => {
        const resultCount = await page.locator('css=#totp-field-results >> css=.fa').count();
        await expect.soft(resultCount).toBeGreaterThan(0);

        for (var i = 0; i < resultCount; i++) {
            const elem = await page.locator('css=#totp-field-results >> css=.fa').nth(i);
            const id = await elem.getAttribute('id');
            await expect.soft(elem, id).toHaveClass('fa fa-check');
        }
    });

    test('Password change tests', async ({ page }) => {
        const resultCount = await page.locator('css=#password-change-results >> css=.fa').count();
        await expect.soft(resultCount).toBeGreaterThan(0);

        for (var i = 0; i < resultCount; i++) {
            const elem = await page.locator('css=#password-change-results >> css=.fa').nth(i);
            const id = await elem.getAttribute('id');
            await expect.soft(elem, id).toHaveClass('fa fa-check');
        }
    });
});

const verifyResults = async(page, selector) => {
    const resultCount = await page.locator(`css=#${selector} >> css=.fa`).count();

    const elem = await page.locator(`css=#${selector} >> css=.fa`).nth(0);
    const id = await elem.getAttribute('id');
    await expect.soft(elem, id).toHaveClass('fa fa-check');
};
