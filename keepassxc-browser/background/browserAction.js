'use strict';

const browserAction = {};

browserAction.show = function(tab, popupData) {
    if (!popupData) {
        popupData = page.popupData;
    }

    page.popupData = popupData;

    browser.browserAction.setIcon({
        path: browserAction.generateIconName(popupData.iconType)
    });

    if (popupData.popup) {
        browser.browserAction.setPopup({
            tabId: tab.id,
            popup: `popups/${popupData.popup}.html`
        });
    }
};

browserAction.showDefault = async function(tab) {
    const popupData = {
        iconType: 'normal',
        popup: 'popup'
    };

    const response = await keepass.isConfigured().catch((err) => {
        logError('Cannot show default popup: ' + err);
    });

    if (!response && !keepass.isKeePassXCAvailable) {
        popupData.iconType = 'cross';
    } else if (keepass.isKeePassXCAvailable && keepass.isDatabaseClosed) {
        popupData.iconType = 'locked';
    }

    if (page.tabs[tab.id] && page.tabs[tab.id].loginList.length > 0) {
        popupData.iconType = 'questionmark';
        popupData.popup = 'popup_login';
    }

    browserAction.show(tab, popupData);
};

browserAction.updateIcon = async function(tab, iconType) {
    if (!tab) {
        const tabs = await browser.tabs.query({ 'active': true, 'currentWindow': true });
        if (tabs.length === 0) {
            return;
        }

        tab = tabs[0];
    }

    browser.browserAction.setIcon({
        path: browserAction.generateIconName(iconType)
    });
};

browserAction.generateIconName = function(iconType) {
    let name = 'icon_';
    name += (keepass.keePassXCUpdateAvailable()) ? 'new_' : '';
    name += (!iconType || iconType === 'normal') ? 'normal' : iconType;

    return `/icons/toolbar/${name}.png`;
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
