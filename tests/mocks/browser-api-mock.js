'use strict';

/**
 * Sinon-based mock factory for the WebExtension browser.* API.
 *
 * Usage:
 *   1. Load sinon.js (UMD) before this script.
 *   2. Call createBrowserMock() to get a mock browser object.
 *   3. Assign it to window.browser and set window.chrome.runtime.id
 *      before loading browser-polyfill.min.js or any extension code.
 *   4. Call resetBrowserMock(browser) between tests to clear call history
 *      and restore default stub behavior.
 *
 * All API methods are sinon stubs that resolve with sensible defaults.
 * Override per-test with e.g. browser.tabs.query.resolves([{id: 1}]).
 */
function createBrowserMock() {
    const s = sinon;

    return {
        runtime: {
            id: 'mock-extension-id',
            lastError: null,
            sendMessage: s.stub().resolves({}),
            getURL: s.stub().callsFake((path) => path),
            getManifest: s.stub().returns({ version: '1.10.0' }),
            getContexts: s.stub().resolves([]),
            connectNative: s.stub().returns({
                onMessage: { addListener: s.stub() },
                onDisconnect: { addListener: s.stub() },
                postMessage: s.stub(),
                disconnect: s.stub(),
            }),
            onMessage: { addListener: s.stub(), removeListener: s.stub(), hasListener: s.stub().returns(false) },
            onInstalled: { addListener: s.stub() },
        },
        tabs: {
            query: s.stub().resolves([]),
            get: s.stub().resolves({ id: 1, status: 'complete' }),
            create: s.stub().resolves({ id: 99 }),
            sendMessage: s.stub().resolves({}),
            onActivated: { addListener: s.stub() },
            onCreated: { addListener: s.stub() },
            onRemoved: { addListener: s.stub() },
            onUpdated: { addListener: s.stub() },
        },
        storage: {
            local: {
                get: s.stub().resolves({}),
                set: s.stub().resolves(),
                remove: s.stub().resolves(),
            },
            managed: {
                get: s.stub().resolves({}),
            },
        },
        action: {
            setIcon: s.stub().resolves(),
            setPopup: s.stub().resolves(),
            setBadgeBackgroundColor: s.stub(),
            setBadgeText: s.stub(),
            setTitle: s.stub(),
        },
        commands: {
            getAll: s.stub().resolves([]),
            onCommand: { addListener: s.stub() },
        },
        contextMenus: {
            create: s.stub(),
            update: s.stub().resolves(),
            remove: s.stub().resolves(),
            removeAll: s.stub().resolves(),
            onClicked: { addListener: s.stub() },
        },
        cookies: {
            set: s.stub().resolves({}),
            remove: s.stub().resolves({}),
        },
        dom: {
            openOrClosedShadowRoot: s.stub().returns(null),
        },
        i18n: {
            getMessage: s.stub().callsFake((key) => key),
        },
        offscreen: {
            createDocument: s.stub().resolves(),
        },
        webNavigation: {
            onCommitted: { addListener: s.stub() },
        },
        webRequest: {
            onAuthRequired: { addListener: s.stub() },
            onCompleted: { addListener: s.stub() },
            onErrorOccurred: { addListener: s.stub() },
        },
        windows: {
            getCurrent: s.stub().resolves({ id: 1, focused: true }),
        },
    };
}

function resetBrowserMock(mock) {
    sinon.resetHistory();
    sinon.resetBehavior();

    mock.runtime.sendMessage.resolves({});
    mock.runtime.getURL.callsFake((path) => path);
    mock.runtime.getManifest.returns({ version: '1.10.0' });
    mock.runtime.getContexts.resolves([]);
    mock.runtime.lastError = null;
    mock.tabs.query.resolves([]);
    mock.tabs.get.resolves({ id: 1, status: 'complete' });
    mock.tabs.create.resolves({ id: 99 });
    mock.tabs.sendMessage.resolves({});
    mock.storage.local.get.resolves({});
    mock.storage.local.set.resolves();
    mock.storage.managed.get.resolves({});
    mock.action.setIcon.resolves();
    mock.commands.getAll.resolves([]);
    mock.cookies.set.resolves({});
    mock.cookies.remove.resolves({});
    mock.i18n.getMessage.callsFake((key) => key);
    mock.windows.getCurrent.resolves({ id: 1, focused: true });
}
