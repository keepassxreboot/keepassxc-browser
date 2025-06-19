'use strict';

const contextMenuItems = [
    { title: tr('contextMenuFillUsernameAndPassword'), action: 'fill_username_password' },
    { title: tr('contextMenuFillPassword'), action: 'fill_password' },
    { title: tr('contextMenuFillTOTP'), action: 'fill_totp' },
    { title: tr('contextMenuFillAttribute'), id: 'fill_attribute', visible: false },
    { title: tr('contextMenuShowPasswordGenerator'), action: 'show_password_generator' },
    { title: tr('contextMenuSaveCredentials'), action: 'save_credentials' },
    { title: tr('contextMenuRequestGlobalAutoType'), action: 'request_autotype' }
];

const menuContexts = [ 'editable' ];
    
if (isFirefox()) {
    menuContexts.push('password');
}

const initListeners = async function() {
    /**
     * Generate information structure for created tab and invoke all needed
     * functions if tab is created in foreground
     * @param {object} tab
     */
    browser.tabs.onCreated.addListener((tab) => {
        if (tab?.id > 0 && tab?.selected) {
            page.currentTabId = tab.id;

            if (!page.tabs[tab.id]) {
                page.createTabEntry(tab.id);
            }

            page.switchTab(tab);
        }
    });

    /**
     * Remove information structure of closed tab for freeing memory
     * @param {integer} tabId
     * @param {object} removeInfo
     */
    browser.tabs.onRemoved.addListener(async function(tabId, removeInfo) {
        if (page.currentTabId === tabId) {
            const currentTab = await getCurrentTab();
            page.currentTabId = currentTab ? currentTab.id : -1;
        }
        delete page.tabs[tabId];
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
            logError(err.message);
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

        if (changeInfo.status === 'complete' && tab?.id) {
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
        if (details.transitionQualifiers?.[0] === 'client_redirect' || details.transitionType === 'form_submit') {
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

    // Listen for keyboard shortcuts specified by user
    browser.commands.onCommand.addListener(async (command) => {
        if (contextMenuItems.some(e => e.action === command)
            || command === 'redetect_fields'
            || command === 'choose_credential_fields'
            || command === 'retrive_credentials_forced'
            || command === 'reload_extension') {
            const tab = await getCurrentTab();
            if (tab?.id) {
                browser.tabs.sendMessage(tab.id, { action: command });
            }
        }
    });

    browser.contextMenus.onClicked.addListener(async (item, tab) => {
        if (!tab?.id) {
            return;
        }

        if (item?.menuItemId?.startsWith('fill_attribute')) {
            const menuItem = page.attributeMenuItems.find(i => i?.action === item?.menuItemId);
            if (menuItem) {
                browser.tabs.sendMessage(tab.id, {
                    action: 'fill_attribute',
                    args: menuItem?.args
                }).catch((err) => {
                    logError(err);
                });
            }

            return;
        }

        browser.tabs.sendMessage(tab.id, {
            action: item.menuItemId
        }).catch((err) => {
            logError(err);
        });
    });

    // Show getting started page after first install
    browser.runtime.onInstalled.addListener((details) => {
        if (details?.reason === 'install') {
            browser.tabs.create({
                url: 'options/getting_started.html',
            });
        }
    });
};

const initContextMenuItems = async function() { 
    // Create context menu items
    await browser.contextMenus.removeAll();
    for (const item of contextMenuItems) {
        try {
            await browser.contextMenus.create({
                title: item.title,
                contexts: menuContexts,
                visible: item.visible,
                id: item.id || item.action
            });
        } catch (e) {
            logError(e);
        } 
    }
};

(async () => {
    try {
        await keepass.migrateKeyRing();
        await page.initSettings();
        await page.initSitePreferences();
        await page.initOpenedTabs();
        await initListeners();
        await initContextMenuItems();
        await httpAuth.init();
        await keepass.reconnect(null, 5000); // 5 second timeout for the first connect
        await keepass.enableAutomaticReconnect();
        await keepass.updateDatabase();
    } catch (e) {
        logError('init.js failed');
    }
})();
