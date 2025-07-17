'use strict';

(async () => {
    await initColorTheme();

    $('#lock-database-button').show();
    await showDropdownButton();

    const basicAuthLogins = await getLoginData(true);
    const ll = document.getElementById('login-list');

    for (const [ i, login ] of basicAuthLogins.loginList.entries()) {
        const a = document.createElement('a');
        a.setAttribute('class', 'list-group-item');
        a.textContent = login.login + ' (' + login.name + ')';
        a.setAttribute('id', '' + i);

        a.addEventListener('click', (e) => {
            if (!e.isTrusted) {
                return;
            }

            const credentials = basicAuthLogins.loginList[Number(e.target.id)];
            browser.runtime.sendMessage({
                action: 'fill_http_auth',
                args: credentials
            });

            close();
        });
        ll.appendChild(a);
    }

    $('#lock-database-button').addEventListener('click', () => {
        lockDatabase();
        hideElementsOnDatabaseLock();
    });

    $('.kpxc-dropdown-item').addEventListener('click', () => {
        lockDatabase(false);
        hideElementsOnDatabaseLock();
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
