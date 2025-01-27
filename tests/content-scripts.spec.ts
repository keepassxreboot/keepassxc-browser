'use strict';

import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const DEST = 'keepassxc-browser/tests';

let page;

test.describe('Content script tests', () => {
    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage();
        await page.goto(pathToFileURL(`${DEST}/tests.html`).toString());
    });

    test('Input field matching tests', async() => {
        await verifyResults('input-field-results');
    });

    test('Search field tests', async () => {
        await verifyResults('search-field-results');
    });

    test('TOTP field tests', async () => {
        await verifyResults('totp-field-results');
    });

    test('Password change tests', async () => {
        await verifyResults('password-change-results');
    });
});

const verifyResults = async(selector) => {
    const resultCount = await page.locator(`css=#${selector} >> css=.fa`).count();
    await expect.soft(resultCount).toBeGreaterThan(0);

    for (let i = 0; i < resultCount; i++) {
        const elem = await page.locator(`css=#${selector} >> css=.fa`).nth(i);
        const id = await elem.getAttribute('id');
        await expect.soft(elem, id).toHaveClass('fa fa-check');
    }
};
