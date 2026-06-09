'use strict';

/**
 * Example tests demonstrating sinon-based browser API mocking for content scripts.
 *
 * These tests load the real extension content scripts in a browser page with
 * a mocked browser.* API (via sinon stubs), then use page.evaluate() to
 * exercise functions and verify behavior.
 *
 * This pattern enables behavioral testing of any content script function that
 * depends on browser.runtime.sendMessage or other extension APIs.
 */

import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const DEST = 'keepassxc-browser/tests';

test.describe('Content script mock tests', () => {
    let page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await page.goto(pathToFileURL(`${DEST}/content-script-mock.html`).toString());
        await page.waitForFunction(() =>
            typeof kpxc !== 'undefined'
            && typeof DatabaseState !== 'undefined'
            && typeof sinon !== 'undefined'
        );
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('updateDatabaseState sets UNLOCKED when database is open', async () => {
        const state = await page.evaluate(async () => {
            browser.runtime.sendMessage.resolves({
                keePassXCAvailable: true,
                databaseClosed: false,
            });

            kpxc.databaseState = DatabaseState.DISCONNECTED;
            await kpxc.updateDatabaseState();
            return kpxc.databaseState;
        });

        expect(state).toBe(2); // DatabaseState.UNLOCKED
    });

    test('updateDatabaseState sets LOCKED when database is closed', async () => {
        const state = await page.evaluate(async () => {
            browser.runtime.sendMessage.resolves({
                keePassXCAvailable: true,
                databaseClosed: true,
            });

            kpxc.databaseState = DatabaseState.DISCONNECTED;
            await kpxc.updateDatabaseState();
            return kpxc.databaseState;
        });

        expect(state).toBe(1); // DatabaseState.LOCKED
    });

    test('updateDatabaseState sets DISCONNECTED when KeePassXC unavailable', async () => {
        const state = await page.evaluate(async () => {
            browser.runtime.sendMessage.resolves({
                keePassXCAvailable: false,
            });

            kpxc.databaseState = DatabaseState.UNLOCKED;
            await kpxc.updateDatabaseState();
            return kpxc.databaseState;
        });

        expect(state).toBe(0); // DatabaseState.DISCONNECTED
    });

    test('updateDatabaseState sends get_status message', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage.resolves({
                keePassXCAvailable: true,
                databaseClosed: false,
            });

            await kpxc.updateDatabaseState();

            const call = browser.runtime.sendMessage.lastCall;
            return { action: call.args[0].action, args: call.args[0].args };
        });

        expect(result.action).toBe('get_status');
        expect(result.args).toEqual([true]);
    });

    test('reconnect returns true when already connected', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'is_connected' }))
                .resolves(true);

            return await kpxc.reconnect();
        });

        expect(result).toBe(true);
    });

    test('reconnect attempts reconnection when not connected', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'is_connected' }))
                .resolves(false);
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'reconnect' }))
                .resolves({ keePassXCAvailable: true });

            return await kpxc.reconnect();
        });

        expect(result).toBe(true);
    });

    test('reconnect returns false when KeePassXC unavailable', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'is_connected' }))
                .resolves(false);
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'reconnect' }))
                .resolves({ keePassXCAvailable: false });
            kpxcUI.createNotification = sinon.stub();

            return await kpxc.reconnect();
        });

        expect(result).toBe(false);
    });
});
