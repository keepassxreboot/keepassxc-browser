'use strict';

const keepass = {};
keepass.associated = { value: false, hash: null };
keepass.databaseAssociationStatuses = {};
keepass.databaseStatuses = [];
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
keepass.databaseHash = ''; // Hash of the active database
keepass.previousDatabaseHash = '';
keepass.reconnectLoop = null;
keepass.protocolV2 = false;

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
    REQUEST_AUTOTYPE: 'request-autotype',
    // Protocol V2
    CREATE_CREDENTIALS: 'create-credentials',
    GET_CREDENTIALS: 'get-credentials',
    GET_DATABASE_STATUSES: 'get-database-statuses'
};

const kpErrors = {
    UNKNOWN_ERROR: 0,
    DATABASE_NOT_OPENED: 1,
    DATABASE_HASH_NOT_RECEIVED: 2,
    CLIENT_PUBLIC_KEY_NOT_RECEIVED: 3,
    CANNOT_DECRYPT_MESSAGE: 4,
    TIMEOUT_OR_NOT_CONNECTED: 5,
    ACTION_CANCELLED_OR_DENIED: 6,
    PUBLIC_KEY_NOT_FOUND: 7,
    ASSOCIATION_FAILED: 8,
    KEY_CHANGE_FAILED: 9,
    ENCRYPTION_KEY_UNRECOGNIZED: 10,
    NO_SAVED_DATABASES_FOUND: 11,
    INCORRECT_ACTION: 12,
    EMPTY_MESSAGE_RECEIVED: 13,
    NO_URL_PROVIDED: 14,
    NO_LOGINS_FOUND: 15,

    errorMessages: {
        0: { msg: tr('errorMessageUnknown') },
        1: { msg: tr('errorMessageDatabaseNotOpened') },
        2: { msg: tr('errorMessageDatabaseHash') },
        3: { msg: tr('errorMessageClientPublicKey') },
        4: { msg: tr('errorMessageDecrypt') },
        5: { msg: tr('errorMessageTimeout') },
        6: { msg: tr('errorMessageCanceled') },
        7: { msg: tr('errorMessageEncrypt') },
        8: { msg: tr('errorMessageAssociate') },
        9: { msg: tr('errorMessageKeyExchange') },
        10: { msg: tr('errorMessageEncryptionKey') },
        11: { msg: tr('errorMessageSavedDatabases') },
        12: { msg: tr('errorMessageIncorrectAction') },
        13: { msg: tr('errorMessageEmptyMessage') },
        14: { msg: tr('errorMessageNoURL') },
        15: { msg: tr('errorMessageNoLogins') }
    },

    getError(errorCode) {
        return this.errorMessages[errorCode].msg;
    }
};


browser.storage.local.get({ 'latestKeePassXC': { 'version': '', 'lastChecked': null }, 'keyRing': {} }).then((item) => {
    keepass.latestKeePassXC = item.latestKeePassXC;
    keepass.keyRing = item.keyRing;
});

//--------------------------------------------------------------------------
// Command wrappers for events
//--------------------------------------------------------------------------

keepass.associate = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.associate(tab, args) : await keepassProtocol.associate(tab, args);
};

keepass.createCredentials = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.createCredentials(tab, args) : await keepassProtocol.addCredentials(tab, args);
};

keepass.createNewGroup = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.createNewGroup(tab, args) : await keepassProtocol.createNewGroup(tab, args);
};

keepass.generatePassword = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.generatePassword(tab, args) : await keepassProtocol.generatePassword(tab, args);
};

keepass.getCredentials = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.getCredentials(tab, args) : await keepassProtocol.retrieveCredentials(tab, args);
};

keepass.getDatabaseGroups = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.getDatabaseGroups(tab, args) : await keepassProtocol.getDatabaseGroups(tab, args);
};

keepass.getDatabaseHash = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.getDatabaseStatuses(tab, args) : await keepassProtocol.getDatabaseHash(tab, args);
};

keepass.getTotp = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.getTotp(tab, args) : await keepassProtocol.getTotp(tab, args);
};

keepass.lockDatabase = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.lockDatabase(tab, args) : await keepassProtocol.lockDatabase(tab, args);
};

keepass.requestAutotype = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.requestAutotype(tab, args) : await keepassProtocol.requestAutotype(tab, args);
};

keepass.updateCredentials = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.updateCredentials(tab, args) : await keepassProtocol.updateCredentials(tab, args);
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
    if (!Object.hasOwn(keepass.keyRing, hash)) {
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
    if (Object.hasOwn(keepass.keyRing, hash)) {
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

// Returns keys for the current active database
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

keepass.enableAutomaticReconnect = async function() {
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
    protocolClient.connectToNative();
    protocolClient.generateNewKeyPair();
    const keyChangeResult = await protocol.changePublicKeys(tab, true, connectionTimeout).catch(() => false);

    // Change public keys timeout
    if (!keyChangeResult) {
        return false;
    }

    if (!keepass.protocolV2) {
        // Needed?
        const hash = await keepass.getDatabaseHash(tab);
        if (hash !== '') {
            keepass.clearErrorMessage(tab);
        }

        await keepassProtocol.testAssociation();
        await keepass.isConfigured();
    }

    // TODO: What to do with Protocol V2?
    keepass.updateDatabaseHashToContent();
    return true;
};

//--------------------------------------------------------------------------
// Error handling
//--------------------------------------------------------------------------

keepass.clearErrorMessage = function(tab) {
    if (tab && page.tabs[tab.id]) {
        page.tabs[tab.id].errorMessage = undefined;
    }
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

//--------------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------------

keepass.isConfigured = async function() {
    if (typeof(keepass.databaseHash) === 'undefined') {
        const hash = keepass.getDatabaseHash();
        return Object.hasOwn(keepass.keyRing, hash);
    }

    return keepass.databaseHash in keepass.keyRing;
};

keepass.checkDatabaseHash = async function() {
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
    const checkUpdate = Number(page.settings.checkUpdateKeePassXC);
    if (checkUpdate !== CHECK_UPDATE_NEVER) {
        const lastChecked = (keepass.latestKeePassXC.lastChecked) ? new Date(keepass.latestKeePassXC.lastChecked) : new Date(1986, 11, 21);
        const daysSinceLastCheck = Math.floor(((new Date()).getTime() - lastChecked.getTime()) / 86400000);
        if (daysSinceLastCheck >= checkUpdate) {
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

keepass.updatePopup = function() {
    if (page && page.tabs.length > 0) {
        browserAction.showDefault();
    }
};

// Updates the database hashes to content script
keepass.updateDatabase = async function() {
    keepass.associated.value = false;
    keepass.associated.hash = null;
    page.clearAllLogins();

    if (keepass.protocolV2) {
        // TODO: Only show "Connect" if the active database is not connected?
        // TODO: What if there are credentials from another database but the selected one is not connected?
        const result = await protocol.testAssociationFromDatabaseStatuses();
        keepass.updatePopup();
        keepass.updateDatabaseHashToContent(result);
        return;
    }

    // Legacy protocol
    await keepassProtocol.testAssociation(null, [ true ]);
    keepass.updatePopup();
    keepass.updateDatabaseHashToContent();
};

keepass.updateDatabaseHashToContent = async function(associateResult = {}) {
    try {
        const tab = await getCurrentTab();
        if (tab) {
            // Send message to content script
            browser.tabs.sendMessage(tab.id, {
                action: 'check_database_hash',
                associateResult: associateResult,
                hash: { old: keepass.previousDatabaseHash, new: keepass.databaseHash },
                connected: keepass.isKeePassXCAvailable
            }).catch((err) => {
                logError('No content script available for this tab.');
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

keepass.removeDuplicateEntries = function(arr) {
    const newArray = [];

    for (const a of arr) {
        if (newArray.some(i => i.uuid === a.uuid)) {
            continue;
        }

        newArray.push(a);
    }

    return newArray;
};
