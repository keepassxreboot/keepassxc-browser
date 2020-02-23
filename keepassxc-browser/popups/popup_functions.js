'use strict';

var $ = jQuery.noConflict(true);

function updateAvailableResponse(available) {
    if (available) {
        $('#update-available').show();
    }
}

async function initSettings() {
    $('#settings #btn-options').click(() => {
        browser.runtime.openOptionsPage().then(close());
    });

    $('#settings #btn-choose-credential-fields').click(async () => {
        await browser.windows.getCurrent();
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        await browser.runtime.getBackgroundPage();

        browser.tabs.sendMessage(tab.id, {
            action: 'choose_credential_fields'
        });
        close();
    });
}


async function initColorTheme() {
    const colorTheme = await browser.runtime.sendMessage({
        action: 'get_color_theme'
    });

    if (colorTheme === undefined || colorTheme === 'system') {
        document.body.removeAttribute('data-color-theme');
    } else {
        document.body.setAttribute('data-color-theme', colorTheme);
    }
}


$(async () => {
    await initSettings();
    updateAvailableResponse(await browser.runtime.sendMessage({
        action: 'update_available_keepassxc'
    }));
});
