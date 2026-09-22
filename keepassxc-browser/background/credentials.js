'use strict';

/**
 * @Object credentials
 * Handles credential saving, and storing submitted credentials temporarily to session storage.
 */
const credentials = {};

credentials.clearRedirectCount = async function(tabId) {
    await this.setRedirectCount(tabId, 0);
};

credentials.setRedirectCount = async function(tabId, count) {
    const item = await browser.storage.session.get(String(tabId));
    const creds = item[String(tabId)];
    if (creds) {
        creds.redirectCount = count;
        await browser.storage.session.set({ [String(tabId)]: creds });
    }
};

credentials.getRedirectCount = async function(tabId) {
    if (!tabId) {
        return 0;
    }

    const item = await browser.storage.session.get(String(tabId));
    const creds = item[String(tabId)];
    return creds ? creds.redirectCount : 0;
};

credentials.incrementRedirectCount = async function(tabId) {
    const redirectCount = await credentials.getRedirectCount(tabId);
    await credentials.setRedirectCount(tabId, redirectCount + 1);
};

credentials.clearSubmittedCredentials = async function(tabId) {
    await browser.storage.session.remove(String(tabId));
};

credentials.getSubmittedCredentials = async function(tab) {
    if (!tab?.id) {
        return {};
    }

    const tabId = String(tab.id);
    const creds = await browser.storage.session.get(tabId);
    return creds[tabId];
};

credentials.setSubmittedCredentials = async function(tab, args = []) {
    if (!tab?.id || args.length === 0) {
        return;
    }

    const [ submitted, username, password, url, oldCredentials ] = args;
    await browser.storage.session.set({ [String(tab.id)]: {
        oldCredentials: oldCredentials,
        password: password,
        redirectCount: 0,
        submitted: submitted,
        url: url,
        username: username
    } });
};

