'use strict';

const TAB_OBJECT = {
    allowIframes: false,
    basicAuthLogins: {
        loginList: [],
        resolve: undefined, // Function from Promise
        url: ''
    },
    credentials: [],
    errorMessage: null,
    iframeDetected: false,
    loginList: [],
    loginId: undefined,
    usernameFieldDetected: false
};

/**
 * @Object tabs
 * Handles tab object creation, update and delete.
 * Handles updates from tabs API.
 */
const tabs = {};
tabs.clearCredentialsTimeout = null;
tabs.currentTabId = -1;
tabs.tabList = new Map();
tabs.timeoutList = new Map();

// Clear timeout and delete it from the list
tabs.clearTimeout = function(tabId) {
    if (!tabId) {
        return;
    }

    const tabTimeout = tabs.timeoutList.get(tabId);
    if (tabTimeout) {
        clearTimeout(tabTimeout);
        tabs.timeoutList.delete(tabId);
    }
};

// Creates a new tab object to the list
tabs.createTabEntry = function(tabId) {
    if (!tabId) {
        return;
    }

    tabs.tabList.set(tabId, structuredClone(TAB_OBJECT));
    page.clearSubmittedCredentials();
    page.setFillAttributeContextMenuItemVisible(false);
};

// Deletes a tab object from the list
tabs.deleteTabEntry = function(tabId) {
    if (!tabId) {
        return;
    }

    tabs.tabList.delete(tabId);
};

// Returns a tab object from tabId
tabs.getTabFromId = function(tabId) {
    if (!tabId) {
        return undefined;
    }

    return tabs.tabList.get(tabId);
};

// Initializes listeners from browser.tabs API
tabs.initListeners = async function() {
    browser.tabs.onActivated.addListener(tabs.onActivated);
    browser.tabs.onCreated.addListener(tabs.onCreated);
    browser.tabs.onRemoved.addListener(tabs.onRemoved);
    browser.tabs.onUpdated.addListener(tabs.onUpdated);
};

// Initializes tabs that are already opened. Ignores discarded background tabs.
tabs.initOpenedTabs = async function() {
    try {
        const openedTabs = await browser.tabs.query({ discarded: false });
        for (const i of openedTabs) {
            tabs.createTabEntry(i.id);
        }

        // Set initial tab ID
        const currentTab = await getCurrentTab();
        if (!currentTab) {
            return;
        }

        tabs.currentTabId = currentTab?.id;
        browserAction.showDefault(currentTab);
    } catch (err) {
        logError('tabs.initOpenedTabs error: ' + err);
        return Promise.reject();
    }
};

/**
 * Remove stored credentials on switching tabs.
 * Invoke functions to retrieve credentials for focused tab
 * @param {object} activeInfo
 */
tabs.onActivated = async function(activeInfo) {
    try {
        const info = await browser.tabs.get(activeInfo.tabId);
        if (info && info.id) {
            if (info.status === 'complete') {
                if (!tabs.getTabFromId(info.id)) {
                    tabs.createTabEntry(info.id);
                }
                tabs.switchTab(info);
            }
            tabs.currentTabId = info.id;
        }
    } catch (err) {
        logError(err.message);
    }
};

/**
 * Generate information structure for created tab and invoke all needed
 * functions if tab is created in foreground
 * @param {object} tab
 */
tabs.onCreated = function(tab) {
    if (tab?.id > 0 && tab?.selected) {
        tabs.currentTabId = tab.id;

        if (!tabs.getTabFromId(tab.id)) {
            tabs.createTabEntry(tab.id);
        }

        tabs.switchTab(tab);
    }
};

/**
 * Remove information structure of closed tab for freeing memory
 * @param {integer} tabId
 * @param {object} removeInfo
 */
tabs.onRemoved = async function(tabId, _removeInfo) {
    if (tabs.currentTabId === tabId) {
        const currentTab = await getCurrentTab();
        tabs.currentTabId = currentTab ? currentTab.id : -1;
    }
    tabs.deleteTabEntry(tabId);
    tabs.clearTimeout(tabId);
};

/**
 * Update browserAction on every update of the page
 * @param {integer} tabId
 * @param {object} changeInfo
 * @param {object} tab
 */
tabs.onUpdated = function(tabId, changeInfo, tab) {
    // Could not be tracked yet if discarded at browser startup
    if (tabId && !tabs.getTabFromId(tabId)) {
        tabs.createTabEntry(tabId);
    }
    // If the tab URL has changed (e.g. logged in) clear credentials
    if (changeInfo.url) {
        page.clearLogins(tabId);
    }

    if (changeInfo.status === 'complete' && tabId) {
        browserAction.showDefault(tab);
    }
};

// Activates current tab, and triggers credential clearing to background tabs
tabs.switchTab = function(tab) {
    // Clears Fill Attribute selection from context menu
    page.setFillAttributeContextMenuItemVisible(false);

    // Stop clear timeout for this tab if set
    tabs.clearTimeout(tab.id);

    // Clear logins after timeout for the previous tab.
    // Id is stored in tabs.currentTabId which is still pointing to the previous tab (updated later).
    if (tabs?.currentTabId > 0 && tabs?.currentTabId !== tab?.id) {
        const backgroundTabId = tabs.currentTabId;
        tabs.timeoutList.set(
            backgroundTabId,
            setTimeout(() => {
                page.clearCredentials(backgroundTabId, true);
                tabs.timeoutList.delete(backgroundTabId);
            }, page.settings.clearCredentialsTimeout * 1000),
        );
    }

    browserAction.showDefault(tab);
    if (tab?.id) {
        browser.tabs.sendMessage(tab.id, { action: 'activated_tab' }).catch((e) => {
            logError('Cannot send activated_tab message: ' + e.message);
        });
    }
};

// Updates value(s) to tab object
tabs.updateTabValues = function(tabId, valuesToUpdate = {}) {
    const currentTab = tabs.getTabFromId(tabId);
    if (!currentTab) {
        return;
    }

    for (const [ key, value ] of Object.entries(valuesToUpdate)) {
        currentTab[key] = value;
    }

    tabs.tabList.set(tabId, currentTab);
};
