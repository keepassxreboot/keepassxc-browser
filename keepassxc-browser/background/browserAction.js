'use strict';

const browserAction = {};

browserAction.show = function(tab, popupData) {
    popupData ??= page.popupData;
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
        popupData.iconType = 'questionmark';
        popupData.popup = 'popup_login';
    }

    browserAction.show(tab, popupData);
};

browserAction.generateIconName = function(iconType) {
    let name = 'icon_';
    name += (keepass.keePassXCUpdateAvailable()) ? 'new_' : '';
    name += (!iconType || iconType === 'normal') ? 'normal' : iconType;

    let style = 'colored';
    if (page.settings.useMonochromeToolbarIcon) {
        if (page.settings.colorTheme === 'system') {
            style = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
    await browser.runtime.getBackgroundPage();
    browser.tabs.sendMessage(tab.id, {
        action: 'ignore_site',
        args: [ url ]
    });
};
