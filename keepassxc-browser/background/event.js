'use strict';

const kpxcEvent = {};

kpxcEvent.onMessage = async function(request, sender) {
    if (request.action in kpxcEvent.messageHandlers) {
        if (!Object.hasOwn(sender, 'tab') || sender.tab.id < 1) {
            sender.tab = {};
            sender.tab.id = page.currentTabId;
        }

        return await kpxcEvent.messageHandlers[request.action](sender.tab, request.args);
    }
};

kpxcEvent.showStatus = async function(tab, configured, internalPoll) {
    let keyId = null;
    if (configured && keepass.databaseHash !== ''
        && Object.hasOwn(keepass.keyRing, keepass.databaseHash)) {
        keyId = keepass.keyRing[keepass.databaseHash].id;
    }

    if (!internalPoll) {
        browserAction.showDefault(tab);
    }

    const errorMessage = page.tabs[tab.id]?.errorMessage ?? undefined;
    const usernameFieldDetected = page.tabs[tab.id]?.usernameFieldDetected ?? false;
    const iframeDetected = page.tabs[tab.id]?.iframeDetected ?? false;

    return {
        associated: keepass.isAssociated(),

        configured: configured,
        databaseClosed: keepass.isDatabaseClosed,
        encryptionKeyUnrecognized: keepass.isEncryptionKeyUnrecognized,
        error: errorMessage,
        iframeDetected: iframeDetected,
        identifier: keyId,
        keePassXCAvailable: keepass.isKeePassXCAvailable,
        showGettingStartedGuideAlert: page.settings.showGettingStartedGuideAlert,
        showTroubleshootingGuideAlert: page.settings.showTroubleshootingGuideAlert,
        usernameFieldDetected: usernameFieldDetected
    };
};

kpxcEvent.onLoadSettings = async function() {
    return await page.initSettings().catch((err) => {
        logError('onLoadSettings error: ' + err);
        return Promise.reject();
    });
};

kpxcEvent.onLoadKeyRing = async function() {
    const item = await browser.storage.local.get({ 'keyRing': {} }).catch((err) => {
        logError('kpxcEvent.onLoadKeyRing error: ' + err);
        return Promise.reject();
    });

    keepass.keyRing = item.keyRing;
    if (keepass.isAssociated() && !keepass.keyRing[keepass.associated.hash]) {
        keepass.associated = {
            value: false,
            hash: null
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
        logError('No status shown: ' + err);
        return Promise.reject();
    }
};

kpxcEvent.onReconnect = async function(tab) {
    const configured = await keepass.reconnect(tab);
    if (configured) {
        browser.tabs.sendMessage(tab?.id, {
            action: 'redetect_fields'
        }).catch((err) => {
            logError(err);
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
        logError('kpxcEvent.lockDatabase error: ' + err);
        return false;
    }
};

kpxcEvent.onGetTabInformation = async function(tab) {
    const id = tab?.id || page.currentTabId;
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
    await keepass.checkForNewKeePassXCVersion();
    return { current: keepass.currentKeePassXC, latest: keepass.latestKeePassXC.version };
};

kpxcEvent.onUpdateAvailableKeePassXC = async function() {
    return (Number(page.settings.checkUpdateKeePassXC) !== CHECK_UPDATE_NEVER) ? await keepass.keePassXCUpdateAvailable() : false;
};

kpxcEvent.onRemoveCredentialsFromTabInformation = async function(tab) {
    const id = tab?.id || page.currentTabId;
    page.clearCredentials(id);
    page.clearSubmittedCredentials();
};

kpxcEvent.onLoginPopup = async function(tab, logins) {
    const popupData = {
        iconType: 'normal',
        popup: 'popup_login'
    };

    page.tabs[tab.id].loginList = logins;
    await browserAction.show(tab, popupData);
};

kpxcEvent.initHttpAuth = async function() {
    httpAuth.init();
};

kpxcEvent.onHTTPAuthPopup = async function(tab, data) {
    const popupData = {
        iconType: 'normal',
        popup: 'popup_httpauth'
    };

    page.tabs[tab.id].loginList = data;
    await browserAction.show(tab, popupData);
};

kpxcEvent.onUsernameFieldDetected = async function(tab, detected) {
    page.tabs[tab.id].usernameFieldDetected = detected;
};

kpxcEvent.onIframeDetected = async function(tab, detected) {
    page.tabs[tab.id].iframeDetected = detected;
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

kpxcEvent.compareVersion = async function(tab, args = []) {
    return keepass.compareVersion(args[0], args[1]);
};

kpxcEvent.getIsKeePassXCAvailable = async function() {
    return keepass.isKeePassXCAvailable;
};

kpxcEvent.hideGettingStartedGuideAlert = async function(tab) {
    const settings = await kpxcEvent.onLoadSettings();
    settings.showGettingStartedGuideAlert = false;

    await kpxcEvent.onSaveSettings(tab, settings);
};

kpxcEvent.hideTroubleshootingGuideAlert = async function(tab) {
    const settings = await kpxcEvent.onLoadSettings();
    settings.showTroubleshootingGuideAlert = false;

    await kpxcEvent.onSaveSettings(tab, settings);
};

// Bounce message back to all frames
kpxcEvent.sendBackToTabs = async function(tab, args = []) {
    await browser.tabs.sendMessage(tab.id, { action: 'frame_message', args: args });
};

// All methods named in this object have to be declared BEFORE this!
kpxcEvent.messageHandlers = {
    'add_credentials': keepass.addCredentials,
    'associate': keepass.associate,
    'check_database_hash': keepass.checkDatabaseHash,
    'check_update_keepassxc': kpxcEvent.onCheckUpdateKeePassXC,
    'compare_version': kpxcEvent.compareVersion,
    'create_new_group': keepass.createNewGroup,
    'enable_automatic_reconnect': keepass.enableAutomaticReconnect,
    'disable_automatic_reconnect': keepass.disableAutomaticReconnect,
    'fill_http_auth': page.fillHttpAuth,
    'frame_message': kpxcEvent.sendBackToTabs,
    'generate_password': keepass.generatePassword,
    'get_color_theme': kpxcEvent.getColorTheme,
    'get_connected_database': kpxcEvent.onGetConnectedDatabase,
    'get_database_hash': keepass.getDatabaseHash,
    'get_database_groups': keepass.getDatabaseGroups,
    'get_error_message': keepass.getErrorMessage,
    'get_keepassxc_versions': kpxcEvent.onGetKeePassXCVersions,
    'get_login_list': page.getLoginList,
    'get_status': kpxcEvent.onGetStatus,
    'get_tab_information': kpxcEvent.onGetTabInformation,
    'get_totp': keepass.getTotp,
    'hide_getting_started_guide_alert': kpxcEvent.hideGettingStartedGuideAlert,
    'hide_troubleshooting_guide_alert': kpxcEvent.hideTroubleshootingGuideAlert,
    'iframe_detected': kpxcEvent.onIframeDetected,
    'init_http_auth': kpxcEvent.initHttpAuth,
    'is_connected': kpxcEvent.getIsKeePassXCAvailable,
    'is_iframe_allowed': page.isIframeAllowed,
    'load_keyring': kpxcEvent.onLoadKeyRing,
    'load_settings': kpxcEvent.onLoadSettings,
    'lock_database': kpxcEvent.lockDatabase,
    'page_clear_logins': kpxcEvent.pageClearLogins,
    'page_clear_submitted': page.clearSubmittedCredentials,
    'page_get_autosubmit_performed': page.getAutoSubmitPerformed,
    'page_get_login_id': page.getLoginId,
    'page_get_manual_fill': page.getManualFill,
    'page_get_redirect_count': kpxcEvent.pageGetRedirectCount,
    'page_get_submitted': page.getSubmitted,
    'page_set_allow_iframes': page.setAllowIframes,
    'page_set_autosubmit_performed': page.setAutoSubmitPerformed,
    'page_set_login_id': page.setLoginId,
    'page_set_manual_fill': page.setManualFill,
    'page_set_submitted': page.setSubmitted,
    'passkeys_get': keepass.passkeysGet,
    'passkeys_register': keepass.passkeysRegister,
    'password_get_filled': kpxcEvent.passwordGetFilled,
    'password_set_filled': kpxcEvent.passwordSetFilled,
    'popup_login': kpxcEvent.onLoginPopup,
    'reconnect': kpxcEvent.onReconnect,
    'remove_credentials_from_tab_information': kpxcEvent.onRemoveCredentialsFromTabInformation,
    'request_autotype': keepass.requestAutotype,
    'retrieve_credentials': page.retrieveCredentials,
    'show_default_browseraction': browserAction.showDefault,
    'update_credentials': keepass.updateCredentials,
    'username_field_detected': kpxcEvent.onUsernameFieldDetected,
    'save_settings': kpxcEvent.onSaveSettings,
    'update_available_keepassxc': kpxcEvent.onUpdateAvailableKeePassXC,
    'update_context_menu': page.updateContextMenu,
    'update_popup': page.updatePopup
};
