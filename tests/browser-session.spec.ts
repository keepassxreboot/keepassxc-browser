import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const loadScript = (file: string) => readFileSync(`keepassxc-browser/${file}`, 'utf8');
const login = { name: 'Sample login', login: 'sample-user', password: 'sample-password' };
const pageUrl = 'https://example.test/login';

test('browser session replies verify the nonce without changing vault association', async () => {
    const keepass = { clientID: 'test-client', associated: { value: false, hash: null } };
    const context = createContext({
        keepass,
        tr: (key: string) => key,
        nacl: { util: { encodeUTF8: (data: string) => data } }
    });
    runInContext(loadScript('background/client.js'), context);
    context.reply = { entry: login, nonce: 'response-nonce', success: 'true' };
    runInContext(`
        keepassClient.getNonce = () => 'request-nonce';
        keepassClient.incrementedNonce = () => 'response-nonce';
        keepassClient.encrypt = () => 'encrypted-request';
        keepassClient.sendNativeMessage = async () => ({ message: 'encrypted-response', nonce: reply.nonce });
        keepassClient.decrypt = () => JSON.stringify(reply);
    `, context);
    const fetchLogin = () => runInContext(
        "keepassClient.sendBrowserSessionMessage('get-browser-session-login', {}, {})", context);

    expect((await fetchLogin())?.entry).toEqual(login);
    expect(keepass.associated).toEqual({ value: false, hash: null });
    context.reply.nonce = 'different-nonce';
    expect(await fetchLogin()).toBeUndefined();
});

test('a locked browser session only responds to its active top-level document', async () => {
    const keepass = { browserSessionActive: true };
    let requests = 0;
    let currentUrl = pageUrl;
    const context = createContext({
        browser: { tabs: { get: async () => ({ active: true, url: currentUrl }) } },
        keepass,
        keepassClient: {
            sendBrowserSessionMessage: async () => {
                requests++;
                return { entry: login };
            }
        },
        kpActions: { GET_BROWSER_SESSION_LOGIN: 'get-browser-session-login' },
        page: {},
        credentials: {},
        browserAction: {},
        request: { action: 'get_browser_session_login', args: 'https://example.test/submit' },
        sender: { frameId: 0, tab: { active: true, id: 1 }, url: pageUrl }
    });
    runInContext(loadScript('background/event.js'), context);
    const fill = () => runInContext('kpxcEvent.onMessage(request, sender)', context);

    expect(await fill()).toEqual(login);
    context.sender.frameId = 1;
    expect(await fill()).toBeUndefined();
    context.sender.frameId = 0;
    keepass.browserSessionActive = false;
    expect(await fill()).toBeUndefined();
    expect(requests).toBe(1);

    keepass.browserSessionActive = true;
    currentUrl = 'https://other.test/login';
    expect(await fill()).toBeUndefined();
});

test('a session fill discards credentials if the form changes while waiting', async () => {
    const form = { action: 'https://example.test/submit' };
    const password = { type: 'password', isConnected: true, value: '', form };
    const username = { isConnected: true, value: '' };
    let changeForm = false;
    const context = createContext({
        document: { location: { href: pageUrl } },
        kpxc: { credentials: [] },
        kpxcFields: { getCombinationFromAllInputs: () => ({ password, username }) },
        sendMessage: async () => {
            if (changeForm) {
                form.action = 'https://other.test/submit';
            }
            return login;
        }
    });
    runInContext(loadScript('content/fill.js'), context);
    runInContext('kpxcFill.setValueWithChange = async (field, value) => { field.value = value; };', context);
    const fill = () => runInContext('kpxcFill.fillBrowserSessionLogin()', context);

    changeForm = true;
    expect(await fill()).toBe(false);
    expect(password.value).toBe('');
    changeForm = false;
    form.action = 'https://example.test/submit';
    expect(await fill()).toBe(true);
    expect(password.value).toBe(login.password);
    expect(username.value).toBe(login.login);
    expect(context.kpxc.credentials).toEqual([]);
});
