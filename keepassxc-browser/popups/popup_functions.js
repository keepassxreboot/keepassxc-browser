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
    $('#settings #options-button').addEventListener('click', () => {
        browser.runtime.openOptionsPage().then(close());
    });

    const customLoginFieldsButton = document.body.querySelector('#settings #choose-custom-login-fields-button');
    customLoginFieldsButton.id = getIconClass('choose-custom-login-fields-button');

    customLoginFieldsButton.addEventListener('click', async () => {
        const tab = await getCurrentTab();
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

async function getLoginData(useBasicAuth = false) {
    const tab = await getCurrentTab();
    if (!tab) {
        return [];
    }

    const logins = await browser.runtime.sendMessage({
        action: 'get_login_list',
        args: useBasicAuth
    });

    return logins;
}

async function lockDatabase(lockSingle = true) {
    return await browser.runtime.sendMessage({
        action: 'lock_database',
        args: [ lockSingle ]
    });
}


// Show the dropdown button if protocol is supported
async function showDropdownButton(isV2) {
    const isProtocolV2 = isV2 || await browser.runtime.sendMessage({ action: 'is_protocol_v2' });
    if (isProtocolV2) {
        $('.lock-button-area')?.classList.add('btn-group');
        $('#dropdown-button')?.show();
    } else {
        $('.lock-button-area')?.classList.remove('btn-group');
        $('#dropdown-button')?.hide();
    }
}

function hideDropdownButton() {
    $('.lock-button-area')?.classList.remove('btn-group');
    $('#dropdown-button')?.hide();
}

function hideElementsOnDatabaseLock() {
    $('.credentials').hide();
    $('#database-not-opened').show();
    $('#lock-database-button').hide();
    $('#dropdown-button').hide();
    $('#btn-dismiss')?.hide();
    $('#database-error-message').textContent = tr('errorMessageDatabaseNotOpened');
}

(async () => {
    if (document.readyState === 'complete' || (document.readyState !== 'loading' && !document.documentElement.doScroll)) {
        await initSettings();
    } else {
        document.addEventListener('DOMContentLoaded', initSettings);
    }

    document.addEventListener('mouseup', function(e) {
        if (!e.isTrusted) {
            return;
        }

        if (e.target.id !== 'kpxc-dropdown-item' && e.target.id !== 'dropdown-button') {
            $('.kpxc-dropdown-menu')?.hide();
            $('#dropdown-button').style.borderBottomRightRadius = '4px';
        }
    });

    updateAvailableResponse(await browser.runtime.sendMessage({
        action: 'update_available_keepassxc'
    }));

    $('#dropdown-button').addEventListener('click', (e) => {
        const dropdownMenu = $('.kpxc-dropdown-menu');
        if (!dropdownMenu) {
            return;
        }

        if (dropdownMenu.style.display === 'none') {
            dropdownMenu.show();
            $('#dropdown-button').style.borderBottomRightRadius = '0px';
        } else {
            dropdownMenu.hide();
            $('#dropdown-button').style.borderBottomRightRadius = '4px';
        }

        e.target.blur();
    });

    $('.kpxc-dropdown-item').addEventListener('click', () => {
        $('.kpxc-dropdown-menu')?.hide();
    });
})();
