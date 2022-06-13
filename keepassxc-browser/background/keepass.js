'use strict';

const keepass = {};
keepass.associated = { 'value': false, 'hash': null };
keepass.keyPair = { publicKey: null, secretKey: null };
keepass.serverPublicKey = '';
keepass.clientID = '';
keepass.isConnected = false;
keepass.isDatabaseClosed = true;
keepass.isKeePassXCAvailable = false;
keepass.isEncryptionKeyUnrecognized = false;
keepass.currentKeePassXC = '';
keepass.requiredKeePassXC = '2.3.1';
keepass.latestVersionUrl = 'https://api.github.com/repos/keepassxreboot/keepassxc/releases/latest';
keepass.cacheTimeout = 30 * 1000; // Milliseconds
keepass.databaseHash = '';
keepass.previousDatabaseHash = '';
keepass.keyId = 'keepassxc-browser-cryptokey-name';
keepass.keyBody = 'keepassxc-browser-key';
keepass.reconnectLoop = null;

const kpActions = {
    SET_LOGIN: 'set-login',
    GET_LOGINS: 'get-logins',
    GENERATE_PASSWORD: 'generate-password',
    ASSOCIATE: 'associate',
    TEST_ASSOCIATE: 'test-associate',
    GET_DATABASE_HASH: 'get-databasehash',
    CHANGE_PUBLIC_KEYS: 'change-public-keys',
    LOCK_DATABASE: 'lock-database',
    DATABASE_LOCKED: 'database-locked',
    DATABASE_UNLOCKED: 'database-unlocked',
    GET_DATABASE_GROUPS: 'get-database-groups',
    CREATE_NEW_GROUP: 'create-new-group',
    GET_TOTP: 'get-totp',
    REQUEST_AUTOTYPE: 'request-autotype'
};

browser.storage.local.get({ 'latestKeePassXC': { 'version': '', 'lastChecked': null }, 'keyRing': {} }).then((item) => {
    keepass.latestKeePassXC = item.latestKeePassXC;
    keepass.keyRing = item.keyRing;
});

//--------------------------------------------------------------------------
// Commands
//--------------------------------------------------------------------------

keepass.addCredentials = async function(tab, args = []) {
    const [ username, password, url, group, groupUuid ] = args;
    return keepass.updateCredentials(tab, [ null, username, password, url, group, groupUuid ]);
};

keepass.updateCredentials = async function(tab, args = []) {
    try {
        const [ entryId, username, password, url, group, groupUuid ] = args;
        const taResponse = await keepass.testAssociation(tab);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        const kpAction = kpActions.SET_LOGIN;
        const [ dbid ] = keepass.getCryptoKey();
        const nonce = keepassClient.getNonce();

        const messageData = {
            action: kpAction,
            id: dbid,
            login: username,
            password: password,
            url: url,
            submitUrl: url
        };

        if (entryId) {
            messageData.uuid = entryId;
        }

        if (!entryId && page.settings.downloadFaviconAfterSave) {
            messageData.downloadFavicon = 'true';
        }

        if (group && groupUuid) {
            messageData.group = group;
            messageData.groupUuid = groupUuid;
        }

        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
        if (response) {
            // KeePassXC versions lower than 2.5.0 will have an empty parsed.error
            let successMessage = response.error;
            if (response.error === 'success' || response.error === '') {
                successMessage = entryId ? 'updated' : 'created';
            }

            return successMessage;
        } else {
            return 'error';
        }
    } catch (err) {
        logError(`updateCredentials failed: ${err}`);
        return [];
    }
};

keepass.retrieveCredentials = async function(tab, args = []) {
    try {
        const [ url, submiturl, triggerUnlock = false, httpAuth = false ] = args;
        const taResponse = await keepass.testAssociation(tab, [ false, triggerUnlock ]);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        if (tab && page.tabs[tab.id]) {
            page.tabs[tab.id].errorMessage = null;
        }

        if (!keepass.isConnected) {
            return [];
        }

        let entries = [];
        const keys = [];
        const kpAction = kpActions.GET_LOGINS;
        const nonce = keepassClient.getNonce();
        const [ dbid ] = keepass.getCryptoKey();

        for (const keyHash in keepass.keyRing) {
            keys.push({
                id: keepass.keyRing[keyHash].id,
                key: keepass.keyRing[keyHash].key
            });
        }

        const messageData = {
            action: kpAction,
            id: dbid,
            url: url,
            keys: keys
        };

        if (submiturl) {
            messageData.submitUrl = submiturl;
        }

        if (httpAuth) {
            messageData.httpAuth = 'true';
        }

        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
        if (response) {
            entries = removeDuplicateEntries(response.entries);
            keepass.updateLastUsed(keepass.databaseHash);

            if (entries.length === 0) {
                // Questionmark-icon is not triggered, so we have to trigger for the normal symbol
                browserAction.showDefault(tab);
            }

            logDebug(`Found ${entries.length} entries for url ${url}`);
            return entries;
        }

        browserAction.showDefault(tab);
        return [];
    } catch (err) {
        logError(`retrieveCredentials failed: ${err}`);
        return [];
    }
};

keepass.generatePassword = async function(tab) {
    if (!keepass.isConnected) {
        return [];
    }

    try {
        const taResponse = await keepass.testAssociation(tab);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        if (!keepass.compareVersion(keepass.requiredKeePassXC, keepass.currentKeePassXC)) {
            return [];
        }

        let password;
        const kpAction = kpActions.GENERATE_PASSWORD;
        const nonce = keepassClient.getNonce();

        const messageData = {
            action: kpAction,
            nonce: nonce,
            clientID: keepass.clientID,
            requestID: keepassClient.getRequestId()
        };

        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
        if (response) {
            password = response.entries ?? response.password;
            keepass.updateLastUsed(keepass.databaseHash);
        } else {
            logError('generatePassword rejected');
        }

        return password;
    } catch (err) {
        logError(`generatePassword failed: ${err}`);
        return [];
    }
};

keepass.associate = async function(tab) {
    if (keepass.isAssociated()) {
        return AssociatedAction.ASSOCIATED;
    }

    try {
        await keepass.getDatabaseHash(tab);
        if (keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
            return AssociatedAction.NOT_ASSOCIATED;
        }

        if (tab && page.tabs[tab.id]) {
            page.tabs[tab.id].errorMessage = null;
        }

        const kpAction = kpActions.ASSOCIATE;
        const key = nacl.util.encodeBase64(keepass.keyPair.publicKey);
        const nonce = keepassClient.getNonce();
        const idKeyPair = nacl.box.keyPair();
        const idKey = nacl.util.encodeBase64(idKeyPair.publicKey);

        const messageData = {
            action: kpAction,
            key: key,
            idKey: idKey
        };

        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce, false, true);
        if (response) {
            // Use public key as identification key with older KeePassXC releases
            const savedKey = keepass.compareVersion('2.3.4', keepass.currentKeePassXC) ? idKey : key;
            keepass.setCryptoKey(response.id, savedKey); // Save the new identification public key as id key for the database
            keepass.associated.value = true;
            keepass.associated.hash = response.hash || 0;

            browserAction.show(tab);
            return AssociatedAction.NEW_ASSOCIATION;
        }

        keepass.handleError(tab, kpErrors.ASSOCIATION_FAILED);
        return AssociatedAction.NOT_ASSOCIATED;
    } catch (err) {
        logError(`associate failed: ${err}`);
    }

    return AssociatedAction.NOT_ASSOCIATED;
};

keepass.testAssociation = async function(tab, args = []) {
    if (tab && page.tabs[tab.id]) {
        page.tabs[tab.id].errorMessage = null;
    }

    try {
        const [ enableTimeout = false, triggerUnlock = false ] = args;
        const dbHash = await keepass.getDatabaseHash(tab, [ enableTimeout, triggerUnlock ]);
        if (!dbHash) {
            return false;
        }

        if (keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
            return false;
        }

        if (keepass.isAssociated()) {
            return true;
        }

        if (!keepass.serverPublicKey) {
            if (tab && page.tabs[tab.id]) {
                keepass.handleError(tab, kpErrors.PUBLIC_KEY_NOT_FOUND);
            }
            return false;
        }

        const kpAction = kpActions.TEST_ASSOCIATE;
        const nonce = keepassClient.getNonce();
        const [ dbid, dbkey ] = keepass.getCryptoKey();

        if (dbkey === null || dbid === null) {
            if (tab && page.tabs[tab.id]) {
                keepass.handleError(tab, kpErrors.NO_SAVED_DATABASES_FOUND);
            }
            return false;
        }

        const messageData = {
            action: kpAction,
            id: dbid,
            key: dbkey
        };

        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce, enableTimeout);
        if (!response) {
            const hash = response.hash || 0;
            keepass.deleteKey(hash);
            keepass.isEncryptionKeyUnrecognized = true;
            keepass.handleError(tab, kpErrors.ENCRYPTION_KEY_UNRECOGNIZED);
            keepass.associated.value = false;
            keepass.associated.hash = null;
        } else if (!keepass.isAssociated()) {
            keepass.handleError(tab, kpErrors.ASSOCIATION_FAILED);
        } else {
            keepass.isEncryptionKeyUnrecognized = false;
            if (tab && page.tabs[tab.id]) {
                delete page.tabs[tab.id].errorMessage;
            }
        }

        return keepass.isAssociated();
    } catch (err) {
        logError(`testAssociation failed: ${err}`);
        return false;
    }
};

keepass.getDatabaseHash = async function(tab, args = []) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return '';
    }

    if (!keepass.serverPublicKey) {
        keepass.changePublicKeys(tab);
    }

    const [ enableTimeout = false, triggerUnlock = false ] = args;
    const kpAction = kpActions.GET_DATABASE_HASH;
    const [ nonce, incrementedNonce ] = keepassClient.getNonces();

    const messageData = {
        action: kpAction,
        connectedKeys: Object.keys(keepass.keyRing) // This will be removed in the future
    };

    const encrypted = keepassClient.encrypt(messageData, nonce);
    if (encrypted.length <= 0) {
        keepass.handleError(tab, kpErrors.PUBLIC_KEY_NOT_FOUND);
        keepass.updateDatabaseHashToContent();
        return keepass.databaseHash;
    }

    try {
        const request = keepassClient.buildRequest(kpAction, keepassClient.encrypt(messageData, nonce), nonce, keepass.clientID, triggerUnlock);
        const response = await keepassClient.sendNativeMessage(request, enableTimeout);
        if (response.message && response.nonce) {
            const res = keepassClient.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return '';
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);
            if (keepassClient.verifyDatabaseResponse(parsed, incrementedNonce) && parsed.hash) {
                const oldDatabaseHash = keepass.databaseHash;
                keepass.setcurrentKeePassXCVersion(parsed.version);
                keepass.databaseHash = parsed.hash || '';

                if (oldDatabaseHash && oldDatabaseHash !== keepass.databaseHash) {
                    keepass.associated.value = false;
                    keepass.associated.hash = null;
                }

                keepass.isDatabaseClosed = false;
                keepass.isKeePassXCAvailable = true;

                // Update the databaseHash from legacy hash
                if (parsed.oldHash) {
                    keepass.updateDatabaseHash(parsed.oldHash, parsed.hash);
                }

                return parsed.hash;
            } else if (parsed.errorCode) {
                keepass.databaseHash = '';
                keepass.isDatabaseClosed = true;
                keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
                return keepass.databaseHash;
            }

            return keepass.databaseHash;
        }

        keepass.databaseHash = '';
        keepass.isDatabaseClosed = true;
        if (response.message && response.message === '') {
            keepass.isKeePassXCAvailable = false;
            keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        } else {
            keepass.handleError(tab, response.errorCode, response.error);
        }
        return keepass.databaseHash;
    } catch (err) {
        logError(`getDatabaseHash failed: ${err}`);
        return keepass.databaseHash;
    }
};

keepass.changePublicKeys = async function(tab, enableTimeout = false, connectionTimeout) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const kpAction = kpActions.CHANGE_PUBLIC_KEYS;
    const key = nacl.util.encodeBase64(keepass.keyPair.publicKey);
    const [ nonce, incrementedNonce ] = keepassClient.getNonces();
    keepass.clientID = nacl.util.encodeBase64(nacl.randomBytes(keepassClient.keySize));

    const request = {
        action: kpAction,
        publicKey: key,
        nonce: nonce,
        clientID: keepass.clientID
    };

    try {
        const response = await keepassClient.sendNativeMessage(request, enableTimeout, connectionTimeout);
        keepass.setcurrentKeePassXCVersion(response.version);

        if (!keepassClient.verifyKeyResponse(response, key, incrementedNonce)) {
            if (tab && page.tabs[tab.id]) {
                keepass.handleError(tab, kpErrors.KEY_CHANGE_FAILED);
            }

            keepass.updateDatabaseHashToContent();
            return false;
        }

        keepass.isKeePassXCAvailable = true;
        console.log(`${EXTENSION_NAME}: Server public key: ${nacl.util.encodeBase64(keepass.serverPublicKey)}`);
        return true;
    } catch (err) {
        logError(`changePublicKeys failed: ${err}`);
        return false;
    }
};

keepass.lockDatabase = async function(tab) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const kpAction = kpActions.LOCK_DATABASE;
    const nonce = keepassClient.getNonce();

    const messageData = {
        action: kpAction
    };


    try {
        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
        if (response) {
            keepass.isDatabaseClosed = true;
            keepass.updateDatabase();

            // Display error message in the popup
            keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
            return true;
        } else {
            keepass.isDatabaseClosed = true;
        }

        return false;
    } catch (err) {
        logError(`ockDatabase failed: ${err}`);
        return false;
    }
};

keepass.getDatabaseGroups = async function(tab) {
    try {
        const taResponse = await keepass.testAssociation(tab, [ false ]);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        if (tab && page.tabs[tab.id]) {
            page.tabs[tab.id].errorMessage = null;
        }

        if (!keepass.isConnected) {
            return [];
        }

        let groups = [];
        const kpAction = kpActions.GET_DATABASE_GROUPS;
        const nonce = keepassClient.getNonce();

        const messageData = {
            action: kpAction
        };

        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
        if (response) {
            groups = response.groups;
            groups.defaultGroup = page.settings.defaultGroup;
            groups.defaultGroupAlwaysAsk = page.settings.defaultGroupAlwaysAsk;
            keepass.updateLastUsed(keepass.databaseHash);
            return groups;
        }

        browserAction.showDefault(tab);
        return [];
    } catch (err) {
        logError(`getDatabaseGroups failed: ${err}`);
        return [];
    }
};

keepass.createNewGroup = async function(tab, args = []) {
    try {
        const [ groupName ] = args;
        const taResponse = await keepass.testAssociation(tab, [ false ]);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        if (tab && page.tabs[tab.id]) {
            page.tabs[tab.id].errorMessage = null;
        }

        if (!keepass.isConnected) {
            return [];
        }

        const kpAction = kpActions.CREATE_NEW_GROUP;
        const nonce = keepassClient.getNonce();

        const messageData = {
            action: kpAction,
            groupName: groupName
        };

        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
        if (response) {
            keepass.updateLastUsed(keepass.databaseHash);
            return response;
        } else {
            logError(`getDatabaseGroups rejected`);
        }

        browserAction.showDefault(tab);
        return [];
    } catch (err) {
        logError(`createNewGroup failed: ${err}`);
        return [];
    }
};

keepass.getTotp = async function(tab, args = []) {
    const [ uuid, oldTotp ] = args;
    if (!keepass.compareVersion('2.6.1', keepass.currentKeePassXC, true)) {
        return oldTotp;
    }

    const taResponse = await keepass.testAssociation(tab, [ false ]);
    if (!taResponse || !keepass.isConnected) {
        return;
    }

    const kpAction = kpActions.GET_TOTP;
    const nonce = keepassClient.getNonce();

    const messageData = {
        action: kpAction,
        uuid: uuid
    };

    try {
        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
        if (response) {
            keepass.updateLastUsed(keepass.databaseHash);
            return response.totp;
        }

        return;
    } catch (err) {
        logError(`getTotp failed: ${err}`);
    }
};

keepass.requestAutotype = async function(tab, args = []) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const kpAction = kpActions.REQUEST_AUTOTYPE;
    const nonce = keepassClient.getNonce();
    const search = getTopLevelDomainFromUrl(args[0]);

    const messageData = {
        action: kpAction,
        search: search
    };

    try {
        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
        return response;
    } catch (err) {
        logError(`requestAutotype failed: ${err}`);
        return false;
    }
};

//--------------------------------------------------------------------------
// Keyring
//--------------------------------------------------------------------------

keepass.migrateKeyRing = function() {
    return new Promise((resolve, reject) => {
        browser.storage.local.get('keyRing').then((item) => {
            const keyring = item.keyRing;
            // Change dates to numbers, for compatibilty with Chromium based browsers
            if (keyring) {
                let num = 0;
                for (const keyHash in keyring) {
                    const key = keyring[keyHash];
                    [ 'created', 'lastUsed' ].forEach((fld) => {
                        const v = key[fld];
                        if (v instanceof Date && v.valueOf() >= 0) {
                            key[fld] = v.valueOf();
                            num++;
                        } else if (typeof v !== 'number') {
                            key[fld] = Date.now().valueOf();
                            num++;
                        }
                    });
                }
                if (num > 0) {
                    browser.storage.local.set({ keyRing: keyring });
                }
            }
            resolve();
        });
    });
};

keepass.saveKey = function(hash, id, key) {
    if (!(hash in keepass.keyRing)) {
        keepass.keyRing[hash] = {
            id: id,
            key: key,
            hash: hash,
            created: new Date().valueOf(),
            lastUsed: new Date().valueOf()
        };
    } else {
        keepass.keyRing[hash].id = id;
        keepass.keyRing[hash].key = key;
        keepass.keyRing[hash].hash = hash;
        keepass.keyRing[hash].created = new Date().valueOf();
        keepass.keyRing[hash].lastUsed = new Date().valueOf();
    }
    browser.storage.local.set({ 'keyRing': keepass.keyRing });
};

keepass.updateLastUsed = function(hash) {
    if ((hash in keepass.keyRing)) {
        keepass.keyRing[hash].lastUsed = new Date().valueOf();
        browser.storage.local.set({ 'keyRing': keepass.keyRing });
    }
};

// Update the databaseHash from legacy hash
keepass.updateDatabaseHash = function(oldHash, newHash) {
    if (!oldHash || !newHash || oldHash === newHash) {
        return;
    }

    if ((oldHash in keepass.keyRing)) {
        keepass.keyRing[newHash] = keepass.keyRing[oldHash];
        keepass.keyRing[newHash].hash = newHash;
        delete keepass.keyRing[oldHash];
        browser.storage.local.set({ 'keyRing': keepass.keyRing });
    }
};

keepass.deleteKey = function(hash) {
    delete keepass.keyRing[hash];
    browser.storage.local.set({ 'keyRing': keepass.keyRing });
};

keepass.getCryptoKey = function() {
    let dbkey = null;
    let dbid = null;
    if (!(keepass.databaseHash in keepass.keyRing)) {
        return [ dbid, dbkey ];
    }

    dbid = keepass.keyRing[keepass.databaseHash].id;

    if (dbid) {
        dbkey = keepass.keyRing[keepass.databaseHash].key;
    }

    return [ dbid, dbkey ];
};

keepass.setCryptoKey = function(id, key) {
    keepass.saveKey(keepass.databaseHash, id, key);
};

//--------------------------------------------------------------------------
// Connection
//--------------------------------------------------------------------------

keepass.enableAutomaticReconnect = function() {
    // Disable for Windows if KeePassXC is older than 2.3.4
    if (!page.settings.autoReconnect
        || (navigator.platform.toLowerCase().includes('win')
            && keepass.currentKeePassXC
            && !keepass.compareVersion('2.3.4', keepass.currentKeePassXC))) {
        return;
    }

    if (keepass.reconnectLoop === null) {
        keepass.reconnectLoop = setInterval(async () => {
            if (!keepass.isKeePassXCAvailable) {
                keepass.reconnect();
            }
        }, 1000);
    }
};

keepass.disableAutomaticReconnect = function() {
    clearInterval(keepass.reconnectLoop);
    keepass.reconnectLoop = null;
};

keepass.reconnect = async function(tab, connectionTimeout) {
    keepassClient.connectToNative();
    keepass.generateNewKeyPair();
    const keyChangeResult = await keepass.changePublicKeys(tab, true, connectionTimeout).catch((e) => {
        return false;
    });

    // Change public keys timeout
    if (!keyChangeResult) {
        return false;
    }

    const hash = await keepass.getDatabaseHash(tab);
    if (hash !== '' && tab && page.tabs[tab.id]) {
        delete page.tabs[tab.id].errorMessage;
    }

    await keepass.testAssociation();
    await keepass.isConfigured();
    keepass.updateDatabaseHashToContent();
    return true;
};

//--------------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------------

keepass.generateNewKeyPair = function() {
    keepass.keyPair = nacl.box.keyPair();
};

keepass.isConfigured = async function() {
    if (typeof(keepass.databaseHash) === 'undefined') {
        const hash = keepass.getDatabaseHash();
        return hash in keepass.keyRing;
    }

    return keepass.databaseHash in keepass.keyRing;
};

keepass.checkDatabaseHash = async function(tab) {
    return keepass.databaseHash;
};

keepass.isAssociated = function() {
    return (keepass.associated.value && keepass.associated.hash && keepass.associated.hash === keepass.databaseHash);
};

keepass.setcurrentKeePassXCVersion = function(version) {
    if (version) {
        keepass.currentKeePassXC = version;
    }
};

keepass.keePassXCUpdateAvailable = function() {
    if (page.settings.checkUpdateKeePassXC && page.settings.checkUpdateKeePassXC != CHECK_UPDATE_NEVER) {
        const lastChecked = (keepass.latestKeePassXC.lastChecked) ? new Date(keepass.latestKeePassXC.lastChecked) : new Date(1986, 11, 21);
        const daysSinceLastCheck = Math.floor(((new Date()).getTime() - lastChecked.getTime()) / 86400000);
        if (daysSinceLastCheck >= page.settings.checkUpdateKeePassXC) {
            keepass.checkForNewKeePassXCVersion();
        }

        return keepass.compareVersion(keepass.currentKeePassXC, keepass.latestKeePassXC.version, false);
    }

    return false;
};

keepass.checkForNewKeePassXCVersion = function() {
    const xhr = new XMLHttpRequest();
    let version = -1;

    xhr.onload = function(e) {
        if (xhr.readyState === 4 && xhr.status === 200) {
            const json = JSON.parse(xhr.responseText);
            if (json.tag_name && json.prerelease === false) {
                version = json.tag_name;
                keepass.latestKeePassXC.version = version;
            }
        }

        if (version !== -1) {
            browser.storage.local.set({ 'latestKeePassXC': keepass.latestKeePassXC });
        }
    };

    xhr.onerror = function(err) {
        logError(`checkForNewKeePassXCVersion error: ${err}`);
    };

    try {
        xhr.open('GET', keepass.latestVersionUrl, true);
        xhr.send();
    } catch (ex) {
        logError(ex);
    }
    keepass.latestKeePassXC.lastChecked = new Date().valueOf();
};

keepass.handleError = function(tab, errorCode, errorMessage = '') {
    if (errorMessage.length === 0) {
        errorMessage = kpErrors.getError(errorCode);
    }

    logError(`${errorCode}: ${errorMessage}`);
    if (tab && page.tabs[tab.id]) {
        page.tabs[tab.id].errorMessage = errorMessage;
    }
};

keepass.updatePopup = function(iconType) {
    if (page && page.tabs.length > 0) {
        browserAction.updateIcon(undefined, iconType);
    }
};

// Updates the database hashes to content script
keepass.updateDatabase = async function() {
    keepass.associated.value = false;
    keepass.associated.hash = null;
    page.clearAllLogins();

    await keepass.testAssociation(null, [ true ]);
    const configured = await keepass.isConfigured();

    keepass.updatePopup(configured ? 'normal' : 'locked');
    keepass.updateDatabaseHashToContent();
};

keepass.updateDatabaseHashToContent = async function() {
    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length) {
            // Send message to content script
            browser.tabs.sendMessage(tabs[0].id, {
                action: 'check_database_hash',
                hash: { old: keepass.previousDatabaseHash, new: keepass.databaseHash },
                connected: keepass.isKeePassXCAvailable
            }).catch((err) => {
                logError(`No content script available for this tab.`);
            });
            keepass.previousDatabaseHash = keepass.databaseHash;
        }
    } catch (err) {
        logError(`updateDatabaseHashToContent failed: ${err}`);
    }
};

keepass.compareVersion = function(minimum, current, canBeEqual = true) {
    if (!minimum || !current) {
        return false;
    }

    // Handle beta/snapshot builds as stable version
    const snapshot = '-snapshot';
    const beta = '-beta';
    if (current.endsWith(snapshot)) {
        current = current.slice(0, -snapshot.length);
    }

    if (current.endsWith(beta)) {
        current = current.slice(0, -beta.length);
    }

    const min = minimum.split('.', 3).map(s => s.padStart(4, '0')).join('.');
    const cur = current.split('.', 3).map(s => s.padStart(4, '0')).join('.');
    return (canBeEqual ? (min <= cur) : (min < cur));
};

const removeDuplicateEntries = function(arr) {
    const newArray = [];

    for (const a of arr) {
        if (newArray.some(i => i.uuid === a.uuid)) {
            continue;
        }

        newArray.push(a);
    }

    return newArray;
};
