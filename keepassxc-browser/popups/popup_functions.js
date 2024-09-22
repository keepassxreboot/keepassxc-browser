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

// Initializes the default login list
async function initializeLoginList() {
    const tab = await getCurrentTab();
    if (!tab) {
        return [];
    }

    const logins = await getLoginData();
    const loginList = document.getElementById('login-list');
    
    // Empty any existing values
    removeAllChildren(loginList);

    for (const [ i, login ] of logins.entries()) {
        const a = document.createElement('a');
        a.textContent = login.text;
        a.setAttribute('class', 'list-group-item');
        a.setAttribute('id', '' + i);

        a.addEventListener('click', (e) => {
            if (!e.isTrusted) {
                return;
            }

            const id = e.target.id;
            browser.tabs.sendMessage(tab?.id, {
                action: 'fill_user_pass_with_specific_login',
                id: Number(id),
                uuid: login?.uuid
            });

            close();
        });

        loginList.appendChild(a);
    }

    if (logins.length > 1) {
        $('#filter-block').show();
        const filter = document.getElementById('login-filter');
        filter.addEventListener('keyup', (e) => {
            if (!e.isTrusted) {
                return;
            }

            const val = filter.value;
            const re = new RegExp(val, 'i');
            const links = loginList.getElementsByTagName('a');
            for (const i in links) {
                if (links.hasOwnProperty(i)) {
                    const found = String(links[i].textContent).match(re) !== null;
                    links[i].style = found ? '' : 'display: none;';
                }
            }
        });

        filter.focus();
    }
}

// Intitializes the login list for HTTP Basic Auth
async function initializeHttpAuthLoginList() {
    const data = await getLoginData();
    const loginList = document.getElementById('http-auth-login-list');

    // Empty any existing values
    removeAllChildren(loginList);

    for (const [ i, login ] of data.logins.entries()) {
        const a = document.createElement('a');
        a.textContent = login.login + ' (' + login.name + ')';
        a.setAttribute('class', 'list-group-item');
        a.setAttribute('id', '' + i);

        a.addEventListener('click', (e) => {
            if (!e.isTrusted) {
                return;
            }

            const credentials = data.logins[Number(e.target.id)];
            browser.runtime.sendMessage({
                action: 'fill_http_auth',
                args: credentials
            });

            close();
        });

        loginList.appendChild(a);
    }
}

(async () => {
    if (
        document.readyState === 'complete' ||
        (document.readyState !== 'loading' && !document.documentElement.doScroll)
    ) {
        await initSettings();
    } else {
        document.addEventListener('DOMContentLoaded', initSettings);
    }

    updateAvailableResponse(await browser.runtime.sendMessage({
        action: 'update_available_keepassxc'
    }));
})();
