'use strict';

const kpxcEvent = {};

kpxcEvent.onMessage = async function(request, sender) {
    if (request.action in kpxcEvent.messageHandlers) {
        if (!sender.hasOwnProperty('tab') || sender.tab.id < 1) {
            sender.tab = {};
            sender.tab.id = page.currentTabId;
        }

        return await kpxcEvent.messageHandlers[request.action](sender.tab, request.args);
    }
};

kpxcEvent.showStatus = async function(tab, configured, internalPoll) {
    let keyId = null;
    if (configured && keepass.databaseHash !== '') {
        keyId = keepass.keyRing[keepass.databaseHash].id;
    }

    if (!internalPoll) {
        browserAction.showDefault(tab);
    }

    const errorMessage = page.tabs[tab.id].errorMessage;
    return {
        identifier: keyId,
        configured: configured,
        databaseClosed: keepass.isDatabaseClosed,
        keePassXCAvailable: keepass.isKeePassXCAvailable,
        encryptionKeyUnrecognized: keepass.isEncryptionKeyUnrecognized,
        associated: keepass.isAssociated(),
        error: errorMessage || null,
        usernameFieldDetected: page.tabs[tab.id].usernameFieldDetected
    };
};

kpxcEvent.onLoadSettings = async function() {
    return await page.initSettings().catch((err) => {
        console.log('onLoadSettings error: ' + err);
        return Promise.reject();
    });
};

kpxcEvent.onLoadKeyRing = async function() {
    const item = await browser.storage.local.get({ 'keyRing': {} }).catch((err) => {
        console.log('kpxcEvent.onLoadKeyRing error: ' + err);
        return Promise.reject();
    });

    keepass.keyRing = item.keyRing;
    if (keepass.isAssociated() && !keepass.keyRing[keepass.associated.hash]) {
        keepass.associated = {
            'value': false,
            'hash': null
        };
    }

    return item.keyRing;
};

kpxcEvent.onSaveSettings = async function(tab, settings) {
    browser.storage.local.set({ 'settings': settings });
    kpxcEvent.onLoadSettings(tab);
};

kpxcEvent.onGetStatus = async function(tab, args = []) {
    // When internalPoll is true the event is triggered from content script in intervals -> don't poll KeePassXC
    try {
        const [ internalPoll = false, triggerUnlock = false ] = args;
        if (!internalPoll) {
            const response = await keepass.testAssociation(tab, [ true, triggerUnlock ]);
            if (!response) {
                return kpxcEvent.showStatus(tab, false);
            }
        }

        const configured = await keepass.isConfigured();
        return kpxcEvent.showStatus(tab, configured, internalPoll);
    } catch (err) {
        console.log('Error: No status shown: ' + err);
        return Promise.reject();
    }
};

kpxcEvent.onReconnect = async function(tab) {
    const configured = await keepass.reconnect(tab);
    if (configured) {
        browser.tabs.sendMessage(tab.id, {
            action: 'redetect_fields'
        }).catch((err) => {
            console.log(err);
            return;
        });
    }

    return kpxcEvent.showStatus(tab, configured);
};

kpxcEvent.lockDatabase = async function(tab) {
    try {
        await keepass.lockDatabase(tab);
        return kpxcEvent.showStatus(tab, false);
    } catch (err) {
        console.log('kpxcEvent.lockDatabase error: ' + err);
        return false;
    }
};

kpxcEvent.onGetTabInformation = async function(tab) {
    const id = tab.id || page.currentTabId;
    return page.tabs[id];
};

kpxcEvent.onGetConnectedDatabase = async function() {
    return Promise.resolve({
        count: Object.keys(keepass.keyRing).length,
        identifier: (keepass.keyRing[keepass.associated.hash]) ? keepass.keyRing[keepass.associated.hash].id : null
    });
};

kpxcEvent.onGetKeePassXCVersions = async function(tab) {
    if (keepass.currentKeePassXC === '') {
        await keepass.getDatabaseHash(tab);
        return { 'current': keepass.currentKeePassXC, 'latest': keepass.latestKeePassXC.version };
    }

    return { 'current': keepass.currentKeePassXC, 'latest': keepass.latestKeePassXC.version };
};

kpxcEvent.onCheckUpdateKeePassXC = async function() {
    keepass.checkForNewKeePassXCVersion();
    return { current: keepass.currentKeePassXC.version, latest: keepass.latestKeePassXC.version };
};

kpxcEvent.onUpdateAvailableKeePassXC = async function() {
    return (page.settings.checkUpdateKeePassXC > 0) ? keepass.keePassXCUpdateAvailable() : false;
};

kpxcEvent.onRemoveCredentialsFromTabInformation = async function(tab) {
    const id = tab.id || page.currentTabId;
    page.clearCredentials(id);
    page.clearSubmittedCredentials();
};

kpxcEvent.onLoginPopup = async function(tab, logins) {
    const popupData = {
        iconType: 'questionmark',
        popup: 'popup_login'
    };

    page.tabs[tab.id].loginList = logins;
    browserAction.show(tab, popupData);
};

kpxcEvent.initHttpAuth = async function() {
    httpAuth.init();
};

kpxcEvent.onHTTPAuthPopup = async function(tab, data) {
    const popupData = {
        iconType: 'questionmark',
        popup: 'popup_httpauth'
    };

    page.tabs[tab.id].loginList = data;
    browserAction.show(tab, popupData);
};

kpxcEvent.onUsernameFieldDetected = async function(tab, detected) {
    page.tabs[tab.id].usernameFieldDetected = detected;
};

kpxcEvent.passwordGetFilled = async function() {
    return page.passwordFilled;
};

kpxcEvent.passwordSetFilled = async function(tab, state) {
    page.passwordFilled = state;
};

kpxcEvent.getColorTheme = async function(tab) {
    return page.settings.colorTheme;
};

kpxcEvent.pageGetRedirectCount = async function() {
    return page.redirectCount;
};

kpxcEvent.pageClearLogins = async function(tab, alreadyCalled) {
    if (!alreadyCalled) {
        page.clearLogins(tab.id);
    }
};

// All methods named in this object have to be declared BEFORE this!
kpxcEvent.messageHandlers = {
    'add_credentials': keepass.addCredentials,
    'associate': keepass.associate,
    'check_database_hash': keepass.checkDatabaseHash,
    'check_update_keepassxc': kpxcEvent.onCheckUpdateKeePassXC,
    'create_new_group': keepass.createNewGroup,
    'enable_automatic_reconnect': keepass.enableAutomaticReconnect,
    'disable_automatic_reconnect': keepass.disableAutomaticReconnect,
    'generate_password': keepass.generatePassword,
    'get_color_theme': kpxcEvent.getColorTheme,
    'get_connected_database': kpxcEvent.onGetConnectedDatabase,
    'get_database_hash': keepass.getDatabaseHash,
    'get_database_groups': keepass.getDatabaseGroups,
    'get_keepassxc_versions': kpxcEvent.onGetKeePassXCVersions,
    'get_status': kpxcEvent.onGetStatus,
    'get_tab_information': kpxcEvent.onGetTabInformation,
    'get_totp': keepass.getTotp,
    'init_http_auth': kpxcEvent.initHttpAuth,
    'is_connected': keepass.getIsKeePassXCAvailable,
    'load_keyring': kpxcEvent.onLoadKeyRing,
    'load_settings': kpxcEvent.onLoadSettings,
    'lock_database': kpxcEvent.lockDatabase,
    'page_clear_logins': kpxcEvent.pageClearLogins,
    'page_clear_submitted': page.clearSubmittedCredentials,
    'page_get_login_id': page.getLoginId,
    'page_get_manual_fill': page.getManualFill,
    'page_get_redirect_count': kpxcEvent.pageGetRedirectCount,
    'page_get_submitted': page.getSubmitted,
    'page_set_login_id': page.setLoginId,
    'page_set_manual_fill': page.setManualFill,
    'page_set_submitted': page.setSubmitted,
    'password_get_filled': kpxcEvent.passwordGetFilled,
    'password_set_filled': kpxcEvent.passwordSetFilled,
    'popup_login': kpxcEvent.onLoginPopup,
    'reconnect': kpxcEvent.onReconnect,
    'remove_credentials_from_tab_information': kpxcEvent.onRemoveCredentialsFromTabInformation,
    'retrieve_credentials': page.retrieveCredentials,
    'show_default_browseraction': browserAction.showDefault,
    'update_credentials': keepass.updateCredentials,
    'username_field_detected': kpxcEvent.onUsernameFieldDetected,
    'save_settings': kpxcEvent.onSaveSettings,
    'update_available_keepassxc': kpxcEvent.onUpdateAvailableKeePassXC,
    'update_context_menu': page.updateContextMenu
};
