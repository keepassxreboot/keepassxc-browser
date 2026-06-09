'use strict';

import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const DEST = 'keepassxc-browser/tests';

test.describe('updateDatabaseHashToContent broadcasts to all tabs', () => {
    let page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await page.goto(pathToFileURL(`${DEST}/background-script-mock.html`).toString());
        await page.waitForFunction(() =>
            typeof keepass !== 'undefined'
            && typeof sinon !== 'undefined'
        );
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('sends notification to all open tabs', async () => {
        const result = await page.evaluate(async () => {
            browser.tabs.query.resolves([{ id: 10 }, { id: 20 }, { id: 30 }]);
            browser.tabs.sendMessage.resolves();

            keepass.previousDatabaseHash = 'old-hash';
            keepass.databaseHash = 'new-hash';
            keepass.isKeePassXCAvailable = true;

            await keepass.updateDatabaseHashToContent();

            return {
                queryArg: browser.tabs.query.lastCall.args[0],
                sendCallCount: browser.tabs.sendMessage.callCount,
                sentTabIds: browser.tabs.sendMessage.args.map(a => a[0]),
                previousHash: keepass.previousDatabaseHash,
            };
        });

        expect(result.queryArg).toEqual({});
        expect(result.sendCallCount).toBe(3);
        expect(result.sentTabIds).toEqual([10, 20, 30]);
        expect(result.previousHash).toBe('new-hash');
    });

    test('one failing tab does not prevent others from receiving notification', async () => {
        const result = await page.evaluate(async () => {
            browser.tabs.query.resolves([{ id: 1 }, { id: 2 }, { id: 3 }]);
            browser.tabs.sendMessage
                .resolves()
                .withArgs(2, sinon.match.any)
                .rejects(new Error('Tab 2 content script unavailable'));

            keepass.previousDatabaseHash = 'old';
            keepass.databaseHash = 'new';
            keepass.isKeePassXCAvailable = true;

            await keepass.updateDatabaseHashToContent();

            return {
                sendCallCount: browser.tabs.sendMessage.callCount,
                sentTabIds: browser.tabs.sendMessage.args.map(a => a[0]),
            };
        });

        expect(result.sendCallCount).toBe(3);
        expect(result.sentTabIds).toEqual([1, 2, 3]);
    });

    test('skips tabs without an id', async () => {
        const result = await page.evaluate(async () => {
            browser.tabs.query.resolves([{ id: 1 }, { id: undefined }, { id: 3 }]);
            browser.tabs.sendMessage.resolves();

            keepass.previousDatabaseHash = 'old';
            keepass.databaseHash = 'new';
            keepass.isKeePassXCAvailable = true;

            await keepass.updateDatabaseHashToContent();

            return {
                sendCallCount: browser.tabs.sendMessage.callCount,
                sentTabIds: browser.tabs.sendMessage.args.map(a => a[0]),
            };
        });

        expect(result.sendCallCount).toBe(2);
        expect(result.sentTabIds).toEqual([1, 3]);
    });

    test('sends correct hash and connected status in message', async () => {
        const result = await page.evaluate(async () => {
            browser.tabs.query.resolves([{ id: 1 }]);
            browser.tabs.sendMessage.resolves();

            keepass.previousDatabaseHash = 'hash-A';
            keepass.databaseHash = 'hash-B';
            keepass.isKeePassXCAvailable = true;

            await keepass.updateDatabaseHashToContent();

            return browser.tabs.sendMessage.lastCall.args[1];
        });

        expect(result.action).toBe('check_database_hash');
        expect(result.hash).toEqual({ old: 'hash-A', new: 'hash-B' });
        expect(result.connected).toBe(true);
    });

    test('updates previousDatabaseHash after broadcasting', async () => {
        const result = await page.evaluate(async () => {
            browser.tabs.query.resolves([{ id: 1 }]);
            browser.tabs.sendMessage.resolves();

            keepass.previousDatabaseHash = 'before';
            keepass.databaseHash = 'after';
            keepass.isKeePassXCAvailable = true;

            await keepass.updateDatabaseHashToContent();

            return keepass.previousDatabaseHash;
        });

        expect(result).toBe('after');
    });
});
