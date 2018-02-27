$(function() {
    browser.runtime.getBackgroundPage().then((global) => {
        browser.tabs.query({'active': true, 'currentWindow': true}).then((tabs) => {
            if (tabs.length === 0) {
                return; // For example: only the background devtools or a popup are opened
            }
            const tab = tabs[0];

            const logins = global.page.tabs[tab.id].loginList;
            let ul = document.getElementById('login-list');
            for (let i = 0; i < logins.length; i++) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.textContent = logins[i];
                li.setAttribute('class', 'list-group-item');
                li.appendChild(a);
                a.setAttribute('id', '' + i);
                a.addEventListener('click', (e) => {
                    const id = e.target.id;
                    browser.tabs.sendMessage(tab.id, {
                        action: 'fill_user_pass_with_specific_login',
                        id: id
                    });
                    close();
                });
                ul.appendChild(li);
            }
        });
    });

    $('#lock-database-button').click(function() {
        browser.runtime.sendMessage({
            action: 'lock-database'
        });
    });
});
