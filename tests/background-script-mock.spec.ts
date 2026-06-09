'use strict';

/**
 * Example tests demonstrating sinon-based browser API mocking for background scripts.
 *
 * These tests load the real extension background scripts in a browser page with
 * a mocked browser.* API (via sinon stubs), then use page.evaluate() to
 * exercise functions and verify behavior.
 *
 * This pattern enables behavioral testing of any background script function that
 * depends on browser.tabs, browser.storage, or other extension APIs.
 */

import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const DEST = 'keepassxc-browser/tests';

test.describe('Background script mock tests', () => {
    let page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await page.goto(pathToFileURL(`${DEST}/background-script-mock.html`).toString());
        await page.waitForFunction(() =>
            typeof keepass !== 'undefined'
            && typeof tabs !== 'undefined'
            && typeof sinon !== 'undefined'
        );
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('tabs.createTabEntry creates a retrievable tab entry', async () => {
        const result = await page.evaluate(() => {
            tabs.createTabEntry(42);
            const tab = tabs.getTabFromId(42);
            const hasTab = tab !== undefined;
            const emptyLoginList = tab?.loginList?.length === 0;
            tabs.deleteTabEntry(42);
            return { hasTab, emptyLoginList };
        });

        expect(result.hasTab).toBe(true);
        expect(result.emptyLoginList).toBe(true);
    });

    test('tabs.deleteTabEntry removes the tab', async () => {
        const result = await page.evaluate(() => {
            tabs.createTabEntry(42);
            tabs.deleteTabEntry(42);
            return tabs.getTabFromId(42);
        });

        expect(result).toBeUndefined();
    });

    test('keepass.updateDatabaseHashToContent sends to current tab', async () => {
        const result = await page.evaluate(async () => {
            browser.tabs.query.resolves([{ id: 10 }]);
            browser.tabs.sendMessage.resolves();

            keepass.previousDatabaseHash = 'old-hash';
            keepass.databaseHash = 'new-hash';
            keepass.isKeePassXCAvailable = true;

            await keepass.updateDatabaseHashToContent();

            const queryCall = browser.tabs.query.lastCall;
            const sendCall = browser.tabs.sendMessage.lastCall;

            return {
                queryArg: queryCall?.args[0],
                sendTabId: sendCall?.args[0],
                sendMessage: sendCall?.args[1],
                previousHash: keepass.previousDatabaseHash,
            };
        });

        expect(result.sendTabId).toBe(10);
        expect(result.sendMessage.action).toBe('check_database_hash');
        expect(result.sendMessage.hash).toEqual({ old: 'old-hash', new: 'new-hash' });
        expect(result.sendMessage.connected).toBe(true);
        expect(result.previousHash).toBe('new-hash');
    });
});
