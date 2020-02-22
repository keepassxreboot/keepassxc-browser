'use strict';

const browserAction = {};

browserAction.show = function(tab) {
    let data = {};
    if (!page.tabs[tab.id] || page.tabs[tab.id].stack.length === 0) {
        browserAction.showDefault(tab);
        return;
    } else {
        data = page.tabs[tab.id].stack[page.tabs[tab.id].stack.length - 1];
    }

    browser.browserAction.setIcon({
        tabId: tab.id,
        path: '/icons/toolbar/' + browserAction.generateIconName(data.iconType, data.icon)
    });

    if (data.popup) {
        browser.browserAction.setPopup({
            tabId: tab.id,
            popup: 'popups/' + data.popup
        });
    }
};

browserAction.showDefault = async function(tab) {
    const stackData = {
        level: 1,
        iconType: 'normal',
        popup: 'popup.html'
    };

    const response = await keepass.isConfigured().catch((err) => {
        console.log('Error: Cannot show default popup: ' + err);
    });

    if (!response || keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
        stackData.iconType = 'cross';
    }

    if (page.tabs[tab.id] && page.tabs[tab.id].loginList.length > 0) {
        stackData.iconType = 'questionmark';
        stackData.popup = 'popup_login.html';
    }

    browserAction.stackUnshift(stackData, tab.id);
    browserAction.show(tab);
};

browserAction.removeLevelFromStack = function(tab, level, type, dontShow) {
    if (!page.tabs[tab.id]) {
        return;
    }

    if (!type) {
        type = '<=';
    }

    const newStack = [];
    for (const i of page.tabs[tab.id].stack) {
        if ((type === '<' && i.level >= level)
            || (type === '<=' && i.level > level)
            || (type === '=' && i.level !== level)
            || (type === '==' && i.level !== level)
            || (type === '!=' && i.level === level)
            || (type === '>' && i.level <= level)
            || (type === '>=' && i.level < level)) {
            newStack.push(i);
        }
    }

    page.tabs[tab.id].stack = newStack;

    if (!dontShow) {
        browserAction.show(tab);
    }
};

browserAction.stackPop = function(tabId) {
    const id = tabId || page.currentTabId;
    page.tabs[id].stack.pop();
};

browserAction.stackPush = function(data, tabId) {
    const id = tabId || page.currentTabId;
    browserAction.removeLevelFromStack({ 'id': id }, data.level, '<=', true);
    page.tabs[id].stack.push(data);
};

browserAction.stackUnshift = function(data, tabId) {
    const id = tabId || page.currentTabId;
    browserAction.removeLevelFromStack({ 'id': id }, data.level, '<=', true);
    page.tabs[id].stack.unshift(data);
};

browserAction.generateIconName = function(iconType, icon) {
    if (icon) {
        return icon;
    }

    let name = 'icon_';
    name += (keepass.keePassXCUpdateAvailable()) ? 'new_' : '';
    name += (!iconType || iconType === 'normal') ? 'normal' : iconType;
    name += '.png';

    return name;
};

browserAction.ignoreSite = async function(url) {
    await browser.windows.getCurrent();

    // Get current active window
    const tabs = await browser.tabs.query({ 'active': true, 'currentWindow': true });
    const tab = tabs[0];

    // Send the message to the current tab's content script
    await browser.runtime.getBackgroundPage();
    browser.tabs.sendMessage(tab.id, {
        action: 'ignore_site',
        args: [ url ]
    });
};
