'use strict';

let tabId = -1;

const getLoginData = async () => {
    const global = await browser.runtime.getBackgroundPage();
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = parseInt(window.location.search.split('=')[1]) || tabs[0].id;
    global.page.currentTabId = tabId;
    return global.page.tabs[tabId].loginList;
};

$(async () => {
    await initColorTheme();
    const data = await getLoginData();
    const ll = document.getElementById('login-list');
    let resolve = true;

    for (let i = 0; i < data.logins.length; ++i) {
        const a = document.createElement('a');
        a.setAttribute('class', 'list-group-item');
        a.textContent = data.logins[i].login + ' (' + data.logins[i].name + ')';
        $(a).data('creds', data.logins[i]);

        $(a).click(function() {
            resolve = false;
            if (data.resolve) {
                const creds = $(this).data('creds');
                data.resolve({
                    authCredentials: {
                        username: creds.login,
                        password: creds.password
                    }
                });
            }

            close();
        });

        ll.appendChild(a);
    }

    $('#lock-database-button').click(function() {
        browser.runtime.sendMessage({
            action: 'lock_database'
        }).then(statusResponse);
    });

    $('#btn-dismiss').click(async () => {
        resolve = false;
        data.resolve({ cancel: false });
        close();
    });

    window.addEventListener('beforeunload', async () => {
        const global = await browser.runtime.getBackgroundPage();

        if (global.page.tabs[tabId]) {
            global.page.tabs[tabId].httpAuthDialog = false;

            if (resolve && data.resolve) {
                data.resolve({ cancel: false });
            }
        }
    }, false);
});
