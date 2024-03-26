'use strict';

const browserActionWrapper = browser.action || browser.browserAction;
const browserAction = {};

browserAction.show = async function(tab, popupData) {
    popupData ??= page.popupData;
    page.popupData = popupData;

    browserActionWrapper.setIcon({
        path: await browserAction.generateIconName(popupData.iconType)
    });

    if (popupData.popup) {
        browserActionWrapper.setPopup({
            tabId: tab.id,
            popup: `popups/${popupData.popup}.html`
        });

        let badgeText = '';
        if (popupData.popup === 'popup_login') {
            badgeText = String(page.tabs[tab.id]?.loginList?.length);
        } else if (popupData.popup === 'popup_httpauth') {
            badgeText = String(page.tabs[tab.id]?.loginList?.logins?.length);
        }

        browserAction.setBadgeText(tab?.id, badgeText);
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
    } else if (!keepass.isAssociated() && !keepass.isDatabaseClosed) {
        popupData.iconType = 'bang';
    } else if (keepass.isKeePassXCAvailable && keepass.isDatabaseClosed) {
        popupData.iconType = 'locked';
    }

    // Get the current tab if no tab given
    tab ??= await getCurrentTab();
    if (!tab) {
        return;
    }

    if (page.tabs[tab.id]?.loginList.length > 0) {
        popupData.iconType = 'normal';
        popupData.popup = 'popup_login';
        browserAction.setBadgeText(tab?.id, String(page.tabs[tab.id]?.loginList.length));
    }

    await browserAction.show(tab, popupData);
};

browserAction.updateIcon = async function(tab, iconType) {
    if (!tab) {
        const tabs = await browser.tabs.query({ 'active': true, 'currentWindow': true });
        if (tabs.length === 0) {
            return;
        }

        tab = tabs[0];
    }

    browserActionWrapper.setIcon({
        path: browserAction.generateIconName(iconType)
    });
};

browserAction.setBadgeText = function(tabId, badgeText) {
    browserActionWrapper.setBadgeBackgroundColor({ color: '#666666' });
    browserActionWrapper.setBadgeText({ text: badgeText, tabId: tabId });
};

browserAction.generateIconName = async function(iconType) {
    let name = 'icon_';
    name += (await keepass.keePassXCUpdateAvailable()) ? 'new_' : '';
    name += (!iconType || iconType === 'normal') ? 'normal' : iconType;

    let style = 'colored';
    if (page.settings.useMonochromeToolbarIcon) {
        if (page.settings.colorTheme === 'system') {
            style = await retrieveColorScheme();
        } else {
            style = page.settings.colorTheme;
        }
    }
    const filetype = (isFirefox() ? 'svg' : 'png');
    return `/icons/toolbar/${style}/${name}.${filetype}`;
};

browserAction.ignoreSite = async function(url) {
    await browser.windows.getCurrent();
    const tab = await getCurrentTab();

    // Send the message to the current tab's content script
    browser.tabs.sendMessage(tab.id, {
        action: 'ignore_site',
        args: [ url ]
    });
};
