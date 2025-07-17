'use strict';

const keepass = {};
keepass.associated = { 'value': false, 'hash': null };
keepass.featuresList = {
    downloadFaviconAfterSave: false,
    newTotp: false,
    passwordGenerator: false,
    passkeys: false,
    passkeysDefaultGroup: false,
    requiredKeePassXCVersionFound: false,
};
keepass.cacheTimeout = 30 * 1000; // Milliseconds
keepass.clientID = '';
keepass.currentKeePassXC = '';
keepass.databaseHash = '';
keepass.isConnected = false;
keepass.isDatabaseClosed = true;
keepass.isEncryptionKeyUnrecognized = false;
keepass.isKeePassXCAvailable = false;
keepass.keyPair = { publicKey: null, secretKey: null };
keepass.latestVersionUrl = 'https://api.github.com/repos/keepassxreboot/keepassxc/releases/latest';
keepass.previousDatabaseHash = '';
keepass.protocolV2 = false;
keepass.reconnectLoop = null;
keepass.requiredKeePassXC = '2.8.0';
keepass.serverPublicKey = '';

const DEFAULT_FETCH_TIMEOUT = 5000; // ms
const MAX_RELATED_ORIGIN_LABELS = 60;

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
    PASSKEYS_REGISTER: 'passkeys-register',
    PASSKEYS_GET: 'passkeys-get',
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
    NO_GROUPS_FOUND: 16,
    CANNOT_CREATE_NEW_GROUP: 17,
    NO_VALID_UUID_PROVIDED: 18,
    ACCESS_TO_ALL_ENTRIES_DENIED: 19,
    PASSKEYS_ATTESTATION_NOT_SUPPORTED: 20,
    PASSKEYS_CREDENTIAL_IS_EXCLUDED: 21,
    PASSKEYS_REQUEST_CANCELED: 22,
    PASSKEYS_INVALID_USER_VERIFICATION: 23,
    PASSKEYS_EMPTY_PUBLIC_KEY: 24,
    PASSKEYS_INVALID_URL_PROVIDED: 25,
    PASSKEYS_ORIGIN_NOT_ALLOWED: 26,
    PASSKEYS_DOMAIN_IS_NOT_VALID: 27,
    PASSKEYS_DOMAIN_RPID_MISMATCH: 28,
    PASSKEYS_NO_SUPPORTED_ALGORITHMS: 29,
    PASSKEYS_WAIT_FOR_LIFETIMER: 30,
    PASSKEYS_UNKNOWN_ERROR: 31,
    PASSKEYS_INVALID_CHALLENGE: 32,
    PASSKEYS_INVALID_USER_ID: 33,
    ACTION_TIMEOUT: 34,

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
        15: { msg: tr('errorMessageNoLogins') },
        16: { msg: tr('errorMessageNoGroupsFound') },
        17: { msg: tr('errorMessageCannotCreateNewGroup') },
        18: { msg: tr('errorMessageNoValidUuidProvided') },
        19: { msg: tr('errorMessageAccessToAllEntriesDenied') },
        20: { msg: tr('errorMessagePasskeysAttestationNotSupported') },
        21: { msg: tr('errorMessagePasskeysCredentialIsExcluded') },
        22: { msg: tr('errorMessagePasskeysRequestCanceled') },
        23: { msg: tr('errorMessagePasskeysInvalidUserVerification') },
        24: { msg: tr('errorMessagePasskeysEmptyPublicKey') },
        25: { msg: tr('errorMessagePasskeysInvalidUrlProvided') },
        26: { msg: tr('errorMessagePasskeysOriginNotAllowed') },
        27: { msg: tr('errorMessagePasskeysDomainNotValid') },
        28: { msg: tr('errorMessagePasskeysDomainRpIdMismatch') },
        29: { msg: tr('errorMessagePasskeysNoSupportedAlgorithms') },
        30: { msg: tr('errorMessagePasskeysWaitforLifeTimer') },
        31: { msg: tr('errorMessagePasskeysUnknownError') },
        32: { msg: tr('errorMessagePasskeysInvalidChallenge') },
        33: { msg: tr('errorMessagePasskeysInvalidUserId') },
        34: { msg: tr('errorActionTimeout') },
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
    return keepass.protocolV2
        ? await protocol.createCredentials(tab, args)
        : await keepassProtocol.addCredentials(tab, args);
};

keepass.createNewGroup = async function(tab, args = []) {
    return keepass.protocolV2
        ? await protocol.createNewGroup(tab, args)
        : await keepassProtocol.createNewGroup(tab, args);
};

keepass.generatePassword = async function(tab, args = []) {
    return keepass.protocolV2
        ? await protocol.generatePassword(tab, args)
        : await keepassProtocol.generatePassword(tab, args);
};

keepass.getCredentials = async function(tab, args = []) {
    return keepass.protocolV2
        ? await protocol.getCredentials(tab, args)
        : await keepassProtocol.retrieveCredentials(tab, args);
};

keepass.getDatabaseGroups = async function(tab, args = []) {
    return keepass.protocolV2
        ? await protocol.getDatabaseGroups(tab, args)
        : await keepassProtocol.getDatabaseGroups(tab, args);
};

keepass.getDatabaseHash = async function(tab, args = []) {
    return keepass.protocolV2
        ? await protocol.getDatabaseStatuses(tab, args)
        : await keepassProtocol.getDatabaseHash(tab, args);
};

keepass.getTotp = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.getTotp(tab, args) : await keepassProtocol.getTotp(tab, args);
};

keepass.lockDatabase = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.lockDatabase(tab, args) : await keepassProtocol.lockDatabase(tab, args);
};

keepass.passkeysGet = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.passkeysGet(tab, args) : await keepassProtocol.passkeysGet(tab, args);
};

keepass.passkeysRegister = async function(tab, args = []) {
    return keepass.protocolV2 ? await protocol.passkeysGet(tab, args) : await keepassProtocol.passkeysGet(tab, args);
};

keepass.requestAutotype = async function (tab, args = []) {
    return keepass.protocolV2
        ? await protocol.requestAutotype(tab, args)
        : await keepassProtocol.requestAutotype(tab, args);
};

keepass.updateCredentials = async function (tab, args = []) {
    return keepass.protocolV2
        ? await protocol.updateCredentials(tab, args)
        : await keepassProtocol.updateCredentials(tab, args);
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

keepass.getCryptoKeys = function() {
    const keys = [];

    for (const keyHash in keepass.keyRing) {
        keys.push({
            id: keepass.keyRing[keyHash].id,
            key: keepass.keyRing[keyHash].key
        });
    }

    return keys;
};

//--------------------------------------------------------------------------
// Connection
//--------------------------------------------------------------------------

keepass.enableAutomaticReconnect = async function() {
    // Disable for Windows if KeePassXC is older than 2.3.4
    if (!page.settings.autoReconnect) {
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

keepass.reconnect = async function(tab = null, connectionTimeout = 1500) {
    protocolClient.connectToNative();
    protocolClient.generateNewKeyPair();

    const keyChangeResult = await protocol
        .changePublicKeys(tab, !!connectionTimeout, connectionTimeout)
        .catch(() => false);

    // Change public keys timeout
    if (!keyChangeResult) {
        return false;
    }

    if (!keepass.protocolV2) {
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

keepass.getErrorMessage = async function(tab, errorCode) {
    return kpErrors.getError(errorCode);
};

keepass.generateNewKeyPair = function() {
    keepass.keyPair = nacl.box.keyPair();
};

keepass.isConfigured = async function() {
    if (typeof(keepass.databaseHash) === 'undefined') {
        const hash = keepass.getDatabaseHash();
        return Object.hasOwn(keepass.keyRing, hash);
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

keepass.keePassXCUpdateAvailable = async function() {
    const checkUpdate = Number(page.settings.checkUpdateKeePassXC);
    if (checkUpdate !== CHECK_UPDATE_NEVER) {
        const lastChecked = keepass.latestKeePassXC.lastChecked
            ? new Date(keepass.latestKeePassXC.lastChecked)
            : new Date(1986, 11, 21);
        const daysSinceLastCheck = Math.floor(((new Date()).getTime() - lastChecked.getTime()) / 86400000);
        if (daysSinceLastCheck >= checkUpdate) {
            await keepass.checkForNewKeePassXCVersion();
        }

        return compareVersion(keepass.currentKeePassXC, keepass.latestKeePassXC.version, false);
    }

    return false;
};

keepass.checkForNewKeePassXCVersion = async function() {
    let version = -1;

    try {
        const response = await fetch(keepass.latestVersionUrl, { signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT) });
        const jsonData = await response.json();
        if (jsonData?.tag_name && jsonData?.prerelease === false) {
            version = jsonData.tag_name;
            keepass.latestKeePassXC.version = version;
        }
    } catch (ex) {
        logError(`checkForNewKeePassXCVersion error: ${ex}`);
    }
    keepass.latestKeePassXC.lastChecked = new Date().valueOf();
};

// Implements retrieval of Related Origin Requests for passkeys
// https://www.w3.org/TR/webauthn-3/#sctn-related-origins
keepass.getPasskeysRelatedOrigins = async function(rpId) {
    if (!rpId) {
        return [];
    }

    try {
        const response = await fetch(`https://${rpId}/.well-known/webauthn`, {
            signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT),
        });

        // Basic reply validation, see: https://www.w3.org/TR/webauthn-3/#sctn-validating-relation-origin
        const isJson = response?.headers?.get('content-type')?.includes('application/json');
        if (!isJson) {
            logError('getRelatedOrigins error: Content-Type is not JSON');
            return [];
        }

        const jsonData = await response.json();
        if (!Array.isArray(jsonData?.origins)
            || jsonData?.origins?.length === 0
            || jsonData?.origins?.length > MAX_RELATED_ORIGIN_LABELS
            || !jsonData?.origins?.every((origin) => typeof origin === 'string')) {
            logError(
                `getRelatedOrigins error: origins is not a list of strings, or it exceeds the maximum count of ${MAX_RELATED_ORIGIN_LABELS}`,
            );
            return [];
        }

        return jsonData.origins;
    } catch (ex) {
        logError(`getRelatedOrigins error: ${ex}`);
    }

    return [];
};

keepass.clearErrorMessage = function(tab) {
    tabs.updateTabValues(tab?.id, { errorMessage: undefined });
};

keepass.handleError = function(tab, errorCode, errorMessage = '') {
    if (errorMessage.length === 0) {
        errorMessage = kpErrors.getError(errorCode);
    }

    logError(`${errorCode}: ${errorMessage}`);
    tabs.updateTabValues(tab?.id, { errorMessage: errorMessage });
};

keepass.updatePopup = function() {
    if (page && tabs.tabList.length > 0) {
        browserAction.showDefault();
    }
};

// Updates the database hashes to content script
keepass.updateDatabase = async function(tab) {
    keepass.associated.value = false;
    keepass.associated.hash = null;
    page.clearAllLogins();

    if (keepass.protocolV2) {
        // TODO: Only show "Connect" if the active database is not connected?
        // TODO: What if there are credentials from another database but the selected one is not connected?
        const result = await protocol.testAssociationFromDatabaseStatuses();
        keepass.updatePopup(tab);
        keepass.updateDatabaseHashToContent(result);
        return;
    }

    // Legacy protocol
    await keepassProtocol.testAssociation(null, [ true ]);
    keepass.updatePopup(tab);
    keepass.updateDatabaseHashToContent();
};

keepass.updateDatabaseHashToContent = async function() {
    try {
        const tab = await getCurrentTab();
        if (tab?.id) {
            // Send message to content script
            browser.tabs.sendMessage(tab.id, {
                action: 'check_database_hash',
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

keepass.updateFeaturesList = function (currentVersion) {
    const versionResults = keepass.compareMultipleVersions([
        keepass.requiredKeePassXC,
        '2.6.1',
        '2.7.0',
        '2.7.7',
        '2.7.10'
    ], currentVersion);

    keepass.featuresList = {
        downloadFaviconAfterSave: versionResults['2.7.0'],
        newTotp: versionResults['2.6.1'],
        passwordGenerator: versionResults['2.7.0'],
        passkeys: versionResults['2.7.7'],
        passkeysDefaultGroup: versionResults['2.7.10'],
        requiredKeePassXCVersionFound: versionResults[keepass.requiredKeePassXC],
    };
};

// Expects an array of versions to compare
keepass.compareMultipleVersions = function(versions, current, canBeEqual = true) {
    if (!Array.isArray(versions)) {
        return {};
    }

    const result = {};
    for (const version of versions) {
        result[version] = compareVersion(version, current, canBeEqual);
    }

    return result;
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
