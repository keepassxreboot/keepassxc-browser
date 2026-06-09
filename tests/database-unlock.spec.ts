'use strict';

import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const DEST = 'keepassxc-browser/tests';

test.describe('iconClicked re-queries database state after reconnect', () => {
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

    test('fills credentials when database is already unlocked', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'is_connected' }))
                .resolves(true);
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'get_status' }))
                .resolves({ keePassXCAvailable: true, databaseClosed: false });

            kpxc.databaseState = DatabaseState.DISCONNECTED;
            kpxc.credentials = [{ login: 'user', password: 'pass' }];

            const field = document.getElementById('test-username');
            kpxcFields.isVisible = () => true;
            kpxcFields.isCustomLoginFieldsUsed = () => false;
            kpxcIcons.switchIcons = sinon.stub();
            kpxcFields.getCombination = sinon.stub().resolves({ username: field, password: null });
            kpxcFill.fillFromUsernameIcon = sinon.stub();

            const icon = document.createElement('div');
            await iconClicked(field, icon);

            return {
                state: kpxc.databaseState,
                filled: kpxcFill.fillFromUsernameIcon.calledOnce,
                manualFillSet: browser.runtime.sendMessage.calledWith(
                    sinon.match({ action: 'page_set_manual_fill' })
                ),
            };
        });

        expect(result.state).toBe(2); // UNLOCKED
        expect(result.filled).toBe(true);
        expect(result.manualFillSet).toBe(false);
    });

    test('re-queries background for real state instead of using stale cache', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'is_connected' }))
                .resolves(true);
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'get_status' }))
                .resolves({ keePassXCAvailable: true, databaseClosed: false });

            kpxc.databaseState = DatabaseState.DISCONNECTED;
            kpxc.credentials = [];

            const field = document.getElementById('test-username');
            kpxcFields.isVisible = () => true;
            kpxcFields.isCustomLoginFieldsUsed = () => false;
            kpxcIcons.switchIcons = sinon.stub();
            kpxc.initCredentialFields = sinon.stub().resolves();
            kpxcFields.getCombination = sinon.stub().resolves({ username: field, password: null });
            kpxcFill.fillFromUsernameIcon = sinon.stub();

            const icon = document.createElement('div');
            await iconClicked(field, icon);

            return {
                state: kpxc.databaseState,
                queriedStatus: browser.runtime.sendMessage.calledWith(
                    sinon.match({ action: 'get_status' })
                ),
                initedFields: kpxc.initCredentialFields.calledOnce,
            };
        });

        expect(result.state).toBe(2); // UNLOCKED
        expect(result.queriedStatus).toBe(true);
        expect(result.initedFields).toBe(true);
    });

    test('triggers unlock dialog when database is genuinely locked', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'is_connected' }))
                .resolves(true);
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'get_status' }))
                .resolves({ keePassXCAvailable: true, databaseClosed: true });
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'page_set_manual_fill' }))
                .resolves();
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'get_database_hash' }))
                .resolves();

            kpxc.databaseState = DatabaseState.DISCONNECTED;

            const field = document.getElementById('test-username');
            kpxcFields.isVisible = () => true;
            kpxcFields.isCustomLoginFieldsUsed = () => false;
            kpxcIcons.switchIcons = sinon.stub();

            const icon = document.createElement('div');
            await iconClicked(field, icon);

            return {
                state: kpxc.databaseState,
                setManualFill: browser.runtime.sendMessage.calledWith(
                    sinon.match({ action: 'page_set_manual_fill' })
                ),
                requestedHash: browser.runtime.sendMessage.calledWith(
                    sinon.match({ action: 'get_database_hash' })
                ),
            };
        });

        expect(result.state).toBe(1); // LOCKED
        expect(result.setManualFill).toBe(true);
        expect(result.requestedHash).toBe(true);
    });

    test('does not fill when reconnect fails', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage.resetHistory();
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'is_connected' }))
                .resolves(false);
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'reconnect' }))
                .resolves({ keePassXCAvailable: false });

            kpxc.databaseState = DatabaseState.DISCONNECTED;
            kpxcUI.createNotification = sinon.stub();

            const field = document.getElementById('test-username');
            kpxcFields.isVisible = () => true;
            kpxcFields.isCustomLoginFieldsUsed = () => false;

            const icon = document.createElement('div');
            await iconClicked(field, icon);

            return {
                state: kpxc.databaseState,
                queriedStatus: browser.runtime.sendMessage.calledWith(
                    sinon.match({ action: 'get_status' })
                ),
            };
        });

        expect(result.state).toBe(0); // DISCONNECTED — unchanged
        expect(result.queriedStatus).toBe(false);
    });
});
