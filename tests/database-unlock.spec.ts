'use strict';

import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const DEST = 'keepassxc-browser/tests';

test.describe('detectDatabaseChange updates state regardless of visibility', () => {
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

    test('sets databaseState to UNLOCKED when database unlocks in visible tab', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'load_settings' }))
                .resolves({ autoRetrieveCredentials: true });
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'page_get_manual_fill' }))
                .resolves(ManualFill.NONE);

            kpxc.databaseState = DatabaseState.DISCONNECTED;
            kpxc.combinations = [];
            kpxcIcons.switchIcons = sinon.stub();
            kpxc.clearAllFromPage = sinon.stub();
            kpxc.initCredentialFields = sinon.stub().resolves();

            const visibilityAtCall = document.visibilityState;

            await kpxc.detectDatabaseChange({
                hash: { old: '', new: 'abc123' },
                connected: true,
            });

            return {
                visibilityAtCall,
                state: kpxc.databaseState,
                initedFields: kpxc.initCredentialFields.calledOnce,
            };
        });

        expect(result.visibilityAtCall,
            'tab should be visible during this test'
        ).toBe('visible');
        expect(result.state,
            'databaseState should be UNLOCKED when new hash is non-empty'
        ).toBe(2);
        expect(result.initedFields,
            'should init credential fields when tab is visible'
        ).toBe(true);
    });

    test('sets databaseState to UNLOCKED even when tab is hidden', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'load_settings' }))
                .resolves({ autoRetrieveCredentials: true });

            kpxc.databaseState = DatabaseState.DISCONNECTED;
            kpxc.combinations = [];
            kpxcIcons.switchIcons = sinon.stub();
            kpxc.clearAllFromPage = sinon.stub();
            kpxc.initCredentialFields = sinon.stub().resolves();

            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                writable: true,
                configurable: true,
            });

            const stateBefore = kpxc.databaseState;
            const visibilityAtCall = document.visibilityState;

            await kpxc.detectDatabaseChange({
                hash: { old: '', new: 'abc123' },
                connected: true,
            });

            const stateAfter = kpxc.databaseState;

            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                writable: true,
                configurable: true,
            });

            return { stateBefore, stateAfter, visibilityAtCall };
        });

        expect(result.visibilityAtCall,
            'tab should be hidden during this test'
        ).toBe('hidden');
        expect(result.stateBefore,
            'state should be DISCONNECTED before detectDatabaseChange'
        ).toBe(0);
        expect(result.stateAfter,
            'databaseState should be UNLOCKED even though tab is hidden — the old code gated the entire state update behind visibilityState, leaving the tab stuck at LOCKED forever'
        ).toBe(2);
    });

    test('does not init fields or auto-fill when tab is hidden', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'load_settings' }))
                .resolves({ autoRetrieveCredentials: true });
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'page_get_manual_fill' }))
                .resolves(ManualFill.BOTH);

            kpxc.databaseState = DatabaseState.DISCONNECTED;
            kpxc.combinations = [{ username: null, password: null }];
            kpxcIcons.switchIcons = sinon.stub();
            kpxc.clearAllFromPage = sinon.stub();
            kpxc.initCredentialFields = sinon.stub().resolves();
            kpxcFill.fillInFromActiveElement = sinon.stub().resolves();

            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                writable: true,
                configurable: true,
            });

            await kpxc.detectDatabaseChange({
                hash: { old: '', new: 'abc123' },
                connected: true,
            });

            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                writable: true,
                configurable: true,
            });

            return {
                state: kpxc.databaseState,
                initedFields: kpxc.initCredentialFields.called,
                filled: kpxcFill.fillInFromActiveElement.called,
            };
        });

        expect(result.state,
            'databaseState should still be UNLOCKED (state update is not gated by visibility)'
        ).toBe(2);
        expect(result.initedFields,
            'should NOT init credential fields when tab is hidden — DOM operations are pointless in hidden tabs'
        ).toBe(false);
        expect(result.filled,
            'should NOT auto-fill when tab is hidden'
        ).toBe(false);
    });

    test('sets databaseState to DISCONNECTED when not connected', async () => {
        const result = await page.evaluate(async () => {
            kpxc.databaseState = DatabaseState.UNLOCKED;
            kpxcIcons.switchIcons = sinon.stub();
            kpxc.clearAllFromPage = sinon.stub();

            await kpxc.detectDatabaseChange({
                hash: { old: 'abc', new: '' },
                connected: false,
            });

            return kpxc.databaseState;
        });

        expect(result,
            'state should be DISCONNECTED when KeePassXC is not connected'
        ).toBe(0);
    });

    test('sets databaseState to LOCKED when database is locked but still connected', async () => {
        const result = await page.evaluate(async () => {
            kpxc.databaseState = DatabaseState.UNLOCKED;
            kpxcIcons.switchIcons = sinon.stub();
            kpxc.clearAllFromPage = sinon.stub();

            await kpxc.detectDatabaseChange({
                hash: { old: 'abc', new: '' },
                connected: true,
            });

            return kpxc.databaseState;
        });

        expect(result,
            'state should be LOCKED when connected but hash is empty (database closed)'
        ).toBe(1);
    });

    test('performs manual fill when manualFill is set and tab is visible', async () => {
        const result = await page.evaluate(async () => {
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'load_settings' }))
                .resolves({ autoRetrieveCredentials: true });
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'page_get_manual_fill' }))
                .resolves(ManualFill.BOTH);
            browser.runtime.sendMessage
                .withArgs(sinon.match({ action: 'page_set_manual_fill' }))
                .resolves();

            kpxc.databaseState = DatabaseState.DISCONNECTED;
            kpxc.combinations = [{ username: null, password: null }];
            kpxcIcons.switchIcons = sinon.stub();
            kpxc.clearAllFromPage = sinon.stub();
            kpxc.initCredentialFields = sinon.stub().resolves();
            kpxcFill.fillInFromActiveElement = sinon.stub().resolves();

            await kpxc.detectDatabaseChange({
                hash: { old: '', new: 'abc123' },
                connected: true,
            });

            return {
                state: kpxc.databaseState,
                filled: kpxcFill.fillInFromActiveElement.calledOnce,
                clearedManualFill: browser.runtime.sendMessage.calledWith(
                    sinon.match({ action: 'page_set_manual_fill' })
                ),
            };
        });

        expect(result.state,
            'databaseState should be UNLOCKED'
        ).toBe(2);
        expect(result.filled,
            'should auto-fill when manualFill was requested and tab is visible'
        ).toBe(true);
        expect(result.clearedManualFill,
            'should clear manualFill after filling to prevent duplicate fills'
        ).toBe(true);
    });
});
