'use strict';

const DEFAULT_BROWSER_GROUP = 'KeePassXC-Browser Passwords';

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
        e.preventDefault();
        $('.credentials').hide();
        $('ul#list').empty();

        // Get group listing from KeePassXC
        browser.runtime.sendMessage({
            action: 'get_database_groups'
        }).then((result) => {
            // Only the Root group and no KeePassXC-Browser passwords -> save to default
            // Or when default group is not set and defaultGroupAskAlways is disabled -> save to default
            if ((result.groups === undefined || (result.groups.length > 0 && result.groups[0].children.length === 0)) ||
                (!result.defaultGroupAlwaysAsk && (result.defaultGroup === '' || result.defaultGroup === DEFAULT_BROWSER_GROUP))) {
                browser.runtime.sendMessage({
                    action: 'add_credentials',
                    args: [ _tab.credentials.username, _tab.credentials.password, _tab.credentials.url ]
                }).then(_verifyResult);
                return;
            } else if (!result.defaultGroupAlwaysAsk && (result.defaultGroup !== '' || result.defaultGroup !== DEFAULT_BROWSER_GROUP)) {
                // Another group name has been specified
                const [ gname, guuid ] = getDefaultGroup(result.groups[0].children, result.defaultGroup);
                if (gname === '' && guuid === '') {
                    showNotification(tr('popupRememberInfoDefaultGroupNotFound'));

                    // Create a new group
                    browser.runtime.sendMessage({
                        action: 'create_new_group',
                        args: [ result.defaultGroup ]
                    }).then((newGroup) => {
                        if (newGroup.name && newGroup.uuid) {
                            browser.runtime.sendMessage({
                                action: 'add_credentials',
                                args: [ _tab.credentials.username, _tab.credentials.password, _tab.credentials.url, newGroup.name, newGroup.uuid ]
                            }).then(_verifyResult);
                        } else {
                            showNotification(tr('popupRememberErrorCreatingNewGroup'));
                        }
                        return;
                    });
                }

                browser.runtime.sendMessage({
                    action: 'add_credentials',
                    args: [ _tab.credentials.username, _tab.credentials.password, _tab.credentials.url, gname, guuid ]
                }).then(_verifyResult);
                return;
            }

            const addChildren = function(group, parentElement, depth) {
                ++depth;
                const padding = depth * 20;

                for (const child of group.children) {
                    const a = createLink(child.name, child.uuid, child.children.length > 0);
                    a.attr('id', 'child');
                    a.css('cssText', 'padding-left: ' + String(padding) + 'px !important;');

                    if (parentElement.attr('id') === 'root') {
                        a.attr('id', 'root-child');
                    }

                    $('ul#list').append(a);
                    addChildren(child, a, depth);
                }
            };

            const createLink = function(group, groupUuid, hasChildren) {
                const a = $('<a>')
                    .attr('href', '#')
                    .attr('class', 'list-group-item')
                    .text(group)
                    .click(function(ev) {
                        ev.preventDefault();
                        browser.runtime.sendMessage({
                            action: 'add_credentials',
                            args: [ _tab.credentials.username, _tab.credentials.password, _tab.credentials.url, group, groupUuid ]
                        }).then(_verifyResult);
                    });

                if (hasChildren) {
                    a.text('\u25BE ' + group);
                }
                return a;
            };

            // Create the link list for group selection
            let depth = 0;
            for (const g of result.groups) {
                const a = createLink(g.name, g.uuid, g.children.length > 0);
                a.attr('id', 'root');

                $('ul#list').append(a);
                addChildren(g, a, depth);
            }

            $('.groups').show();
        });
    });

    $('#btn-update').click(function(e) {
        e.preventDefault();
        $('.groups').hide();
        $('ul#list').empty();

        //  Only one entry which could be updated
        if (_tab.credentials.list.length === 1) {
            // Use the current username if it's empty
            if (!_tab.credentials.username) {
                _tab.credentials.username = _tab.credentials.list[0].login;
            }

            browser.runtime.sendMessage({
                action: 'update_credentials',
                args: [ _tab.credentials.list[0].uuid, _tab.credentials.username, _tab.credentials.password, _tab.credentials.url ]
            }).then(_verifyResult);
        } else {
            $('.credentials:first .username-new:first strong:first').text(_tab.credentials.username);
            $('.credentials:first .username-exists:first strong:first').text(_tab.credentials.username);

            if (_tab.credentials.usernameExists) {
                $('.credentials:first .username-new:first').hide();
                $('.credentials:first .username-exists:first').show();
            } else {
                $('.credentials:first .username-new:first').show();
                $('.credentials:first .username-exists:first').hide();
            }

            for (let i = 0; i < _tab.credentials.list.length; i++) {
                const $a = $('<a>')
                    .attr('href', '#')
                    .attr('class', 'list-group-item')
                    .text(_tab.credentials.list[i].login + ' (' + _tab.credentials.list[i].name + ')')
                    .data('entryId', i)
                    .click(function(ev) {
                        ev.preventDefault();
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
                                showNotification(tr('popupRememberErrorPasswordNotChanged'));
                                _close();
                                return;
                            }

                            browser.runtime.sendMessage({
                                action: 'update_credentials',
                                args: [ _tab.credentials.list[entryId].uuid, _tab.credentials.username, _tab.credentials.password, _tab.credentials.url ]
                            }).then(_verifyResult);
                        });
                    });

                if (_tab.credentials.usernameExists && _tab.credentials.username === _tab.credentials.list[i].login) {
                    $a.css('font-weight', 'bold');
                }

                $('ul#list').append($a);
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
                const currentTab = tabs[0];
                browser.runtime.getBackgroundPage().then((global) => {
                    browser.tabs.sendMessage(currentTab.id, {
                        action: 'ignore_site',
                        args: [ _tab.credentials.url ]
                    });
                    _close();
                });
            });
        });
    });
}

function _connectedDatabase(db) {
    if (db.count > 1 && db.identifier) {
        $('.connected-database:first em:first').text(db.identifier);
        $('.connected-database:first').show();
    } else {
        $('.connected-database:first').hide();
    }
}

function _verifyResult(code) {
    if (code === 'error') {
        showNotification(tr('popupRememberErrorCannotSaveCredentials'));
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

// Traverse the groups and ensure all paths are found
const getDefaultGroup = function(groups, defaultGroup) {
    const getGroup = function(group, splitted, depth) {
        ++depth;
        for (const g of group) {
            if (g.name === splitted[depth]) {
                if (splitted.length === (depth + 1)) {
                    return [ g.name, g.uuid ];
                }
                return getGroup(g.children, splitted, depth);
            }
        }
        return [ '', '' ];
    };

    let depth = -1;
    const splitted = defaultGroup.split('/');
    return getGroup(groups, splitted, depth);
};

$(function() {
    browser.runtime.sendMessage({
        action: 'stack_add',
        args: [ 'icon_remember_red_background.png', 'popup_remember.html', 10, true, 0 ]
    });

    browser.runtime.sendMessage({
        action: 'get_tab_information'
    }).then(_initialize);

    browser.runtime.sendMessage({
        action: 'get_connected_database'
    }).then(_connectedDatabase);
});
