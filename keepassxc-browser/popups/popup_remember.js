'use strict';

var _tab;

function _initialize(tab) {
    _tab = tab;

    // No credentials set or credentials already cleared
    if (!_tab.credentials.username && !_tab.credentials.password) {
        _close();
        return;
    }

    // No existing credentials to update --> disable Update button
    if (_tab.credentials.list.length === 0) {
        $('#btn-update').attr('disabled', true).removeClass('btn-warning');
    }

    // No username available. This might be because of trigger from context menu --> disable New button
    if (!_tab.credentials.username && _tab.credentials.password) {
        $('#btn-new').attr('disabled', true).removeClass('btn-success');
    }

    let url = _tab.credentials.url;
    url = (url.length > 50) ? url.substring(0, 50) + '...' : url;
    $('.information-url:first').text(url);
    $('.information-username:first').text(_tab.credentials.username);

    $('#btn-new').click(function(e) {
        browser.runtime.sendMessage({
            action: 'add_credentials',
            args: [_tab.credentials.username, _tab.credentials.password, _tab.credentials.url]
        }).then(_verifyResult);
    });

    $('#btn-update').click(function(e) {
        e.preventDefault();

        //  Only one entry which could be updated
        if(_tab.credentials.list.length === 1) {
            // Use the current username if it's empty
            if (!_tab.credentials.username) {
                _tab.credentials.username = _tab.credentials.list[0].login;
            }

            browser.runtime.sendMessage({
                action: 'update_credentials',
                args: [_tab.credentials.list[0].uuid, _tab.credentials.username, _tab.credentials.password, _tab.credentials.url]
            }).then(_verifyResult);
        }
        else {
            $('.credentials:first .username-new:first strong:first').text(_tab.credentials.username);
            $('.credentials:first .username-exists:first strong:first').text(_tab.credentials.username);

            if (_tab.credentials.usernameExists) {
                $('.credentials:first .username-new:first').hide();
                $('.credentials:first .username-exists:first').show();
            }
            else {
                $('.credentials:first .username-new:first').show();
                $('.credentials:first .username-exists:first').hide();
            }

            for (let i = 0; i < _tab.credentials.list.length; i++) {
                let $a = $('<a>')
                    .attr('href', '#')
                    .text(_tab.credentials.list[i].login + ' (' + _tab.credentials.list[i].name + ')')
                    .data('entryId', i)
                    .click(function(e) {
                        e.preventDefault();
                        const entryId = $(this).data('entryId');

                        // Use the current username if it's empty
                        if (!_tab.credentials.username) {
                            _tab.credentials.username = _tab.credentials.list[entryId].login;
                        }

                        // Check if the password has changed for the updated credentials
                        browser.runtime.sendMessage({
                            action: 'retrieve_credentials',
                            args: [ url, '', false, true ]
                        }).then((credentials) => {
                            if (!credentials || credentials.length !== _tab.credentials.list.length) {
                                _verifyResult('error');
                                return;
                            }
                            
                            // Show a notification if the user tries to update credentials using the old password
                            if (credentials[entryId].password === _tab.credentials.password) {
                                showNotification('Error: Credentials not updated. The password has not been changed.');
                                _close();
                                return;
                            }

                            browser.runtime.sendMessage({
                                action: 'update_credentials',
                                args: [_tab.credentials.list[entryId].uuid, _tab.credentials.username, _tab.credentials.password, _tab.credentials.url]
                            }).then(_verifyResult);
                        });
                    });

                if (_tab.credentials.usernameExists && _tab.credentials.username === _tab.credentials.list[i].login) {
                    $a.css('font-weight', 'bold');
                }

                const $li = $('<li class=\"list-group-item\">').append($a);
                $('ul#list').append($li);
            }

            $('.credentials').show();
        }
    });

    $('#btn-dismiss').click(function(e) {
        e.preventDefault();
        _close();
    });

    $('#btn-ignore').click(function(e) {
        browser.windows.getCurrent().then((win) => {
            browser.tabs.query({ 'active': true, 'currentWindow': true }).then((tabs) => {
                const tab = tabs[0];
                browser.runtime.getBackgroundPage().then((global) => {
                    browser.tabs.sendMessage(tab.id, {
                        action: 'ignore-site',
                        args: [_tab.credentials.url]
                    });
                    _close();
                });
            });
        });
    });
}

function _connected_database(db) {
    if (db.count > 1 && db.identifier) {
        $('.connected-database:first em:first').text(db.identifier);
        $('.connected-database:first').show();
    }
    else {
        $('.connected-database:first').hide();
    }
}

function _verifyResult(code) {
    if (code === 'error') {
        showNotification('Error: Credentials cannot be saved or updated.');
    }
    _close();
}

function _close() {
    browser.runtime.sendMessage({
        action: 'remove_credentials_from_tab_information'
    });

    browser.runtime.sendMessage({
        action: 'pop_stack'
    });

    close();
}

$(function() {
    browser.runtime.sendMessage({
        action: 'stack_add',
        args: ['icon_remember_red_background_19x19.png', 'popup_remember.html', 10, true, 0]
    });

    browser.runtime.sendMessage({
        action: 'get_tab_information'
    }).then(_initialize);

    browser.runtime.sendMessage({
        action: 'get_connected_database'
    }).then(_connected_database);
});
