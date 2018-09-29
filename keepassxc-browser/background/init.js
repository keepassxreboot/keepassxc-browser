'use strict';

keepass.migrateKeyRing().then(() => {
    page.initSettings().then(() => {
        page.initOpenedTabs().then(() => {
            httpAuth.init();
            keepass.connectToNative();
            keepass.generateNewKeyPair();
            keepass.changePublicKeys(null).then((pkRes) => {
                keepass.getDatabaseHash((gdRes) => {}, null);
            });
        });
    });
});

// Milliseconds for intervall (e.g. to update browserAction)
const _interval = 250;

/**
 * Generate information structure for created tab and invoke all needed
 * functions if tab is created in foreground
 * @param {object} tab
 */
browser.tabs.onCreated.addListener((tab) => {
    if (tab.id > 0) {
        //console.log('browser.tabs.onCreated(' + tab.id+ ')');
        if (tab.selected) {
            page.currentTabId = tab.id;
            kpxcEvent.invoke(page.switchTab, null, tab.id, []);
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
browser.tabs.onActivated.addListener((activeInfo) => {
    // remove possible credentials from old tab information
    page.clearCredentials(page.currentTabId, true);
    browserAction.removeRememberPopup(null, {'id': page.currentTabId}, true);

    browser.tabs.get(activeInfo.tabId).then((info) => {
        if (info && info.id) {
            page.currentTabId = info.id;
            if (info.status === 'complete') {
                //console.log('kpxcEvent.invoke(page.switchTab, null, '+info.id + ', []);');
                kpxcEvent.invoke(page.switchTab, null, info.id, []);
            }
        }
    });
});

/**
 * Update browserAction on every update of the page
 * @param {integer} tabId
 * @param {object} changeInfo
 */
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // If the tab URL has changed (e.g. logged in) clear credentials
    if (changeInfo.url) {
        page.clearLogins(tabId);
    }

    if (changeInfo.status === 'complete') {
        browserAction.showDefault(null, tab);
        kpxcEvent.invoke(browserAction.removeRememberPopup, null, tabId, []);
    }
});

browser.runtime.onMessage.addListener(kpxcEvent.onMessage);

const contextMenuItems = [
    {title: tr('contextMenuFillUsernameAndPassword'), action: 'fill_user_pass'},
    {title: tr('contextMenuFillPassword'), action: 'fill_pass_only'},
    {title: tr('contextMenuFillTOTP'), action: 'fill_totp'},
    {title: tr('contextMenuShowPasswordGeneratorIcons'), action: 'activate_password_generator'},
    {title: tr('contextMenuSaveCredentials'), action: 'remember_credentials'}
];

let menuContexts = ['editable'];

if (isFirefox()) {
    menuContexts.push('password');
}

// Create context menu items
for (const item of contextMenuItems) {
    browser.contextMenus.create({
        title: item.title,
        contexts: menuContexts,
        onclick: (info, tab) => {
            browser.tabs.sendMessage(tab.id, {
                action: item.action
            }).catch((e) => {console.log(e);});
        }
    });
}

// Listen for keyboard shortcuts specified by user
browser.commands.onCommand.addListener((command) => {
    if (command === 'fill-username-password') {
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            if (tabs.length) {
                browser.tabs.sendMessage(tabs[0].id, { action: 'fill_user_pass' });
            }
        });
    }

    if (command === 'fill-password') {
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            if (tabs.length) {
                browser.tabs.sendMessage(tabs[0].id, { action: 'fill_pass_only' });
            }
        });
    }

    if (command === 'fill-totp') {
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            if (tabs.length) {
                browser.tabs.sendMessage(tabs[0].id, { action: 'fill_totp' });
            }
        });
    }
});

// Interval which updates the browserAction (e.g. blinking icon)
window.setInterval(function() {
    browserAction.update(_interval);
}, _interval);
