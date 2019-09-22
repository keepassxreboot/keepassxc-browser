'use strict';

const getLoginData = async () => {
    const global = await browser.runtime.getBackgroundPage();
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return global.page.tabs[tabs[0].id].loginList;
};

$(async () => {
    const data = await getLoginData();
    const ll = document.getElementById('login-list');
    for (let i = 0; i < data.logins.length; ++i) {
        const a = document.createElement('a');
        a.setAttribute('class', 'list-group-item');
        a.textContent = data.logins[i].login + ' (' + data.logins[i].name + ')';
        $(a).data('creds', data.logins[i]);
        $(a).click(function() {
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
            action: 'lock-database'
        }).then(statusResponse);
    });

    $('#btn-dismiss').click(async () => {
        const loginData = await getLoginData();
        // Using reject won't work with every browser. So return empty credentials instead.
        if (loginData.resolve) {
            loginData.resolve({
                authCredentials: {
                    username: '',
                    password: ''
                }
            });
        }
        close();
    });
});
