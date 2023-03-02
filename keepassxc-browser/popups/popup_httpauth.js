'use strict';

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

            const credentials = data.logins[Number(e.target.id)];
            browser.runtime.sendMessage({
                action: 'fill_http_auth',
                args: credentials
            });

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
        // Return empty credentials
        browser.runtime.sendMessage({
            action: 'fill_http_auth',
            args: { login: '', password: '' }
        });

        close();
    });
})();
