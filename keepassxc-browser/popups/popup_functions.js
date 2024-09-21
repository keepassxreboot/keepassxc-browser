'use strict';

const $ = function(elem) {
    return document.querySelector(elem);
};

function updateAvailableResponse(available) {
    if (available) {
        $('#update-available').show();
    }
}

async function initSettings() {
    const tab = await getCurrentTab();

    $('#settings #options-button').addEventListener('click', () => {
        browser.runtime.openOptionsPage().then(close());
    });

    const customLoginFieldsButton = $('#settings #choose-custom-login-fields-button');
    if (isFirefox()) {
        customLoginFieldsButton.id = 'choose-custom-login-fields-button-moz';
    }

    customLoginFieldsButton.addEventListener('click', async () => {
        const tab = await getCurrentTab();
        browser.tabs.sendMessage(tab?.id, {
            action: 'choose_credential_fields'
        });
        close();
    });

    $('#settings #add-credentials-button').addEventListener('click', () => {
        $('#add-credentials-title').value = tab?.title;
        $('#add-credentials-url').value = tab?.url;
        if ($('#add-credentials')?.style?.display === 'none') {
            $('#add-credentials').show();
        } else {
            $('#add-credentials').hide();
        }

        if ($('#credentialsList')?.style?.display !== 'none') {
            $('#credentialsList')?.hide();
        } else {
            $('#credentialsList')?.show();
        }
    });

    $('#add-credentials-save-button').addEventListener('click', async (e) => {
        if (e?.currentTarget?.form?.checkValidity()) {
            await addNewCredential();
            close();
        }
    });

    $('#add-credentials-cancel-button').addEventListener('click', async () => {
        $('#add-credentials').hide();
        if ($('#credentialsList')?.style?.display === 'none') {
            $('#credentialsList').show();
        }
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
        action: 'get_login_list',
        args: tab.id
    });

    return logins;
}

async function addNewCredential() {
    const tab = await getCurrentTab();
    if (!tab) {
        return [];
    }

    browser.tabs.sendMessage(tab?.id, {
        action: 'add_new_credential', args: {
            username: $('input#add-credentials-username')?.value,
            password: $('input#add-credentials-password')?.value,
            group: $('input#add-credentials-group')?.value,
            title: $('input#add-credentials-title')?.value,
            url: $('input#add-credentials-url')?.value,
        }
    });
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
