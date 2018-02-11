$(function() {
    browser.runtime.getBackgroundPage().then((global) => {
        browser.tabs.query({'active': true, 'currentWindow': true}).then((tabs) => {
            let tab = tabs[0];
            const data = global.page.tabs[tab.id].loginList;
            let ul = document.getElementById('login-list');
            for (let i = 0; i < data.logins.length; i++) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.textContent = data.logins[i].login + " (" + data.logins[i].name + ")";
                li.appendChild(a);
                $(a).data('creds', data.logins[i]);
                $(a).click(function () {
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
                ul.appendChild(li);
            }
        });
    });

    $('#lock-database-button').click(function() {
        browser.runtime.sendMessage({
            action: 'lock-database'
        }).then(status_response);
	});
});
