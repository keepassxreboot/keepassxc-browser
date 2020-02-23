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
page.currentTabId = -1;
page.loginId = -1;
page.passwordFilled = false;
page.redirectCount = 0;
page.submitted = false;
page.submittedCredentials = {};
page.tabs = [];
page.usernameFieldDetected = false;

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
            return Promise.resolve();
        }
        page.currentTabId = currentTabs[0].id;
        browserAction.show(currentTabs[0]);
        return Promise.resolve();
    } catch (err) {
        console.log('page.initOpenedTabs error: ' + err);
        return Promise.reject();
    }
};

page.switchTab = function(tab) {
    browserAction.showDefault(tab);
    browser.tabs.sendMessage(tab.id, { action: 'activated_tab' }).catch((e) => {});
};

page.clearCredentials = function(tabId, complete) {
    if (!page.tabs[tabId]) {
        return;
    }

    page.usernameFieldDetected = false;
    page.passwordFilled = false;
    page.tabs[tabId].credentials = [];
    delete page.tabs[tabId].credentials;

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

    page.tabs[tabId].loginList = [];
    page.passwordFilled = false;
};

page.setSubmittedCredentials = function(submitted, username, password, url, oldCredentials) {
    page.submittedCredentials.submitted = submitted;
    page.submittedCredentials.username = username;
    page.submittedCredentials.password = password;
    page.submittedCredentials.url = url;
    page.submittedCredentials.oldCredentials = oldCredentials;
};

page.clearSubmittedCredentials = function() {
    page.submitted = false;
    page.submittedCredentials = {};
};

page.createTabEntry = function(tabId) {
    page.tabs[tabId] = {
        'stack': [],
        'errorMessage': null,
        'loginList': []
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
