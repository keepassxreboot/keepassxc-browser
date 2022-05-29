'use strict';

(async () => {
    resizePopup();
    await initColorTheme();

    $('#lock-database-button').show();

    const global = await browser.runtime.getBackgroundPage();
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
        return; // For example: only the background devtools or a popup are opened
    }

    const tab = tabs[0];
    const logins = global.page.tabs[tab.id].loginList;
    const ll = document.getElementById('login-list');

    for (let i = 0; i < logins.length; i++) {
        const uuid = logins[i].uuid;
        const a = document.createElement('a');
        a.textContent = logins[i].text;
        a.setAttribute('class', 'list-group-item');
        a.setAttribute('id', '' + i);

        a.addEventListener('click', (e) => {
            if (!e.isTrusted) {
                return;
            }

            const id = e.target.id;
            browser.tabs.sendMessage(tab.id, {
                action: 'fill_user_pass_with_specific_login',
                id: Number(id),
                uuid: uuid
            });

            close();
        });

        ll.appendChild(a);
    }

    if (logins.length > 1) {
        document.getElementById('filter-block').style = '';
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
