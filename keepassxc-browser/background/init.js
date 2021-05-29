'use strict';

(async () => {
    try {
        await keepass.migrateKeyRing();
        await page.initSettings();
        await page.initSitePreferences();
        await page.initOpenedTabs();
        await httpAuth.init();
        await keepass.reconnect(null, 5000); // 5 second timeout for the first connect
        await keepass.enableAutomaticReconnect();
        await keepass.updateDatabase();
    } catch (e) {
        console.log('init.js failed');
    }
})();

/**
 * Generate information structure for created tab and invoke all needed
 * functions if tab is created in foreground
 * @param {object} tab
 */
browser.tabs.onCreated.addListener((tab) => {
    if (tab.id > 0) {
        if (tab.selected) {
            page.currentTabId = tab.id;
            if (!page.tabs[tab.id]) {
                page.createTabEntry(tab.id);
            }
            page.switchTab(tab);
        }
    }
});

/**
 * Remove information structure of closed tab for freeing memory
 * @param {integer} tabId
 * @param {object} removeInfo
 */
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    delete page.tabs[tabId];
    if (page.currentTabId === tabId) {
        page.currentTabId = -1;
    }
});

/**
 * Remove stored credentials on switching tabs.
 * Invoke functions to retrieve credentials for focused tab
 * @param {object} activeInfo
 */
browser.tabs.onActivated.addListener(async function(activeInfo) {
    try {
        const info = await browser.tabs.get(activeInfo.tabId);
        if (info && info.id) {
            page.currentTabId = info.id;
            if (info.status === 'complete') {
                if (!page.tabs[info.id]) {
                    page.createTabEntry(info.id);
                }
                page.switchTab(info);
            }
        }
    } catch (err) {
        console.log('Error: ' + err.message);
    }
});

/**
 * Update browserAction on every update of the page
 * @param {integer} tabId
 * @param {object} changeInfo
 * @param {object} tab
 */
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // If the tab URL has changed (e.g. logged in) clear credentials
    if (changeInfo.url) {
        page.clearLogins(tabId);
    }

    if (changeInfo.status === 'complete') {
        browserAction.showDefault(tab);
        if (!page.tabs[tab.id]) {
            page.createTabEntry(tab.id);
        }
    }
});

/**
 * Detects page redirects and increases the count. Count is reset after a normal navigation event.
 * Form submit is counted as one.
 * @param {object} details
 */
browser.webNavigation.onCommitted.addListener((details) => {
    if ((details.transitionQualifiers.length > 0 && details.transitionQualifiers[0] === 'client_redirect')
        || details.transitionType === 'form_submit') {
        page.redirectCount += 1;
        return;
    }

    // Clear credentials on reload so a new retrieval can be made
    if (details.transitionType === 'reload') {
        page.clearLogins(details.tabId);
    }

    page.redirectCount = 0;
});

browser.runtime.onMessage.addListener(kpxcEvent.onMessage);

const contextMenuItems = [
    { title: tr('contextMenuFillUsernameAndPassword'), action: 'fill_username_password' },
    { title: tr('contextMenuFillPassword'), action: 'fill_password' },
    { title: tr('contextMenuFillTOTP'), action: 'fill_totp' },
    { title: tr('contextMenuFillAttribute'), id: 'fill_attribute', visible: false },
    { title: tr('contextMenuShowPasswordGenerator'), action: 'show_password_generator' },
    { title: tr('contextMenuSaveCredentials'), action: 'save_credentials' }
];

const menuContexts = [ 'editable' ];

if (isFirefox()) {
    menuContexts.push('password');
}

// Create context menu items
for (const item of contextMenuItems) {
    browser.contextMenus.create({
        title: item.title,
        contexts: menuContexts,
        visible: item.visible,
        id: item.id,
        onclick: (info, tab) => {
            browser.tabs.sendMessage(tab.id, {
                action: item.action
            }).catch((err) => {
                console.log(err);
            });
        }
    });
}

// Listen for keyboard shortcuts specified by user
browser.commands.onCommand.addListener(async (command) => {
    if (contextMenuItems.some(e => e.action === command)
        || command === 'redetect_fields'
        || command === 'choose_credential_fields'
        || command === 'retrive_credentials_forced') {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length) {
            browser.tabs.sendMessage(tabs[0].id, { action: command });
        }
    }
});
