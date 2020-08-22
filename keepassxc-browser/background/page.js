'use strict';

const defaultSettings = {
    autoCompleteUsernames: true,
    showGroupNameInAutocomplete: true,
    autoFillAndSend: false,
    autoFillSingleEntry: false,
    autoReconnect: false,
    autoRetrieveCredentials: true,
    autoSubmit: false,
    checkUpdateKeePassXC: 3,
    colorTheme: 'system',
    defaultGroup: '',
    defaultGroupAlwaysAsk: false,
    redirectAllowance: 1,
    saveDomainOnly: true,
    showLoginFormIcon: true,
    showLoginNotifications: true,
    showNotifications: true,
    showOTPIcon: true,
    useObserver: true,
    usePasswordGeneratorIcons: false
};

var page = {};
page.blockedTabs = [];
page.currentRequest = {};
page.currentTabId = -1;
page.loginId = -1;
page.manualFill = ManualFill.NONE;
page.passwordFilled = false;
page.redirectCount = 0;
page.submitted = false;
page.submittedCredentials = {};
page.tabs = [];

page.popupData = {
    iconType: 'normal',
    popup: 'popup'
};

page.initSettings = async function() {
    try {
        const item = await browser.storage.local.get({ 'settings': {} });
        page.settings = item.settings;

        if (!('autoCompleteUsernames' in page.settings)) {
            page.settings.autoCompleteUsernames = defaultSettings.autoCompleteUsernames;
        }

        if (!('showGroupNameInAutocomplete' in page.settings)) {
            page.settings.showGroupNameInAutocomplete = defaultSettings.showGroupNameInAutocomplete;
        }

        if (!('autoFillAndSend' in page.settings)) {
            page.settings.autoFillAndSend = defaultSettings.autoFillAndSend;
        }

        if (!('autoFillSingleEntry' in page.settings)) {
            page.settings.autoFillSingleEntry = defaultSettings.autoFillSingleEntry;
        }

        if (!('autoReconnect' in page.settings)) {
            page.settings.autoReconnect = defaultSettings.autoReconnect;
        }

        if (!('autoRetrieveCredentials' in page.settings)) {
            page.settings.autoRetrieveCredentials = defaultSettings.autoRetrieveCredentials;
        }

        if (!('autoSubmit' in page.settings)) {
            page.settings.autoSubmit = defaultSettings.autoSubmit;
        }

        if (!('checkUpdateKeePassXC' in page.settings)) {
            page.settings.checkUpdateKeePassXC = defaultSettings.checkUpdateKeePassXC;
        }

        if (!('colorTheme' in page.settings)) {
            page.settings.colorTheme = defaultSettings.colorTheme;
        }

        if (!('defaultGroup' in page.settings)) {
            page.settings.defaultGroup = defaultSettings.defaultGroup;
        }

        if (!('defaultGroupAlwaysAsk' in page.settings)) {
            page.settings.defaultGroupAlwaysAsk = defaultSettings.defaultGroupAlwaysAsk;
        }

        if (!('redirectAllowance' in page.settings)) {
            page.settings.redirectAllowance = defaultSettings.redirectAllowance;
        }

        if (!('saveDomainOnly' in page.settings)) {
            page.settings.saveDomainOnly = defaultSettings.saveDomainOnly;
        }

        if (!('showLoginFormIcon' in page.settings)) {
            page.settings.showLoginFormIcon = defaultSettings.showLoginFormIcon;
        }

        if (!('showLoginNotifications' in page.settings)) {
            page.settings.showLoginNotifications = defaultSettings.showLoginNotifications;
        }

        if (!('showNotifications' in page.settings)) {
            page.settings.showNotifications = defaultSettings.showNotifications;
        }

        if (!('showOTPIcon' in page.settings)) {
            page.settings.showOTPIcon = defaultSettings.showOTPIcon;
        }

        if (!('usePasswordGeneratorIcons' in page.settings)) {
            page.settings.usePasswordGeneratorIcons = defaultSettings.usePasswordGeneratorIcons;
        }

        if (!('useObserver' in page.settings)) {
            page.settings.useObserver = defaultSettings.useObserver;
        }

        if (!('usePasswordGeneratorIcons' in page.settings)) {
            page.settings.usePasswordGeneratorIcons = defaultSettings.usePasswordGeneratorIcons;
        }

        await browser.storage.local.set({ 'settings': page.settings });
        return page.settings;
    } catch (err) {
        console.log('page.initSettings error: ' + err);
        return Promise.reject();
    }
};

page.initOpenedTabs = async function() {
    try {
        const tabs = await browser.tabs.query({});
        for (const i of tabs) {
            page.createTabEntry(i.id);
        }

        // Set initial tab-ID
        const currentTabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (currentTabs.length === 0) {
            return;
        }

        page.currentTabId = currentTabs[0].id;
        browserAction.showDefault(currentTabs[0]);
    } catch (err) {
        console.log('page.initOpenedTabs error: ' + err);
        return Promise.reject();
    }
};

page.switchTab = function(tab) {
    browserAction.showDefault(tab);
    browser.tabs.sendMessage(tab.id, { action: 'activated_tab' }).catch((e) => {
        console.log('Cannot send activated_tab message: ', e);
    });
};

page.clearCredentials = async function(tabId, complete) {
    if (!page.tabs[tabId]) {
        return;
    }

    page.passwordFilled = false;
    page.tabs[tabId].credentials = [];

    if (complete) {
        page.clearLogins(tabId);

        browser.tabs.sendMessage(tabId, {
            action: 'clear_credentials'
        }).catch((e) => {});
    }
};

page.clearLogins = function(tabId) {
    if (!page.tabs[tabId]) {
        return;
    }

    page.tabs[tabId].credentials = [];
    page.tabs[tabId].loginList = [];
    page.currentRequest = {};
    page.passwordFilled = false;
};

// Clear all logins from all pages and update the content scripts
page.clearAllLogins = function() {
    for (const tabId of Object.keys(page.tabs)) {
        page.clearCredentials(Number(tabId), true);
    }
};

page.setSubmittedCredentials = function(submitted, username, password, url, oldCredentials, tabId) {
    page.submittedCredentials.submitted = submitted;
    page.submittedCredentials.username = username;
    page.submittedCredentials.password = password;
    page.submittedCredentials.url = url;
    page.submittedCredentials.oldCredentials = oldCredentials;
    page.submittedCredentials.tabId = tabId;
};

page.clearSubmittedCredentials = async function() {
    page.submitted = false;
    page.submittedCredentials = {};
};

page.createTabEntry = function(tabId) {
    page.tabs[tabId] = {
        credentials: [],
        errorMessage: null,
        loginList: []
    };

    page.clearSubmittedCredentials();
};

page.removePageInformationFromNotExistingTabs = async function() {
    const rand = Math.floor(Math.random() * 1001);
    if (rand === 28) {
        const tabs = await browser.tabs.query({});
        const tabIds = [];
        const infoIds = Object.keys(page.tabs);

        for (const t of tabs) {
            tabIds[t.id] = true;
        }

        for (const i of infoIds) {
            if (!(i in tabIds)) {
                delete page.tabs[i];
            }
        }
    }
};

// Retrieves the credentials. Returns cached values when found.
// Page reload or tab switch clears the cache.
page.retrieveCredentials = async function(tab, args = []) {
    const [ url, submitUrl ] = args;
    if (page.tabs[tab.id] && page.tabs[tab.id].credentials.length > 0) {
        return page.tabs[tab.id].credentials;
    }

    // Ignore duplicate requests
    if (page.currentRequest.url === url && page.currentRequest.submitUrl === submitUrl) {
        return [];
    } else {
        page.currentRequest.url = url;
        page.currentRequest.submitUrl = submitUrl;
    }

    const credentials = await keepass.retrieveCredentials(tab, args);
    page.tabs[tab.id].credentials = credentials;
    return credentials;
};

page.getLoginId = async function(tab) {
    // If there's only one credential available and loginId is not set
    if (page.loginId < 0
        && page.tabs[tab.id]
        && page.tabs[tab.id].credentials.length === 1) {
        return 0; // Index to the first credential
    }

    return page.loginId;
};

page.setLoginId = async function(tab, loginId) {
    page.loginId = loginId;
};

page.getManualFill = async function(tab) {
    return page.manualFill;
};

page.setManualFill = async function(tab, manualFill) {
    page.manualFill = manualFill;
};

page.getSubmitted = async function(tab) {
    // Do not return any credentials if the tab ID does not match.
    if (tab.id !== page.submittedCredentials.tabId) {
        return {};
    }

    return page.submittedCredentials;
};

page.setSubmitted = async function(tab, args = []) {
    const [ submitted, username, password, url, oldCredentials ] = args;
    page.setSubmittedCredentials(submitted, username, password, url, oldCredentials, tab.id);
};
