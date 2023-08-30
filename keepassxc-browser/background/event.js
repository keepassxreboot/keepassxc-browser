'use strict';

const kpxcEvent = {};

kpxcEvent.checkUpdateKeePassXC = async function() {
    keepass.checkForNewKeePassXCVersion();
    return { current: keepass.currentKeePassXC.version, latest: keepass.latestKeePassXC.version };
};

kpxcEvent.compareVersion = async function(tab, args = []) {
    return keepass.compareVersion(args[0], args[1]);
};

kpxcEvent.getColorTheme = async function(tab) {
    return page.settings.colorTheme;
};

kpxcEvent.getConnectedDatabase = async function() {
    return Promise.resolve({
        count: Object.keys(keepass.keyRing).length,
        identifier: (keepass.keyRing[keepass.associated.hash]) ? keepass.keyRing[keepass.associated.hash].id : null
    });
};

kpxcEvent.getIsKeePassXCAvailable = async function() {
    return keepass.isKeePassXCAvailable;
};

kpxcEvent.getKeePassXCVersions = async function(tab) {
    return { 'current': keepass.currentKeePassXC, 'latest': keepass.latestKeePassXC.version };
};

kpxcEvent.getStatus = async function(tab, args = []) {
    // When internalPoll is true the event is triggered from content script in intervals -> don't poll KeePassXC
    try {
        const [ internalPoll = false, triggerUnlock = false ] = args;
        let configured = false;

        if (keepass.protocolV2) {
            configured = internalPoll
                       ? keepass.databaseAssociationStatuses?.isAnyAssociated
                       : await protocol.testAssociationFromDatabaseStatuses(tab, [ true, triggerUnlock ])?.isAnyAssociated;
            return kpxcEvent.showStatus(tab, configured, internalPoll);
        }

        // Protocol V1
        if (!internalPoll) {
            const response = await keepassProtocol.testAssociation(tab, [ true, triggerUnlock ]);
            if (!response) {
                return kpxcEvent.showStatus(tab, false);
            }
        }

        configured = await keepass.isConfigured();
        return kpxcEvent.showStatus(tab, configured, internalPoll);
    } catch (err) {
        logError('No status shown: ' + err);
        return Promise.reject();
    }
};

kpxcEvent.getTabInformation = async function(tab) {
    const id = tab?.id || page.currentTabId;
    return page.tabs[id];
};

kpxcEvent.hideGettingStartedGuideAlert = async function(tab) {
    const settings = await kpxcEvent.loadSettings();
    settings.showGettingStartedGuideAlert = false;

    await kpxcEvent.saveSettings(tab, settings);
};

kpxcEvent.hideTroubleshootingGuideAlert = async function(tab) {
    const settings = await kpxcEvent.loadSettings();
    settings.showTroubleshootingGuideAlert = false;

    await kpxcEvent.saveSettings(tab, settings);
};

kpxcEvent.initHttpAuth = async function() {
    httpAuth.init();
};

kpxcEvent.initHttpAuthPopup = async function(tab, data) {
    const popupData = {
        iconType: 'questionmark',
        popup: 'popup_httpauth'
    };

    page.tabs[tab.id].loginList = data;
    browserAction.show(tab, popupData);
};

kpxcEvent.initLoginPopup = async function(tab, logins) {
    const popupData = {
        iconType: 'questionmark',
        popup: 'popup_login'
    };

    page.tabs[tab.id].loginList = logins;
    browserAction.show(tab, popupData);
};

kpxcEvent.isProtocolV2 = async function(tab) {
    return keepass.protocolV2;
};

kpxcEvent.loadKeyRing = async function() {
    const item = await browser.storage.local.get({ 'keyRing': {} }).catch((err) => {
        logError('kpxcEvent.loadKeyRing error: ' + err);
        return Promise.reject();
    });

    keepass.keyRing = item.keyRing;
    // TODO: What to do here?
    if (keepass.isAssociated() && !keepass.keyRing[keepass.associated.hash]) {
        keepass.associated = {
            value: false,
            hash: null
        };
    }

    return item.keyRing;
};

kpxcEvent.loadSettings = async function() {
    return await page.initSettings().catch((err) => {
        logError('loadSettings error: ' + err);
        return Promise.reject();
    });
};

kpxcEvent.lockDatabase = async function(tab, args) {
    try {
        await keepass.lockDatabase(tab, args);
        return kpxcEvent.getStatus(tab);
    } catch (err) {
        logError('kpxcEvent.lockDatabase error: ' + err);
        return false;
    }
};

// Message handler
kpxcEvent.onMessage = async function(request, sender) {
    if (request.action in kpxcEvent.messageHandlers) {
        if (!Object.hasOwn(sender, 'tab') || sender.tab.id < 1) {
            sender.tab = {};
            sender.tab.id = page.currentTabId;
        }

        return await kpxcEvent.messageHandlers[request.action](sender.tab, request.args);
    }
};

kpxcEvent.pageClearLogins = async function(tab, alreadyCalled) {
    if (!alreadyCalled) {
        page.clearLogins(tab.id);
    }
};

kpxcEvent.pageGetRedirectCount = async function() {
    return page.redirectCount;
};

kpxcEvent.passwordGetFilled = async function() {
    return page.passwordFilled;
};

kpxcEvent.passwordSetFilled = async function(tab, state) {
    page.passwordFilled = state;
};

kpxcEvent.reconnect = async function(tab) {
    const configured = await keepass.reconnect(tab);
    if (configured) {
        browser.tabs.sendMessage(tab.id, {
            action: 'redetect_fields'
        }).catch((err) => {
            logError(err);
            return;
        });
    }

    return kpxcEvent.showStatus(tab, configured);
};

kpxcEvent.removeCredentialsFromTabInformation = async function(tab) {
    const id = tab?.id || page.currentTabId;
    page.clearCredentials(id);
    page.clearSubmittedCredentials();
};

kpxcEvent.saveSettings = async function(tab, settings) {
    browser.storage.local.set({ 'settings': settings });
    kpxcEvent.loadSettings(tab);
};

// Bounce message back to all frames
kpxcEvent.sendBackToTabs = async function(tab, args = []) {
    await browser.tabs.sendMessage(tab.id, { action: 'frame_message', args: args });
};

kpxcEvent.showStatus = async function(tab, configured, internalPoll) {
    let keyId = null;
    if (configured && keepass.databaseHash !== '' && keepass.keyRing[keepass.databaseHash]) {
        keyId = keepass.keyRing[keepass.databaseHash].id;
    }

    if (!internalPoll) {
        browserAction.showDefault(tab);
    }

    const errorMessage = page.tabs[tab.id]?.errorMessage ?? undefined;
    const usernameFieldDetected = page.tabs[tab.id]?.usernameFieldDetected ?? false;

    return {
        associated: keepass.isAssociated(),
        configured: configured,
        databaseClosed: keepass.isDatabaseClosed,
        databaseAssociationStatuses: keepass.databaseAssociationStatuses,
        encryptionKeyUnrecognized: keepass.isEncryptionKeyUnrecognized,
        error: errorMessage || null,
        identifier: keyId,
        keePassXCAvailable: keepass.isKeePassXCAvailable,
        protocolV2: keepass.protocolV2,
        showGettingStartedGuideAlert: page.settings.showGettingStartedGuideAlert,
        showTroubleshootingGuideAlert: page.settings.showTroubleshootingGuideAlert,
        usernameFieldDetected: usernameFieldDetected
    };
};

kpxcEvent.updateAvailableKeePassXC = async function() {
    return (Number(page.settings.checkUpdateKeePassXC) !== CHECK_UPDATE_NEVER) ? keepass.keePassXCUpdateAvailable() : false;
};

kpxcEvent.usernameFieldDetected = async function(tab, detected) {
    page.tabs[tab.id].usernameFieldDetected = detected;
};

// All methods named in this object have to be declared BEFORE this!
kpxcEvent.messageHandlers = {
    'associate': keepass.associate,
    'check_database_hash': keepass.checkDatabaseHash,
    'check_update_keepassxc': kpxcEvent.checkUpdateKeePassXC,
    'compare_version': kpxcEvent.compareVersion,
    'create_credentials': keepass.createCredentials,
    'create_new_group': keepass.createNewGroup,
    'enable_automatic_reconnect': keepass.enableAutomaticReconnect,
    'disable_automatic_reconnect': keepass.disableAutomaticReconnect,
    'fill_http_auth': page.fillHttpAuth,
    'frame_message': kpxcEvent.sendBackToTabs,
    'generate_password': keepass.generatePassword,
    'get_color_theme': kpxcEvent.getColorTheme,
    'get_connected_database': kpxcEvent.getConnectedDatabase,
    'get_database_hash': keepass.getDatabaseHash, // TODO ?
    'get_database_groups': keepass.getDatabaseGroups,
    'get_keepassxc_versions': kpxcEvent.getKeePassXCVersions,
    'get_login_list': page.getLoginList,
    'get_status': kpxcEvent.getStatus,
    'get_tab_information': kpxcEvent.getTabInformation,
    'get_totp': keepass.getTotp,
    'hide_getting_started_guide_alert': kpxcEvent.hideGettingStartedGuideAlert,
    'hide_troubleshooting_guide_alert': kpxcEvent.hideTroubleshootingGuideAlert,
    'init_http_auth': kpxcEvent.initHttpAuth,
    'is_connected': kpxcEvent.getIsKeePassXCAvailable,
    'is_protocol_v2': kpxcEvent.isProtocolV2,
    'load_keyring': kpxcEvent.loadKeyRing,
    'load_settings': kpxcEvent.loadSettings,
    'lock_database': kpxcEvent.lockDatabase,
    'page_clear_auto_lock_requested': page.clearAutoLockRequested,
    'page_clear_logins': kpxcEvent.pageClearLogins,
    'page_clear_submitted': page.clearSubmittedCredentials,
    'page_get_autosubmit_performed': page.getAutoSubmitPerformed,
    'page_get_auto_lock_requested': page.getAutoLockRequested,
    'page_get_login_id': page.getLoginId,
    'page_get_manual_fill': page.getManualFill,
    'page_get_redirect_count': kpxcEvent.pageGetRedirectCount,
    'page_get_submitted': page.getSubmitted,
    'page_set_autosubmit_performed': page.setAutoSubmitPerformed,
    'page_set_login_id': page.setLoginId,
    'page_set_manual_fill': page.setManualFill,
    'page_set_submitted': page.setSubmitted,
    'password_get_filled': kpxcEvent.passwordGetFilled,
    'password_set_filled': kpxcEvent.passwordSetFilled,
    'popup_login': kpxcEvent.initLoginPopup,
    'reconnect': kpxcEvent.reconnect,
    'remove_credentials_from_tab_information': kpxcEvent.removeCredentialsFromTabInformation,
    'request_autotype': keepass.requestAutotype,
    'retrieve_credentials': page.retrieveCredentials,
    'show_default_browseraction': browserAction.showDefault,
    'update_credentials': keepass.updateCredentials,
    'username_field_detected': kpxcEvent.usernameFieldDetected,
    'save_settings': kpxcEvent.saveSettings,
    'update_available_keepassxc': kpxcEvent.updateAvailableKeePassXC,
    'update_context_menu': page.updateContextMenu,
    'update_popup': page.updatePopup
};
