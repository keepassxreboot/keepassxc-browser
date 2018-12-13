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

kpxcEvent.showStatus = async function(tab, configured) {
    let keyId = null;
    if (configured && keepass.databaseHash !== '') {
        keyId = keepass.keyRing[keepass.databaseHash].id;
    }

    browserAction.showDefault(tab);
    const errorMessage = page.tabs[tab.id].errorMessage;
    return {
        identifier: keyId,
        configured: configured,
        databaseClosed: keepass.isDatabaseClosed,
        keePassXCAvailable: keepass.isKeePassXCAvailable,
        encryptionKeyUnrecognized: keepass.isEncryptionKeyUnrecognized,
        associated: keepass.isAssociated(),
        error: errorMessage || null,
        usernameFieldDetected: page.usernameFieldDetected
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

kpxcEvent.onSaveSettings = async function(tab, args = []) {
    const [ settings ] = args;
    browser.storage.local.set({ 'settings': settings });
    kpxcEvent.onLoadSettings(tab);
    return Promise.resolve();
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
        return kpxcEvent.showStatus(tab, configured);
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

kpxcEvent.onPopStack = function(tab) {
    browserAction.stackPop(tab.id);
    browserAction.show(tab);
    return Promise.resolve();
};

kpxcEvent.onGetTabInformation = function(tab) {
    const id = tab.id || page.currentTabId;
    return Promise.resolve(page.tabs[id]);
};

kpxcEvent.onGetConnectedDatabase = function() {
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

    return Promise.resolve({ 'current': keepass.currentKeePassXC, 'latest': keepass.latestKeePassXC.version });
};

kpxcEvent.onCheckUpdateKeePassXC = async function() {
    keepass.checkForNewKeePassXCVersion();
    return { current: keepass.currentKeePassXC.version, latest: keepass.latestKeePassXC.version };
};

kpxcEvent.onUpdateAvailableKeePassXC = async function() {
    return (page.settings.checkUpdateKeePassXC > 0) ? keepass.keePassXCUpdateAvailable() : false;
};

kpxcEvent.onRemoveCredentialsFromTabInformation = function(tab) {
    const id = tab.id || page.currentTabId;
    page.clearCredentials(id);
    page.clearSubmittedCredentials();
    return Promise.resolve();
};

kpxcEvent.onLoginPopup = function(tab, logins) {
    const stackData = {
        level: 1,
        iconType: 'questionmark',
        popup: 'popup_login.html'
    };

    browserAction.stackUnshift(stackData, tab.id);

    if (logins.length > 0) {
        page.tabs[tab.id].loginList = logins[0];
    }

    browserAction.show(tab);
    return Promise.resolve();
};

kpxcEvent.initHttpAuth = function() {
    httpAuth.init();
    return Promise.resolve();
}

kpxcEvent.onHTTPAuthPopup = function(tab, data) {
    const stackData = {
        level: 1,
        iconType: 'questionmark',
        popup: 'popup_httpauth.html'
    };

    browserAction.stackUnshift(stackData, tab.id);
    page.tabs[tab.id].loginList = data;
    browserAction.show(tab);
    return Promise.resolve();
};

kpxcEvent.onMultipleFieldsPopup = function(tab) {
    const stackData = {
        level: 1,
        iconType: 'normal',
        popup: 'popup_multiple-fields.html'
    };

    browserAction.stackUnshift(stackData, tab.id);
    browserAction.show(tab);
    return Promise.resolve();
};

kpxcEvent.pageClearLogins = function(tab, alreadyCalled) {
    if (!alreadyCalled) {
        page.clearLogins(tab.id);
    }
    return Promise.resolve();
};

kpxcEvent.pageGetLoginId = function() {
    return Promise.resolve(page.loginId);
};

kpxcEvent.pageSetLoginId = function(tab, loginId) {
    page.loginId = loginId;
    return Promise.resolve();
};

kpxcEvent.pageClearSubmitted = function() {
    page.clearSubmittedCredentials();
    return Promise.resolve();
}

kpxcEvent.pageGetSubmitted = function() {
    return Promise.resolve(page.submittedCredentials);
};

kpxcEvent.pageSetSubmitted = function(tab, args = []) {
    const [ submitted, username, password, url, oldCredentials ] = args;
    page.setSubmittedCredentials(submitted, username, password, url, oldCredentials);
    return Promise.resolve();
};

kpxcEvent.onUsernameFieldDetected = function(tab, args = []) {
    page.usernameFieldDetected = args[0];
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
    'get_connected_database': kpxcEvent.onGetConnectedDatabase,
    'get_database_hash': keepass.getDatabaseHash,
    'get_database_groups': keepass.getDatabaseGroups,
    'get_keepassxc_versions': kpxcEvent.onGetKeePassXCVersions,
    'get_status': kpxcEvent.onGetStatus,
    'get_tab_information': kpxcEvent.onGetTabInformation,
    'init_http_auth': kpxcEvent.initHttpAuth,
    'is_connected': keepass.getIsKeePassXCAvailable,
    'load_keyring': kpxcEvent.onLoadKeyRing,
    'load_settings': kpxcEvent.onLoadSettings,
    'lock-database': kpxcEvent.lockDatabase,
    'page_clear_logins': kpxcEvent.pageClearLogins,
    'page_clear_submitted': kpxcEvent.pageClearSubmitted,
    'page_get_login_id': kpxcEvent.pageGetLoginId,
    'page_get_submitted': kpxcEvent.pageGetSubmitted,
    'page_set_login_id': kpxcEvent.pageSetLoginId,
    'page_set_submitted': kpxcEvent.pageSetSubmitted,
    'pop_stack': kpxcEvent.onPopStack,
    'popup_login': kpxcEvent.onLoginPopup,
    'popup_multiple-fields': kpxcEvent.onMultipleFieldsPopup,
    'reconnect': kpxcEvent.onReconnect,
    'remove_credentials_from_tab_information': kpxcEvent.onRemoveCredentialsFromTabInformation,
    'retrieve_credentials': keepass.retrieveCredentials,
    'show_default_browseraction': browserAction.showDefault,
    'update_credentials': keepass.updateCredentials,
    'username_field_detected': kpxcEvent.onUsernameFieldDetected,
    'save_settings': kpxcEvent.onSaveSettings,
    'update_available_keepassxc': kpxcEvent.onUpdateAvailableKeePassXC
};
