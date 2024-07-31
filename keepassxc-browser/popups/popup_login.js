'use strict';

(async () => {
    await initColorTheme();

    $('#lock-database-button').show();

    const tab = await getCurrentTab();
    if (!tab) {
        return [];
    }

    const logins = await getLoginData();
    const ll = document.getElementById('login-list');

    for (const [ i, login ] of logins.entries()) {
        const uuid = login.uuid;
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
                uuid: uuid
            });

            close();
        });

        ll.appendChild(a);
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
            const links = ll.getElementsByTagName('a');
            for (const i in links) {
                if (links.hasOwnProperty(i)) {
                    const found = String(links[i].textContent).match(re) !== null;
                    links[i].style = found ? '' : 'display: none;';
                }
            }
        });

        filter.focus();
    }

    $('#lock-database-button').addEventListener('click', (e) => {
        browser.runtime.sendMessage({
            action: 'lock_database'
        });

        $('#credentialsList').hide();
        $('#database-not-opened').show();
        $('#lock-database-button').hide();
        $('#database-error-message').textContent = tr('errorMessageDatabaseNotOpened');
    });

    $('#reopen-database-button').addEventListener('click', (e) => {
        browser.runtime.sendMessage({
            action: 'get_status',
            args: [ false, true ] // Set forcePopup to true
        });
    });
})();
