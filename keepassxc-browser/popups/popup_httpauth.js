'use strict';

const getLoginData = async () => {
    const global = await browser.runtime.getBackgroundPage();
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return global.page.tabs[tabs[0].id].loginList;
};

(async () => {
    resizePopup();
    await initColorTheme();

    $('#lock-database-button').show();

    const data = await getLoginData();
    const ll = document.getElementById('login-list');
    for (let i = 0; i < data.logins.length; ++i) {
        const a = document.createElement('a');
        a.setAttribute('class', 'list-group-item');
        a.textContent = data.logins[i].login + ' (' + data.logins[i].name + ')';
        a.setAttribute('id', '' + i);

        a.addEventListener('click', (e) => {
            if (!e.isTrusted) {
                return;
            }

            if (data.resolve) {
                const id = e.target.id;
                const creds = data.logins[Number(id)];
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

    $('#lock-database-button').addEventListener('click', function() {
        browser.runtime.sendMessage({
            action: 'lock_database'
        });

        $('.credentials').hide();
        $('#btn-dismiss').hide();
        $('#database-not-opened').show();
        $('#lock-database-button').hide();
        $('#database-error-message').textContent = tr('errorMessageDatabaseNotOpened');
    });

    $('#btn-dismiss').addEventListener('click', async () => {
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
})();
