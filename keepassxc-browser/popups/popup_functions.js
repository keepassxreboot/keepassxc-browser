'use strict';

const $ = function(elem) {
    return document.querySelector(elem);
};

const DEFAULT_POPUP_SIZE = '460px';
const PINNED_POPUP_SIZE = '380px';

function updateAvailableResponse(available) {
    if (available) {
        $('#update-available').show();
    }
}

async function initSettings() {
    $('#settings #options-button').addEventListener('click', () => {
        browser.runtime.openOptionsPage().then(close());
    });

    const customLoginFieldsButton = document.body.querySelector('#settings #choose-custom-login-fields-button');
    if (isFirefox()) {
        customLoginFieldsButton.id = 'choose-custom-login-fields-button-moz';
    }

    customLoginFieldsButton.addEventListener('click', async () => {
        await browser.windows.getCurrent();
        const tab = await getCurrentTab();
        await browser.runtime.getBackgroundPage();

        browser.tabs.sendMessage(tab?.id, {
            action: 'choose_credential_fields'
        });
        close();
    });
}

async function initColorTheme() {
    let theme = await browser.runtime.sendMessage({
        action: 'get_color_theme'
    });
    if (theme === 'system') {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-bs-theme', theme);
}

async function getLoginData() {
    const tab = await getCurrentTab();
    if (!tab) {
        return [];
    }

    const logins = await browser.runtime.sendMessage({
        action: 'get_login_list'
    });

    return logins;
}

// Sets default popup size for Chromium based browsers to prevent flash on popup open
function setDefaultPopupSize() {
    if (!isFirefox()) {
        document.body.style.width = DEFAULT_POPUP_SIZE;
    }
}

// Resizes the popup to the default size if the width is too small
function resizePopup() {
    if (document.body.offsetWidth > 0 && document.body.offsetWidth < 100) {
        document.body.style.width = isFirefox() ? PINNED_POPUP_SIZE : DEFAULT_POPUP_SIZE;
    } else {
        document.body.style.width = DEFAULT_POPUP_SIZE;
    }
}

(async () => {
    if (document.readyState === 'complete' || (document.readyState !== 'loading' && !document.documentElement.doScroll)) {
        await initSettings();
    } else {
        document.addEventListener('DOMContentLoaded', initSettings);
    }

    updateAvailableResponse(await browser.runtime.sendMessage({
        action: 'update_available_keepassxc'
    }));
})();
