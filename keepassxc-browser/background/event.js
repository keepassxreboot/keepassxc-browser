'use strict';

const kpxcEvent = {};

kpxcEvent.onMessage = function(request, sender, callback) {
    if (request.action in kpxcEvent.messageHandlers) {
        //console.log('onMessage(' + request.action + ') for #' + sender.tab.id);
        if (!sender.hasOwnProperty('tab') || sender.tab.id < 1) {
            sender.tab = {};
            sender.tab.id = page.currentTabId;
        }

        kpxcEvent.invoke(kpxcEvent.messageHandlers[request.action], callback, sender.tab.id, request.args);

        // onMessage closes channel for callback automatically
        // if this method does not return true
        if (callback !== undefined) {
            return true;
        }
    }
};

/**
 * Get interesting information about the given tab.
 * Function adapted from AdBlock-Plus.
 *
 * @param {function} handler to call after invoke
 * @param {function} callback to call after handler or null
 * @param {integer} senderTabId
 * @param {array} args
 * @param {bool} secondTime
 * @returns null (asynchronous)
 */
kpxcEvent.invoke = function(handler, callback, senderTabId, args, secondTime) {
    if (senderTabId < 1) {
        return;
    }

    if (!page.tabs[senderTabId]) {
        page.createTabEntry(senderTabId);
    }

    // Remove information from no longer existing tabs
    page.removePageInformationFromNotExistingTabs();

    browser.tabs.get(senderTabId).then((tab) => {
        if (!tab) {
            return;
        }

        if (!tab.url) {
            // Issue 6877: tab URL is not set directly after you opened a window
            // using window.open()
            if (!secondTime) {
                window.setTimeout(function() {
                    kpxcEvent.invoke(handler, callback, senderTabId, args, true);
                }, 250);
            }
            return;
        }

        if (!page.tabs[tab.id]) {
            page.createTabEntry(tab.id);
        }

        args = args || [];

        args.unshift(tab);
        args.unshift(callback);

        if (handler) {
            handler.apply(this, args);
        } else {
            console.log('undefined handler for tab ' + tab.id);
        }
    }).catch((e) => {
        console.log(e);
    });
};

kpxcEvent.onShowNotification = function(callback, tab, message) {
    if (page.settings.showNotifications) {
        showNotification(message);
    }
};

kpxcEvent.showStatus = function(configured, tab, callback) {
    let keyId = null;
    if (configured && keepass.databaseHash !== '') {
        keyId = keepass.keyRing[keepass.databaseHash].id;
    }

    browserAction.showDefault(null, tab);
    const errorMessage = page.tabs[tab.id].errorMessage;
    callback({
        identifier: keyId,
        configured: configured,
        databaseClosed: keepass.isDatabaseClosed,
        keePassXCAvailable: keepass.isKeePassXCAvailable,
        encryptionKeyUnrecognized: keepass.isEncryptionKeyUnrecognized,
        associated: keepass.isAssociated(),
        error: errorMessage || null
    });
};

kpxcEvent.onLoadSettings = function(callback, tab) {
    page.initSettings().then((settings) => {
        callback(settings);
    }, (err) => {
        console.log('error loading settings: ' + err);
    });
};

kpxcEvent.onLoadKeyRing = function(callback, tab) {
    browser.storage.local.get({ 'keyRing': {} }).then(function(item) {
        keepass.keyRing = item.keyRing;
        if (keepass.isAssociated() && !keepass.keyRing[keepass.associated.hash]) {
            keepass.associated = {
                'value': false,
                'hash': null
            };
        }
        callback(item.keyRing);
    }, (err) => {
        console.log('error loading keyRing: ' + err);
    });
};

kpxcEvent.onSaveSettings = function(callback, tab, settings) {
    browser.storage.local.set({ 'settings': settings }).then(function() {
        kpxcEvent.onLoadSettings(callback, tab);
    });
};

kpxcEvent.onGetStatus = function(callback, tab, internalPoll = false, triggerUnlock = false) {
    // When internalPoll is true the event is triggered from content script in intervals -> don't poll KeePassXC
    if (!internalPoll) {
        keepass.testAssociation((response) => {
            if (!response) {
                kpxcEvent.showStatus(false, tab, callback);
                return;
            }

            keepass.isConfigured().then((configured) => {
                kpxcEvent.showStatus(configured, tab, callback);
            });
        }, tab, true, triggerUnlock);
    } else {
        keepass.isConfigured().then((configured) => {
            kpxcEvent.showStatus(configured, tab, callback);
        });
    }
};

kpxcEvent.onReconnect = async function(callback, tab) {
    const configured = await keepass.reconnect(callback, tab);
    if (configured) {
        browser.tabs.sendMessage(tab.id, {
            action: 'redetect_fields'
        }).catch((err) => {
            console.log(err);
        });
    }
    kpxcEvent.showStatus(configured, tab, callback);
};

kpxcEvent.lockDatabase = function(callback, tab) {
    keepass.lockDatabase(tab).then(() => {
        kpxcEvent.showStatus(true, tab, callback);
    });
};

kpxcEvent.onPopStack = function(callback, tab) {
    browserAction.stackPop(tab.id);
    browserAction.show(null, tab);
};

kpxcEvent.onGetTabInformation = function(callback, tab) {
    const id = tab.id || page.currentTabId;
    callback(page.tabs[id]);
};

kpxcEvent.onGetConnectedDatabase = function(callback, tab) {
    callback({
        count: Object.keys(keepass.keyRing).length,
        identifier: (keepass.keyRing[keepass.associated.hash]) ? keepass.keyRing[keepass.associated.hash].id : null
    });
};

kpxcEvent.onGetKeePassXCVersions = function(callback, tab) {
    if (keepass.currentKeePassXC === '') {
        keepass.getDatabaseHash((res) => {
            callback({ 'current': keepass.currentKeePassXC, 'latest': keepass.latestKeePassXC.version });
        }, tab);
    } else {
        callback({ 'current': keepass.currentKeePassXC, 'latest': keepass.latestKeePassXC.version });
    }
};

kpxcEvent.onCheckUpdateKeePassXC = function(callback, tab) {
    keepass.checkForNewKeePassXCVersion();
    callback({ current: keepass.currentKeePassXC.version, latest: keepass.latestKeePassXC.version });
};

kpxcEvent.onUpdateAvailableKeePassXC = function(callback, tab) {
    callback(page.settings.checkUpdateKeePassXC > 0 ? keepass.keePassXCUpdateAvailable() : false);
};

kpxcEvent.onRemoveCredentialsFromTabInformation = function(callback, tab) {
    const id = tab.id || page.currentTabId;
    page.clearCredentials(id);
};

kpxcEvent.onSetRememberPopup = function(callback, tab, username, password, url, usernameExists, credentialsList) {
    keepass.testAssociation((response) => {
        if (response) {
            keepass.isConfigured().then((configured) => {
                if (configured) {
                    browserAction.setRememberPopup(tab.id, username, password, url, usernameExists, credentialsList);
                }
            }).catch((e) => {
                console.log(e);
            });
        }
    }, tab);
};

kpxcEvent.onLoginPopup = function(callback, tab, logins) {
    const stackData = {
        level: 1,
        iconType: 'questionmark',
        popup: 'popup_login.html'
    };
    browserAction.stackUnshift(stackData, tab.id);
    page.tabs[tab.id].loginList = logins;
    browserAction.show(null, tab);
};

kpxcEvent.initHttpAuth = function(callback) {
    httpAuth.init();
    callback();
};

kpxcEvent.onHTTPAuthPopup = function(callback, tab, data) {
    const stackData = {
        level: 1,
        iconType: 'questionmark',
        popup: 'popup_httpauth.html'
    };
    browserAction.stackUnshift(stackData, tab.id);
    page.tabs[tab.id].loginList = data;
    browserAction.show(null, tab);
};

kpxcEvent.onMultipleFieldsPopup = function(callback, tab) {
    const stackData = {
        level: 1,
        iconType: 'normal',
        popup: 'popup_multiple-fields.html'
    };
    browserAction.stackUnshift(stackData, tab.id);
    browserAction.show(null, tab);
};

kpxcEvent.pageClearLogins = function(callback, tab, alreadyCalled) {
    if (!alreadyCalled) {
        page.clearLogins(tab.id);
    }
    callback();
};

kpxcEvent.pageGetLoginId = function(callback, tab) {
    callback(page.loginId);
};

kpxcEvent.pageSetLoginId = function(callback, tab, loginId) {
    page.loginId = loginId;
};

// All methods named in this object have to be declared BEFORE this!
kpxcEvent.messageHandlers = {
    'add_credentials': keepass.addCredentials,
    'associate': keepass.associate,
    'check_update_keepassxc': kpxcEvent.onCheckUpdateKeePassXC,
    'create_new_group': keepass.createNewGroup,
    'enable_automatic_reconnect': keepass.enableAutomaticReconnect,
    'disable_automatic_reconnect': keepass.disableAutomaticReconnect,
    'generate_password': keepass.generatePassword,
    'get_connected_database': kpxcEvent.onGetConnectedDatabase,
    'get_database_groups': keepass.getDatabaseGroups,
    'get_keepassxc_versions': kpxcEvent.onGetKeePassXCVersions,
    'get_status': kpxcEvent.onGetStatus,
    'get_tab_information': kpxcEvent.onGetTabInformation,
    'init_http_auth': kpxcEvent.initHttpAuth,
    'load_keyring': kpxcEvent.onLoadKeyRing,
    'load_settings': kpxcEvent.onLoadSettings,
    'lock-database': kpxcEvent.lockDatabase,
    'page_clear_logins': kpxcEvent.pageClearLogins,
    'page_get_login_id': kpxcEvent.pageGetLoginId,
    'page_set_login_id': kpxcEvent.pageSetLoginId,
    'pop_stack': kpxcEvent.onPopStack,
    'popup_login': kpxcEvent.onLoginPopup,
    'popup_multiple-fields': kpxcEvent.onMultipleFieldsPopup,
    'reconnect': kpxcEvent.onReconnect,
    'remove_credentials_from_tab_information': kpxcEvent.onRemoveCredentialsFromTabInformation,
    'retrieve_credentials': keepass.retrieveCredentials,
    'show_default_browseraction': browserAction.showDefault,
    'update_credentials': keepass.updateCredentials,
    'save_settings': kpxcEvent.onSaveSettings,
    'set_remember_credentials': kpxcEvent.onSetRememberPopup,
    'show_notification': kpxcEvent.onShowNotification,
    'stack_add': browserAction.stackAdd,
    'update_available_keepassxc': kpxcEvent.onUpdateAvailableKeePassXC
};
