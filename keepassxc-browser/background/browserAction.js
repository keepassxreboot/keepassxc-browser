'use strict';

const browserActionWrapper = browser.action || browser.browserAction;
const browserAction = {};

browserAction.updatePopupIcon = async function(tab, popupData) {
    popupData ??= page.popupData;
    page.popupData = popupData;

    browserActionWrapper.setIcon({
        path: await browserAction.generateIconName(popupData.iconType)
    });

    if (popupData.popup && tab?.id) {
        let badgeText = '';
        if (popupData.popup === PopupState.LOGIN) {
            badgeText = page.tabs[tab.id]?.loginList?.length;
        } else if (popupData.popup === PopupState.HTTP_AUTH) {
            badgeText = page.tabs[tab.id]?.loginList?.logins?.length;
        }

        browserAction.setBadgeText(tab?.id, badgeText);
    }
};

browserAction.updatePopup = async function(tab) {
    const popupData = {
        iconType: PopupIcon.NORMAL,
        popup: PopupState.DEFAULT
    };

    const response = await keepass.isConfigured().catch((err) => {
        logError('Cannot show default popup: ' + err);
    });

    if (!response && !keepass.isKeePassXCAvailable) {
        popupData.iconType = PopupIcon.CROSS;
    } else if (!keepass.isAssociated() && !keepass.isDatabaseClosed) {
        popupData.iconType = PopupIcon.BANG;
    } else if (keepass.isKeePassXCAvailable && keepass.isDatabaseClosed) {
        popupData.iconType = PopupIcon.LOCKED;
    }

    // Get the current tab if no tab given
    tab ??= await getCurrentTab();
    if (!tab) {
        return;
    }

    // Credentials are available
    if (page?.tabs[tab.id]?.loginList.length > 0) {
        popupData.iconType = PopupIcon.NORMAL;
        popupData.popup = PopupState.LOGIN;
        browserAction.setBadgeText(tab?.id, page.tabs[tab.id]?.loginList.length);
    }

    // HTTP Basic Auth credentials are available
    if (page.tabs[tab.id]?.loginList?.logins?.length > 0) {
        popupData.iconType = PopupIcon.NORMAL;
        popupData.popup = PopupState.HTTP_AUTH;
        browserAction.setBadgeText(tab?.id, page.tabs[tab.id]?.loginList?.logins?.length);
    }

    await browserAction.updatePopupIcon(tab, popupData);
};

browserAction.setBadgeText = function(tabId, badgeText) {
    if (!tabId) {
        return;
    }

    browserActionWrapper.setBadgeBackgroundColor({ color: '#666666' });
    browserActionWrapper.setBadgeText({ text: String(badgeText), tabId: tabId });
};

browserAction.generateIconName = async function(iconType) {
    let name = 'icon_';
    name += (await keepass.keePassXCUpdateAvailable()) ? 'new_' : '';
    name += (!iconType || iconType === PopupIcon.NORMAL) ? PopupIcon.NORMAL : iconType;

    let style = 'colored';
    if (page?.settings?.useMonochromeToolbarIcon) {
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
    if (tab?.id) {
        browser.tabs.sendMessage(tab.id, {
            action: 'ignore_site',
            args: [ url ]
        });
    }
};
