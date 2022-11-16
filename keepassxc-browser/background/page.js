'use strict';

const defaultSettings = {
    afterFillSorting: SORT_BY_MATCHING_CREDENTIALS_SETTING,
    afterFillSortingTotp: SORT_BY_RELEVANT_ENTRY,
    autoCompleteUsernames: true,
    showGroupNameInAutocomplete: true,
    autoFillAndSend: false,
    autoFillSingleEntry: false,
    autoReconnect: false,
    autoRetrieveCredentials: true,
    autoSubmit: false,
    checkUpdateKeePassXC: CHECK_UPDATE_NEVER,
    clearCredentialsTimeout: 10,
    colorTheme: 'system',
    credentialSorting: SORT_BY_GROUP_AND_TITLE,
    debugLogging: false,
    defaultGroup: '',
    defaultGroupAlwaysAsk: false,
    downloadFaviconAfterSave: false,
    redirectAllowance: 1,
    saveDomainOnly: true,
    showGettingStartedGuideAlert: true,
    showTroubleshootingGuideAlert: true,
    showLoginFormIcon: true,
    showLoginNotifications: true,
    showNotifications: true,
    showOTPIcon: true,
    useObserver: true,
    usePredefinedSites: true,
    usePasswordGeneratorIcons: false
};

const AUTO_SUBMIT_TIMEOUT = 5000;

var page = {};
page.autoSubmitPerformed = false;
page.attributeMenuItemIds = [];
page.blockedTabs = [];
page.clearCredentialsTimeout = null;
page.currentRequest = {};
page.currentTabId = -1;
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
        page.settings.autoReconnect = false;

        if (!('afterFillSorting' in page.settings)) {
            page.settings.afterFillSorting = defaultSettings.afterFillSorting;
        }

        if (!('afterFillSortingTotp' in page.settings)) {
            page.settings.afterFillSortingTotp = defaultSettings.afterFillSortingTotp;
        }

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

        if (!('clearCredentialsTimeout' in page.settings)) {
            page.settings.clearCredentialsTimeout = defaultSettings.clearCredentialsTimeout;
        }

        if (!('credentialSorting' in page.settings)) {
            page.settings.credentialSorting = defaultSettings.credentialSorting;
        }

        if (!('debugLogging' in page.settings)) {
            page.settings.debugLogging = defaultSettings.debugLogging;
        }

        if (!('defaultGroup' in page.settings)) {
            page.settings.defaultGroup = defaultSettings.defaultGroup;
        }

        if (!('defaultGroupAlwaysAsk' in page.settings)) {
            page.settings.defaultGroupAlwaysAsk = defaultSettings.defaultGroupAlwaysAsk;
        }

        if (!('downloadFaviconAfterSave' in page.settings)) {
            page.settings.downloadFaviconAfterSave = defaultSettings.downloadFaviconAfterSave;
        }

        if (!('redirectAllowance' in page.settings)) {
            page.settings.redirectAllowance = defaultSettings.redirectAllowance;
        }

        if (!('saveDomainOnly' in page.settings)) {
            page.settings.saveDomainOnly = defaultSettings.saveDomainOnly;
        }

        if (!('showGettingStartedGuideAlert' in page.settings)) {
            page.settings.showGettingStartedGuideAlert = defaultSettings.showGettingStartedGuideAlert;
        }

        if (!('showTroubleshootingGuideAlert' in page.settings)) {
            page.settings.showTroubleshootingGuideAlert = defaultSettings.showTroubleshootingGuideAlert;
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

        if (!('usePredefinedSites' in page.settings)) {
            page.settings.usePredefinedSites = defaultSettings.usePredefinedSites;
        }

        await browser.storage.local.set({ 'settings': page.settings });
        return page.settings;
    } catch (err) {
        logError('page.initSettings error: ' + err);
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
        logError('page.initOpenedTabs error: ' + err);
        return Promise.reject();
    }
};

page.initSitePreferences = async function() {
    if (!page.settings) {
        return;
    }

    if (!page.settings['sitePreferences']) {
        page.settings['sitePreferences'] = [];
    }

    await browser.storage.local.set({ 'settings': page.settings });
};

page.switchTab = async function(tab) {
    // Clears Fill Attribute selection from context menu
    browser.contextMenus.update('fill_attribute', { visible: false });

    // Clears all logins from other tabs after a timeout
    if (page.clearCredentialsTimeout) {
        clearTimeout(page.clearCredentialsTimeout);
    }

    page.clearCredentialsTimeout = setTimeout(() => {
        for (const pageTabId of Object.keys(page.tabs)) {
            if (tab.id !== Number(pageTabId)) {
                page.clearCredentials(Number(pageTabId), true);
            }
        }
    }, page.settings.clearCredentialsTimeout * 1000);

    browserAction.showDefault(tab);
    browser.tabs.sendMessage(tab.id, { action: 'activated_tab' }).catch((e) => {
        logError('Cannot send activated_tab message: ' + e.message);
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

    browser.contextMenus.update('fill_attribute', { visible: false });
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
        loginList: [],
        loginId: undefined
    };

    page.clearSubmittedCredentials();
    browser.contextMenus.update('fill_attribute', { visible: false });
};

// Retrieves the credentials. Returns cached values when found.
// Page reload or tab switch clears the cache.
// If the retrieval is forced (from Credential Banner), get new credentials normally.
page.retrieveCredentials = async function(tab, args = []) {
    const [ url, submitUrl, force ] = args;
    if (page.tabs[tab.id] && page.tabs[tab.id].credentials.length > 0 && !force) {
        return page.tabs[tab.id].credentials;
    }

    // Ignore duplicate requests
    if (page.currentRequest.url === url && page.currentRequest.submitUrl === submitUrl && !force) {
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
    const currentTab = page.tabs[tab.id];

    // If there's only one credential available and loginId is not set
    if (currentTab && !currentTab.loginId && currentTab.credentials.length === 1) {
        return currentTab.credentials[0].uuid;
    }

    return currentTab ? currentTab.loginId : undefined;
};

page.setLoginId = async function(tab, loginId) {
    page.tabs[tab.id].loginId = loginId;
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

page.getAutoSubmitPerformed = async function(tab) {
    return page.autoSubmitPerformed;
};

// Set autoSubmitPerformed to false after 5 seconds, preventing possible endless loops
page.setAutoSubmitPerformed = async function(tab) {
    if (!page.autoSubmitPerformed) {
        page.autoSubmitPerformed = true;

        setTimeout(() => {
            page.autoSubmitPerformed = false;
        }, AUTO_SUBMIT_TIMEOUT);
    }
};

// Update context menu for attribute filling
page.updateContextMenu = async function(tab, credentials) {
    // Remove any old attribute items
    while (page.attributeMenuItemIds.length) {
        browser.contextMenus.remove(page.attributeMenuItemIds.pop());
    }

    // Set parent item visibility
    browser.contextMenus.update('fill_attribute', { visible: true });

    // Add any new attribute items
    for (const cred of credentials) {
        if (!cred.stringFields) {
            continue;
        }

        for (const attribute of cred.stringFields) {
            // Show username inside [] if there are KPH attributes inside multiple credentials
            const attributeName = Object.keys(attribute)[0].slice(5);
            const finalName = credentials.length > 1
                       ? `[${cred.login}] ${attributeName}`
                       : attributeName;

            page.attributeMenuItemIds.push(createContextMenuItem({
                action: 'fill_attribute',
                args: attribute,
                parentId: 'fill_attribute',
                title: finalName
            }));
        }
    }
};

const createContextMenuItem = function({ action, args, ...options }) {
    return browser.contextMenus.create({
        contexts: menuContexts,
        onclick: (info, tab) => {
            browser.tabs.sendMessage(tab.id, {
                action: action,
                args: args
            }).catch((err) => {
                logError(err);
            });
        },
        ...options
    });
};

const logDebug = function(message, extra) {
    if (page.settings.debugLogging) {
        debugLogMessage(message, extra);
    }
};
