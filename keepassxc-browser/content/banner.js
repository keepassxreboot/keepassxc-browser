'use strict';

const DEFAULT_BROWSER_GROUP = 'KeePassXC-Browser Passwords';

var kpxcBanner = {};
kpxcBanner.banner = undefined;
kpxcBanner.created = false;
kpxcBanner.credentials = {};

kpxcBanner.destroy = function() {
    kpxcBanner.created = false;
    kpxcBanner.credentials = {};

    const dialog = $('.kpxc-banner-dialog');
    if (dialog) {
        document.body.removeChild(dialog);
    }

    browser.runtime.sendMessage({
        action: 'remove_credentials_from_tab_information'
    });

    const banners = document.querySelectorAll('.kpxc-banner');
    if (banners.length > 0) {
        for (const b of banners) {
            document.body.removeChild(b);
        }
        return;
    }

    document.body.removeChild(kpxcBanner.banner);
};

kpxcBanner.create = async function(credentials = {}) {
    if (!kpxc.settings.showLoginNotifications || kpxcBanner.created) {
        return;
    }

    // Check if database is closed
    const state = await browser.runtime.sendMessage({ action: 'check_database_hash' });
    if (state === '') {
        //kpxcUI.createNotification('error', tr('rememberErrorDatabaseClosed'));
        return;
    }

    // Don't show anything if the site is in the ignore
    if (kpxc.settings.sitePreferences !== undefined) {
        for (const site of kpxc.settings.sitePreferences) {
            if (site.ignore !== IGNORE_NOTHING && (site.url === credentials.url || siteMatch(site.url, credentials.url))) {
                return;
            }
        }
    }

    kpxcBanner.created = true;
    kpxcBanner.credentials = credentials;

    const banner = kpxcUI.createElement('div', 'kpxc-banner', { 'id': 'container' });
    banner.style.zIndex = '2147483646';

    const bannerInfo = kpxcUI.createElement('div', 'banner-info');
    const bannerButtons = kpxcUI.createElement('div', 'banner-buttons');

    const className = (isFirefox() ? 'kpxc-banner-icon-moz' : 'kpxc-banner-icon');
    const icon = kpxcUI.createElement('span', className, { 'alt': 'logo' });

    const infoText = kpxcUI.createElement('span', '', {}, tr('rememberInfoText'));
    const usernameText = kpxcUI.createElement('span', 'small', {}, tr('popupUsername') + ' ');
    const usernameSpan = kpxcUI.createElement('span', 'small info information-username', {}, credentials.username);

    const newButton = kpxcUI.createElement('button', 'kpxc-button kpxc-green-button', { 'id': 'kpxc-banner-btn-new' }, tr('popupButtonNew'));
    const updateButton = kpxcUI.createElement('button', 'kpxc-button kpxc-orange-button', { 'id': 'kpxc-banner-btn-update' }, tr('popupButtonUpdate'));
    const dismissButton = kpxcUI.createElement('button', 'kpxc-button kpxc-red-button', { 'id': 'kpxc-banner-btn-dismiss' }, tr('popupButtonDismiss'));

    const separator = kpxcUI.createElement('div', 'kpxc-separator');
    const ignoreCheckbox = kpxcUI.createElement('input', 'kpxc-checkbox', { type: 'checkbox', name: 'ignoreCheckbox' });
    const checkboxLabel = kpxcUI.createElement('label', 'kpxc-checkbox-label', { for: 'ignoreCheckbox' }, tr('popupButtonIgnore'));

    // No existing credentials to update --> disable Update button
    if (credentials.list.length === 0) {
        updateButton.classList.remove('kpxc-orange-button');
        updateButton.disabled = true;
    }

    newButton.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }
        kpxcBanner.saveNewCredentials(credentials);
    });

    updateButton.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }
        kpxcBanner.updateCredentials(credentials);
    });

    dismissButton.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }

        // If a banner dialog is shown, display the main banner
        const dialog = $('.kpxc-banner-dialog');
        if (dialog) {
            $('#kpxc-banner-btn-new').hidden = false;
            $('#kpxc-banner-btn-update').hidden = false;
            $('.kpxc-checkbox').disabled = false;
            document.body.removeChild(dialog);
        } else {
            if (ignoreCheckbox.checked) {
                kpxc.ignoreSite([ window.top.location.href ]);
            }
            kpxcBanner.destroy();
        }
    });

    kpxcBanner.banner = banner;
    bannerInfo.appendMultiple(icon, infoText, usernameText, usernameSpan);
    bannerButtons.appendMultiple(newButton, updateButton, separator, ignoreCheckbox, checkboxLabel, dismissButton);
    banner.appendMultiple(bannerInfo, bannerButtons);
    document.body.appendChild(banner);
};

kpxcBanner.saveNewCredentials = async function(credentials = {}) {
    const result = await browser.runtime.sendMessage({
        action: 'get_database_groups'
    });

    // Only the Root group and no KeePassXC-Browser passwords -> save to default
    // Or when default group is not set and defaultGroupAskAlways is disabled -> save to default
    if ((result.groups === undefined || (result.groups.length > 0 && result.groups[0].children.length === 0)) ||
        (!result.defaultGroupAlwaysAsk && (result.defaultGroup === '' || result.defaultGroup === DEFAULT_BROWSER_GROUP))) {
        const res = await browser.runtime.sendMessage({
            action: 'add_credentials',
            args: [ credentials.username, credentials.password, credentials.url ]
        });
        kpxcBanner.verifyResult(res);
        return;
    } else if (!result.defaultGroupAlwaysAsk && (result.defaultGroup !== '' || result.defaultGroup !== DEFAULT_BROWSER_GROUP)) {
        // Another group name has been specified
        const [ gname, guuid ] = kpxcBanner.getDefaultGroup(result.groups[0].children, result.defaultGroup);
        if (gname === '' && guuid === '') {
            // Root group is used -> use the root path
            if (result.defaultGroup.toLowerCase() === 'root') {
                result.defaultGroup = '/';
            }

            // Create a new group
            const newGroup = await browser.runtime.sendMessage({
                action: 'create_new_group',
                args: [ result.defaultGroup ]
            });

            if (newGroup.name && newGroup.uuid) {
                const res = await browser.runtime.sendMessage({
                    action: 'add_credentials',
                    args: [ credentials.username, credentials.password, credentials.url, newGroup.name, newGroup.uuid ]
                });
                kpxcBanner.verifyResult(res);
            } else {
                kpxcUI.createNotification('error', tr('rememberErrorCreatingNewGroup'));
            }
            return;
        }

        const res = await browser.runtime.sendMessage({
            action: 'add_credentials',
            args: [ credentials.username, credentials.password, credentials.url, gname, guuid ]
        });
        kpxcBanner.verifyResult(res);
        return;
    }

    const addChildren = function(group, parentElement, depth) {
        ++depth;
        const padding = depth * 20;

        for (const child of group.children) {
            const a = createLink(child.name, child.uuid, child.children.length > 0);
            a.setAttribute('id', 'child');
            a.style.paddingLeft = Pixels(padding);

            if (parentElement.getAttribute('id') === 'root') {
                a.setAttribute('id', 'root-child');
            }

            $('ul#list').appendChild(a);
            addChildren(child, a, depth);
        }
    };

    const createLink = function(group, groupUuid, hasChildren) {
        const a = kpxcUI.createElement('a', 'list-group-item', { 'href': '#' }, group);
        a.addEventListener('click', async function(e) {
            e.preventDefault();
            if (!e.isTrusted) {
                return;
            }

            const res = await browser.runtime.sendMessage({
                action: 'add_credentials',
                args: [ credentials.username, credentials.password, credentials.url, group, groupUuid ]
            });

            kpxcBanner.verifyResult(res);
        });

        if (hasChildren) {
            a.textContent = '\u25BE ' + group;
        }
        return a;
    };

    kpxcBanner.createGroupDialog();

    // Create the link list for group selection
    let depth = 0;
    for (const g of result.groups) {
        const a = createLink(g.name, g.uuid, g.children.length > 0);
        a.setAttribute('id', 'root');

        $('ul#list').appendChild(a);
        addChildren(g, a, depth);
    }

    $('.kpxc-banner-dialog').style.display = 'block';
};

kpxcBanner.updateCredentials = async function(credentials = {}) {
    //  Only one entry which could be updated
    if (credentials.list.length === 1) {
        // Use the current username if it's empty
        if (!credentials.username) {
            credentials.username = credentials.list[0].login;
        }

        const res = await browser.runtime.sendMessage({
            action: 'update_credentials',
            args: [ credentials.list[0].uuid, credentials.username, credentials.password, credentials.url ]
        });
        kpxcBanner.verifyResult(res);
    } else {
        await kpxcBanner.createCredentialDialog();
        $('.kpxc-banner-dialog .username-new .strong').textContent = credentials.username;
        $('.kpxc-banner-dialog .username-exists .strong').textContent = credentials.username;

        if (credentials.usernameExists) {
            $('.kpxc-banner-dialog .username-new').style.display = 'none';
            $('.kpxc-banner-dialog .username-exists').style.display = 'block';
        } else {
            $('.kpxc-banner-dialog .username-new').style.display = 'block';
            $('.kpxc-banner-dialog .username-exists').style.display = 'none';
        }

        for (let i = 0; i < credentials.list.length; i++) {
            const a = kpxcUI.createElement('a', 'list-group-item', { 'href': '#', 'entryId': i }, `${credentials.list[i].login} (${credentials.list[i].name})`);
            a.addEventListener('click', function(e) {
                e.preventDefault();
                if (!e.isTrusted) {
                    return;
                }

                const entryId = e.target.getAttribute('entryId');

                // Use the current username if it's empty
                if (!credentials.username) {
                    credentials.username = credentials.list[entryId].login;
                }

                let url = credentials.url;
                url = (url.length > 50) ? url.substring(0, 50) + '...' : url;

                // Check if the password has changed for the updated credentials
                browser.runtime.sendMessage({
                    action: 'retrieve_credentials',
                    args: [ url, '', true ] // Sets triggerUnlock to true
                }).then(async (creds) => {
                    if (!creds || creds.length !== credentials.list.length) {
                        kpxcBanner.verifyResult('error');
                        return;
                    }

                    const res = await browser.runtime.sendMessage({
                        action: 'update_credentials',
                        args: [ credentials.list[entryId].uuid, credentials.username, credentials.password, credentials.url ]
                    });
                    kpxcBanner.verifyResult(res);
                });
            });

            if (credentials.usernameExists && credentials.username === credentials.list[i].login) {
                a.style.fontWeight = 'bold';
            }

            $('ul#list').appendChild(a);
        }

        $('.kpxc-banner-dialog').style.display = 'block';
    }
};

kpxcBanner.verifyResult = function(code) {
    if (code === 'error') {
        kpxcUI.createNotification('error', tr('rememberErrorCannotSaveCredentials'));
    } else if (code === 'created') {
        kpxcUI.createNotification('success', tr('rememberCredentialsSaved', kpxcBanner.credentials.username || tr('rememberEmptyUsername')));
    } else if (code === 'updated') {
        kpxcUI.createNotification('success', tr('rememberCredentialsUpdated', kpxcBanner.credentials.username || tr('rememberEmptyUsername')));
    } else if (code === 'canceled') {
        kpxcUI.createNotification('warning', tr('rememberCredentialsNotSaved'));
    } else {
        kpxcUI.createNotification('error', tr('rememberErrorDatabaseClosed'));
    }
    kpxcBanner.destroy();
};

// Traverse the groups and ensure all paths are found
kpxcBanner.getDefaultGroup = function(groups, defaultGroup) {
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

kpxcBanner.createCredentialDialog = async function() {
    $('#kpxc-banner-btn-new').hidden = true;
    $('#kpxc-banner-btn-update').hidden = true;
    $('.kpxc-checkbox').disabled = true;

    const connectedDatabase = await browser.runtime.sendMessage({
        action: 'get_connected_database'
    });
    const databaseName = connectedDatabase.count > 0 ? connectedDatabase.identifier : '';

    const dialog = kpxcUI.createElement('div', 'kpxc-banner-dialog');
    const databaseText = kpxcUI.createElement('p');
    const spanDatabaseText = kpxcUI.createElement('span', '', {}, tr('rememberSaving'));
    const usernameNew = kpxcUI.createElement('p', 'username-new');
    const usernameExists = kpxcUI.createElement('p', 'username-exists');
    const chooseCreds = kpxcUI.createElement('p', '', {}, tr('rememberChooseCredentials'));
    const list = kpxcUI.createElement('ul', 'list-group', { 'id': 'list' });
    const spanNewUsername = kpxcUI.createElement('span', '', {}, tr('rememberNewUsername'));
    const spanUsernameExists = kpxcUI.createElement('span', '', {}, tr('rememberUsernameExists'));

    // Set dialog position
    dialog.style.top = Pixels(kpxcBanner.banner.offsetHeight);
    dialog.style.right = '0';

    databaseText.appendChild(spanDatabaseText);
    const spanName = kpxcUI.createElement('span', 'strong', {}, databaseName);
    databaseText.append(spanName);

    usernameNew.appendChild(spanNewUsername);
    usernameExists.appendChild(spanUsernameExists);
    usernameNew.append(kpxcUI.createElement('span', 'strong'));
    usernameExists.append(kpxcUI.createElement('span', 'strong'));
    dialog.appendMultiple(databaseText, usernameNew, usernameExists, chooseCreds, list);
    document.body.appendChild(dialog);
};

kpxcBanner.createGroupDialog = function() {
    $('#kpxc-banner-btn-new').hidden = true;
    $('#kpxc-banner-btn-update').hidden = true;
    $('.kpxc-checkbox').disabled = true;

    const dialog = kpxcUI.createElement('div', 'kpxc-banner-dialog');
    const chooseGroup = kpxcUI.createElement('p', '', {}, tr('rememberChooseGroup'));
    const list = kpxcUI.createElement('ul', 'list-group', { 'id': 'list' });

    // Set dialog position
    dialog.style.top = Pixels(kpxcBanner.banner.offsetHeight);
    dialog.style.right = Pixels(0);

    dialog.appendMultiple(chooseGroup, list);
    document.body.appendChild(dialog);
};
