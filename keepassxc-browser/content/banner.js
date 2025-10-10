'use strict';

const DEFAULT_BROWSER_GROUP = 'KeePassXC-Browser Passwords';

const kpxcBanner = {};
kpxcBanner.banner = undefined;
kpxcBanner.created = false;
kpxcBanner.credentials = {};
kpxcBanner.wrapper = undefined;

kpxcBanner.destroy = async function() {
    if (!kpxcBanner.created) {
        return;
    }

    kpxcBanner.credentials = {};

    const dialog = kpxcBanner.shadowSelector('.kpxc-banner-dialog');
    if (dialog) {
        kpxcBanner.banner.removeChild(dialog);
    }

    await sendMessage('remove_credentials_from_tab_information');

    try {
        if (kpxcBanner.wrapper && window.parent.document.body.contains(kpxcBanner.wrapper)) {
            window.parent.document.body.removeChild(kpxcBanner.wrapper);
        } else {
            window.parent.document.body.removeChild(window.parent.document.body.querySelector('#kpxc-banner'));
        }
    } catch(e) {
        kpxcBanner.wrapper.style.display = 'hidden';
    }

    kpxcBanner.created = false;
};

kpxcBanner.create = async function(credentials = {}) {
    const connectedDatabase = await sendMessage('get_connected_database');
    if (!kpxc.settings.showLoginNotifications
        || kpxcBanner.created
        || connectedDatabase.identifier === null
        || kpxc.databaseState !== DatabaseState.UNLOCKED) {
        return;
    }

    // Don't show anything if the site is in the ignore
    if (await kpxc.siteIgnored(IGNORE_NORMAL)) {
        return;
    }

    credentials.username = credentials.username.trim();
    kpxcBanner.credentials = credentials;

    const bannerPosition = await sendMessage('banner_get_position');
    const bannerClass =
        bannerPosition === BannerPosition.TOP ? 'kpxc-banner kpxc-banner-on-top' : 'kpxc-banner kpxc-banner-on-bottom';
    const banner = kpxcUI.createElement('div', bannerClass, { 'id': 'kpxc-banner-container' });
    initColorTheme(banner);
    banner.style.zIndex = '2147483646';

    const bannerInfo = kpxcUI.createElement('div', 'banner-info');
    const bannerButtons = kpxcUI.createElement('div', 'banner-buttons');

    const className = kpxc.isFirefox ? 'kpxc-banner-icon-moz' : 'kpxc-banner-icon';
    const icon = kpxcUI.createElement('span', className, { 'alt': 'logo' });

    const infoText = kpxcUI.createElement('span', '', {}, tr('rememberInfoText'));
    const usernameText = kpxcUI.createElement('span', 'small', {}, tr('popupUsername') + ' ');
    const usernameSpan = kpxcUI.createElement('span', 'small info information-username', {}, credentials.username);

    const newButton = kpxcUI.createElement('button', GREEN_BUTTON, { id: 'kpxc-banner-btn-new' }, tr('popupButtonNew'));
    const updateButton = kpxcUI.createElement(
        'button',
        ORANGE_BUTTON,
        { id: 'kpxc-banner-btn-update' },
        tr('popupButtonUpdate'),
    );
    const dismissButton = kpxcUI.createElement(
        'button',
        RED_BUTTON,
        { id: 'kpxc-banner-btn-dismiss' },
        tr('popupButtonCancel'),
    );

    const separator = kpxcUI.createElement('div', 'kpxc-separator');
    const ignoreCheckbox = kpxcUI.createElement('input', 'kpxc-checkbox', {
        type: 'checkbox',
        name: 'ignoreCheckbox',
        id: 'kpxc-banner-ignoreCheckbox',
    });
    const checkboxLabel = kpxcUI.createElement(
        'label',
        'kpxc-checkbox-label',
        { for: 'kpxc-banner-ignoreCheckbox' },
        tr('popupButtonIgnore'),
    );

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
        dismissButton.textContent = tr('popupButtonBack');
    });

    kpxcUI.makeBannerDraggable(banner);

    dismissButton.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }

        // If a banner dialog is shown, display the main banner
        const dialog = kpxcBanner.shadowSelector('.kpxc-banner-dialog');
        if (dialog) {
            kpxcBanner.shadowSelector('#kpxc-banner-btn-new').hidden = false;
            kpxcBanner.shadowSelector('#kpxc-banner-btn-update').hidden = false;
            kpxcBanner.shadowSelector('.kpxc-checkbox').disabled = false;
            kpxcBanner.banner.removeChild(dialog);
            dismissButton.textContent = tr('popupButtonCancel');
        } else {
            if (ignoreCheckbox.checked) {
                const ignoreUrl = window.location.href.slice(0, window.location.href.lastIndexOf('/') + 1) + '*';
                kpxc.ignoreSite([ ignoreUrl ]);
            }
            kpxcBanner.destroy();
        }
    });

    kpxcBanner.banner = banner;
    bannerInfo.appendMultiple(icon, infoText, usernameText, usernameSpan);
    bannerButtons.appendMultiple(newButton, updateButton, separator, ignoreCheckbox, checkboxLabel, dismissButton);
    banner.appendMultiple(bannerInfo, bannerButtons);

    initColorTheme(banner);

    const styleSheet = createStylesheet('css/banner.css');
    const buttonStyleSheet = createStylesheet('css/button.css');
    const colorStyleSheet = createStylesheet('css/colors.css');

    const wrapper = document.createElement('div');
    wrapper.style.all = 'unset';
    wrapper.style.display = 'none';
    styleSheet.addEventListener('load', () => wrapper.style.display = 'block');
    this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    this.shadowRoot.append(colorStyleSheet);
    this.shadowRoot.append(styleSheet);
    this.shadowRoot.append(buttonStyleSheet);
    this.shadowRoot.append(banner);
    kpxcBanner.wrapper = wrapper;

    if (window.self === window.top && !kpxcBanner.created) {
        window.parent.document.body.appendChild(wrapper);
        kpxcUI.observeWrapper(wrapper);
        kpxcBanner.created = true;
    }
};

kpxcBanner.saveNewCredentials = async function(credentials = {}) {
    const saveToDefaultGroup = async function(creds) {
        const args = [ creds.username, creds.password, creds.url ];
        const res = await sendMessage('add_credentials', args);
        kpxcBanner.verifyResult(res);
    };

    const result = await sendMessage('get_database_groups');
    if (!result || !result.groups) {
        logError('Empty result from get_database_groups');
        await saveToDefaultGroup(credentials);
        return;
    }

    if (!result.defaultGroupAlwaysAsk) {
        if (result.defaultGroup === '' || result.defaultGroup === DEFAULT_BROWSER_GROUP) {
            await saveToDefaultGroup(credentials);
            return;
        } else {
            // A specified group is used
            let gname = '';
            let guuid = '';

            if (result.defaultGroup.toLowerCase() === 'root') {
                result.defaultGroup = '/';
                gname = result.groups[0].name;
                guuid = result.groups[0].uuid;
            } else {
                [ gname, guuid ] = kpxcBanner.getDefaultGroup(result.groups[0].children, result.defaultGroup);
                if (gname === '' && guuid === '') {
                    // Create a new group
                    const newGroup = await sendMessage('create_new_group', [ result.defaultGroup ]);
                    if (newGroup.name && newGroup.uuid) {
                        const res = await sendMessage('add_credentials', [
                            credentials.username,
                            credentials.password,
                            credentials.url,
                            newGroup.name,
                            newGroup.uuid,
                        ]);
                        kpxcBanner.verifyResult(res);
                    } else {
                        kpxcUI.createNotification('error', tr('rememberErrorCreatingNewGroup'));
                    }

                    return;
                }
            }

            const res = await sendMessage('add_credentials', [
                credentials.username,
                credentials.password,
                credentials.url,
                gname,
                guuid,
            ]);
            kpxcBanner.verifyResult(res);
            return;
        }
    }

    const addChildren = function(group, parentElement, depth = 0) {
        ++depth;
        const padding = depth * 20;

        for (const child of group.children) {
            const a = createLink(child.name, child.uuid, child.children.length > 0);
            a.setAttribute('id', 'child');
            a.style.paddingLeft = Pixels(padding);

            if (parentElement.getAttribute('id') === 'root') {
                a.setAttribute('id', 'root-child');
            }

            kpxcBanner.shadowSelector('ul#list').appendChild(a);
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

            const res = await sendMessage('add_credentials', [
                credentials.username,
                credentials.password,
                credentials.url,
                group,
                groupUuid,
            ]);
            kpxcBanner.verifyResult(res);
        });

        if (hasChildren) {
            a.textContent = '\u25BE ' + group;
        }
        return a;
    };

    kpxcBanner.createGroupDialog();

    // Create the link list for group selection
    for (const g of result.groups) {
        const a = createLink(g.name, g.uuid, g.children.length > 0);
        a.setAttribute('id', 'root');

        kpxcBanner.shadowSelector('ul#list').appendChild(a);
        addChildren(g, a);
    }

    kpxcBanner.shadowSelector('.kpxc-banner-dialog').style.display = 'block';
};

kpxcBanner.updateCredentials = async function(credentials = {}) {
    //  Only one entry which could be updated
    if (credentials.list?.length === 1) {
        // Use the current username if it's empty
        credentials.username ??= credentials.list[0].login;

        const res = await sendMessage('update_credentials', [
            credentials.list[0].uuid,
            credentials.username,
            credentials.password,
            credentials.url,
        ]);
        kpxcBanner.verifyResult(res);
    } else {
        await kpxcBanner.createCredentialDialog();
        kpxcBanner.shadowSelector('.kpxc-banner-dialog .username-new .strong').textContent = credentials.username;
        kpxcBanner.shadowSelector('.kpxc-banner-dialog .username-exists .strong').textContent = credentials.username;

        if (credentials.usernameExists) {
            kpxcBanner.shadowSelector('.kpxc-banner-dialog .username-new').style.display = 'none';
            kpxcBanner.shadowSelector('.kpxc-banner-dialog .username-exists').style.display = 'block';
        } else {
            kpxcBanner.shadowSelector('.kpxc-banner-dialog .username-new').style.display = 'block';
            kpxcBanner.shadowSelector('.kpxc-banner-dialog .username-exists').style.display = 'none';
        }

        for (const [ i, cred ] of credentials.list.entries()) {
            const a = kpxcUI.createElement(
                'a',
                'list-group-item',
                { href: '#', entryId: i },
                `${cred.login} (${cred.name})`,
            );
            a.addEventListener('click', function(e) {
                e.preventDefault();
                if (!e.isTrusted) {
                    return;
                }

                const entryId = e.target.getAttribute('entryId');

                // Use the current username if it's empty
                if (!credentials.username) {
                    credentials.username = cred.login;
                }

                let url = credentials.url;
                url = (url.length > 50) ? url.substring(0, 50) + '...' : url;

                // Check if the password has changed for the updated credentials
                browser.runtime.sendMessage({
                    action: 'retrieve_credentials',
                    args: [ url, '', true ] // Sets triggerUnlock to true
                }).then(async creds => {
                    if (!creds || creds.length !== credentials.list.length) {
                        kpxcBanner.verifyResult('error');
                        return;
                    }

                    const res = await sendMessage('update_credentials', [
                        credentials.list[entryId].uuid,
                        credentials.username,
                        credentials.password,
                        credentials.url,
                    ]);
                    kpxcBanner.verifyResult(res);
                });
            });

            if (credentials.usernameExists && credentials.username === cred.login) {
                a.style.fontWeight = 'bold';
            }

            kpxcBanner.shadowSelector('ul#list').appendChild(a);
        }

        kpxcBanner.shadowSelector('.kpxc-banner-dialog').style.display = 'block';
    }
};

kpxcBanner.verifyResult = async function(code) {
    if (code === 'error') {
        kpxcUI.createNotification('error', tr('rememberErrorCannotSaveCredentials'));
    } else if (code === 'created') {
        kpxcUI.createNotification(
            'success',
            tr('rememberCredentialsSaved', kpxcBanner.credentials.username || tr('rememberEmptyUsername')),
        );
        await kpxc.retrieveCredentials(true); // Forced reload
    } else if (code === 'updated') {
        kpxcUI.createNotification(
            'success',
            tr('rememberCredentialsUpdated', kpxcBanner.credentials.username || tr('rememberEmptyUsername')),
        );
        await kpxc.retrieveCredentials(true); // Forced reload
    } else if (code === 'canceled') {
        kpxcUI.createNotification('warning', tr('rememberCredentialsNotSaved'));
    } else {
        kpxcUI.createNotification('error', tr('rememberErrorDatabaseClosed'));
    }
    kpxcBanner.destroy();
};

// Traverse the groups and ensure all paths are found
kpxcBanner.getDefaultGroup = function(groups, defaultGroup) {
    const getGroup = function(group, splitted, depth = -1) {
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

    const splitted = defaultGroup.split('/');
    return getGroup(groups, splitted);
};

kpxcBanner.createCredentialDialog = async function() {
    kpxcBanner.shadowSelector('#kpxc-banner-btn-new').hidden = true;
    kpxcBanner.shadowSelector('#kpxc-banner-btn-update').hidden = true;
    kpxcBanner.shadowSelector('.kpxc-checkbox').disabled = true;

    const connectedDatabase = await sendMessage('get_connected_database');
    const databaseName = connectedDatabase.count > 0 ? connectedDatabase.identifier : '';

    const dialog = kpxcUI.createElement('div', 'kpxc-banner-dialog kpxc-banner-dialog-top');
    const databaseText = kpxcUI.createElement('p');
    const spanDatabaseText = kpxcUI.createElement('span', '', {}, tr('rememberSaving'));
    const usernameNew = kpxcUI.createElement('p', 'username-new');
    const usernameExists = kpxcUI.createElement('p', 'username-exists');
    const chooseCreds = kpxcUI.createElement('p', '', {}, tr('rememberChooseCredentials'));
    const list = kpxcUI.createElement('ul', 'list-group', { 'id': 'list' });
    const spanNewUsername = kpxcUI.createElement('span', '', {}, tr('rememberNewUsername'));
    const spanUsernameExists = kpxcUI.createElement('span', '', {}, tr('rememberUsernameExists'));

    setDialogPosition(dialog);
    databaseText.appendChild(spanDatabaseText);

    const spanName = kpxcUI.createElement('span', 'strong', {}, databaseName);
    databaseText.append(spanName);

    usernameNew.appendChild(spanNewUsername);
    usernameExists.appendChild(spanUsernameExists);
    usernameNew.append(kpxcUI.createElement('span', 'strong'));
    usernameExists.append(kpxcUI.createElement('span', 'strong'));
    dialog.appendMultiple(databaseText, usernameNew, usernameExists, chooseCreds, list);
    initColorTheme(dialog);
    kpxcBanner.banner.appendChild(dialog);
};

kpxcBanner.createGroupDialog = function() {
    kpxcBanner.shadowSelector('#kpxc-banner-btn-new').hidden = true;
    kpxcBanner.shadowSelector('#kpxc-banner-btn-update').hidden = true;
    kpxcBanner.shadowSelector('.kpxc-checkbox').disabled = true;

    const dialog = kpxcUI.createElement('div', 'kpxc-banner-dialog');
    const chooseGroup = kpxcUI.createElement('p', '', {}, tr('rememberChooseGroup'));
    const list = kpxcUI.createElement('ul', 'list-group', { 'id': 'list' });

    setDialogPosition(dialog);
    dialog.appendMultiple(chooseGroup, list);
    kpxcBanner.banner.appendChild(dialog);
};

const setDialogPosition = function(dialog) {
    if (!dialog) {
        return;
    }

    if (kpxcBanner.banner.classList.contains('kpxc-banner-on-bottom')) {
        dialog.style.bottom = Pixels(kpxcBanner.banner.offsetHeight);
        dialog.classList.remove('kpxc-banner-dialog-top');
        dialog.classList.add('kpxc-banner-dialog-bottom');
    } else {
        dialog.style.top = Pixels(kpxcBanner.banner.offsetHeight);
        dialog.classList.remove('kpxc-banner-dialog-bottom');
        dialog.classList.add('kpxc-banner-dialog-top');
    }

    dialog.style.right = Pixels(0);
};
