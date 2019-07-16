'use strict';

const keepass = {};
keepass.associated = { 'value': false, 'hash': null };
keepass.keyPair = { publicKey: null, secretKey: null };
keepass.serverPublicKey = '';
keepass.clientID = '';
keepass.isConnected = false;
keepass.isDatabaseClosed = false;
keepass.isKeePassXCAvailable = false;
keepass.isEncryptionKeyUnrecognized = false;
keepass.currentKeePassXC = '';
keepass.requiredKeePassXC = '2.3.0';
keepass.nativeHostName = 'org.keepassxc.keepassxc_browser';
keepass.nativePort = null;
keepass.keySize = 24;
keepass.latestVersionUrl = 'https://api.github.com/repos/keepassxreboot/keepassxc/releases/latest';
keepass.cacheTimeout = 30 * 1000; // Milliseconds
keepass.databaseHash = '';
keepass.previousDatabaseHash = '';
keepass.keyId = 'keepassxc-browser-cryptokey-name';
keepass.keyBody = 'keepassxc-browser-key';
keepass.messageTimeout = 500; // Milliseconds
keepass.nonce = nacl.util.encodeBase64(nacl.randomBytes(keepass.keySize));
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
    CREATE_NEW_GROUP: 'create-new-group'
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

keepass.sendNativeMessage = function(request, enableTimeout = false) {
    return new Promise((resolve, reject) => {
        let timeout;
        const requestAction = request.action;
        const ev = keepass.nativePort.onMessage;

        const listener = ((port, action) => {
            const handler = (msg) => {
                if (msg && msg.action === action) {
                    port.removeListener(handler);
                    if (enableTimeout) {
                        clearTimeout(timeout);
                    }
                    resolve(msg);
                }
            };
            return handler;
        })(ev, requestAction);
        ev.addListener(listener);


        // Handle timeouts
        if (enableTimeout) {
            timeout = setTimeout(() => {
                const errorMessage = {
                    action: requestAction,
                    error: kpErrors.getError(kpErrors.TIMEOUT_OR_NOT_CONNECTED),
                    errorCode: kpErrors.TIMEOUT_OR_NOT_CONNECTED
                };
                keepass.isKeePassXCAvailable = false;
                ev.removeListener(listener.handler);
                resolve(errorMessage);
            }, keepass.messageTimeout);
        }

        // Send the request
        if (keepass.nativePort) {
            keepass.nativePort.postMessage(request);
        }
    });
};

keepass.addCredentials = function(callback, tab, username, password, url, group, groupUuid) {
    keepass.updateCredentials(callback, tab, null, username, password, url, group, groupUuid);
};

keepass.updateCredentials = function(callback, tab, entryId, username, password, url, group, groupUuid) {
    if (tab && page.tabs[tab.id]) {
        page.tabs[tab.id].errorMessage = null;
    }

    keepass.testAssociation((taResponse) => {
        if (!taResponse) {
            browserAction.showDefault(null, tab);
            callback([]);
            return;
        }

        const kpAction = kpActions.SET_LOGIN;
        const { dbid } = keepass.getCryptoKey();
        const nonce = keepass.getNonce();
        const incrementedNonce = keepass.incrementedNonce(nonce);

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

        if (group && groupUuid) {
            messageData.group = group;
            messageData.groupUuid = groupUuid;
        }

        const request = {
            action: kpAction,
            message: keepass.encrypt(messageData, nonce),
            nonce: nonce,
            clientID: keepass.clientID
        };

        keepass.sendNativeMessage(request).then((response) => {
            if (response.message && response.nonce) {
                const res = keepass.decrypt(response.message, response.nonce);
                if (!res) {
                    keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                    callback('error');
                    return;
                }

                const message = nacl.util.encodeUTF8(res);
                const parsed = JSON.parse(message);
                callback(keepass.verifyResponse(parsed, incrementedNonce) ? 'success' : 'error');
            } else if (response.error && response.errorCode) {
                keepass.handleError(tab, response.errorCode, response.error);
                callback('error');
            } else {
                browserAction.showDefault(null, tab);
            }
        });
    });
};

keepass.retrieveCredentials = function(callback, tab, url, submiturl, forceCallback, triggerUnlock = false, httpAuth = false) {
    keepass.testAssociation((taResponse) => {
        if (!taResponse) {
            browserAction.showDefault(null, tab);
            if (forceCallback) {
                callback([]);
            }
            return;
        }

        if (tab && page.tabs[tab.id]) {
            page.tabs[tab.id].errorMessage = null;
        }

        if (!keepass.isConnected) {
            callback([]);
            return;
        }

        let entries = [];
        const keys = [];
        const kpAction = kpActions.GET_LOGINS;
        const nonce = keepass.getNonce();
        const incrementedNonce = keepass.incrementedNonce(nonce);
        const { dbid } = keepass.getCryptoKey();

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

        const request = {
            action: kpAction,
            message: keepass.encrypt(messageData, nonce),
            nonce: nonce,
            clientID: keepass.clientID
        };

        keepass.sendNativeMessage(request).then((response) => {
            if (response.message && response.nonce) {
                const res = keepass.decrypt(response.message, response.nonce);
                if (!res) {
                    keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                    callback([]);
                    return;
                }

                const message = nacl.util.encodeUTF8(res);
                const parsed = JSON.parse(message);
                keepass.setcurrentKeePassXCVersion(parsed.version);

                if (keepass.verifyResponse(parsed, incrementedNonce)) {
                    entries = parsed.entries;
                    keepass.updateLastUsed(keepass.databaseHash);
                    if (entries.length === 0) {
                        // Questionmark-icon is not triggered, so we have to trigger for the normal symbol
                        browserAction.showDefault(null, tab);
                    }
                    callback(entries);
                } else {
                    console.log('RetrieveCredentials for ' + url + ' rejected');
                }
            } else if (response.error && response.errorCode) {
                keepass.handleError(tab, response.errorCode, response.error);
                callback([]);
            } else {
                browserAction.showDefault(null, tab);
                callback([]);
            }
        });
    }, tab, false, triggerUnlock);
};

keepass.generatePassword = function(callback, tab) {
    if (!keepass.isConnected) {
        callback([]);
        return;
    }

    keepass.testAssociation((taresponse) => {
        if (!taresponse) {
            browserAction.showDefault(null, tab);
            callback([]);
            return;
        }

        if (!keepass.compareVersion(keepass.requiredKeePassXC, keepass.currentKeePassXC)) {
            callback([]);
            return;
        }

        let passwords = [];
        const kpAction = kpActions.GENERATE_PASSWORD;
        const nonce = keepass.getNonce();
        const incrementedNonce = keepass.incrementedNonce(nonce);

        const request = {
            action: kpAction,
            nonce: nonce,
            clientID: keepass.clientID
        };

        keepass.sendNativeMessage(request).then((response) => {
            if (response.message && response.nonce) {
                const res = keepass.decrypt(response.message, response.nonce);
                if (!res) {
                    keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                    callback([]);
                    return;
                }

                const message = nacl.util.encodeUTF8(res);
                const parsed = JSON.parse(message);
                keepass.setcurrentKeePassXCVersion(parsed.version);

                if (keepass.verifyResponse(parsed, incrementedNonce)) {
                    if (parsed.entries) {
                        passwords = parsed.entries;
                        keepass.updateLastUsed(keepass.databaseHash);
                    } else {
                        console.log('No entries returned. Is KeePassXC up-to-date?');
                    }
                } else {
                    console.log('GeneratePassword rejected');
                }
                callback(passwords);
            } else if (response.error && response.errorCode) {
                keepass.handleError(tab, response.errorCode, response.error);
            }
        });
    }, tab);
};

keepass.associate = function(callback, tab) {
    if (keepass.isAssociated()) {
        callback([]);
        return;
    }

    keepass.getDatabaseHash((hash) => {
        if (keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
            callback([]);
            return;
        }

        if (tab && page.tabs[tab.id]) {
            page.tabs[tab.id].errorMessage = null;
        }

        const kpAction = kpActions.ASSOCIATE;
        const key = nacl.util.encodeBase64(keepass.keyPair.publicKey);
        const nonce = keepass.getNonce();
        const incrementedNonce = keepass.incrementedNonce(nonce);
        const idKeyPair = nacl.box.keyPair();
        const idKey = nacl.util.encodeBase64(idKeyPair.publicKey);

        const messageData = {
            action: kpAction,
            key: key,
            idKey: idKey
        };

        const request = {
            action: kpAction,
            message: keepass.encrypt(messageData, nonce),
            nonce: nonce,
            clientID: keepass.clientID,
            triggerUnlock: 'true'
        };

        keepass.sendNativeMessage(request).then((response) => {
            if (response.message && response.nonce) {
                const res = keepass.decrypt(response.message, response.nonce);
                if (!res) {
                    keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                    return;
                }

                const message = nacl.util.encodeUTF8(res);
                const parsed = JSON.parse(message);
                keepass.setcurrentKeePassXCVersion(parsed.version);
                const id = parsed.id;

                if (!keepass.verifyResponse(parsed, incrementedNonce)) {
                    keepass.handleError(tab, kpErrors.ASSOCIATION_FAILED);
                } else {
                    // Use public key as identification key with older KeePassXC releases
                    const savedKey = keepass.compareVersion('2.3.4', keepass.currentKeePassXC) ? idKey : key;
                    keepass.setCryptoKey(id, savedKey); // Save the new identification public key as id key for the database
                    keepass.associated.value = true;
                    keepass.associated.hash = parsed.hash || 0;
                }

                browserAction.show(callback, tab);
            } else if (response.error && response.errorCode) {
                keepass.handleError(tab, response.errorCode, response.error);
            }
        });
    }, tab);
};

keepass.testAssociation = async function(callback, tab, enableTimeout = false, triggerUnlock = false) {
    if (tab && page.tabs[tab.id]) {
        page.tabs[tab.id].errorMessage = null;
    }

    keepass.getDatabaseHash((dbHash) => {
        if (!dbHash) {
            callback(false);
            return false;
        }

        if (keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
            callback(false);
            return false;
        }

        if (keepass.isAssociated()) {
            callback(true);
            return true;
        }

        if (!keepass.serverPublicKey) {
            if (tab && page.tabs[tab.id]) {
                keepass.handleError(tab, kpErrors.PUBLIC_KEY_NOT_FOUND);
            }
            callback(false);
            return false;
        }

        const kpAction = kpActions.TEST_ASSOCIATE;
        const nonce = keepass.getNonce();
        const incrementedNonce = keepass.incrementedNonce(nonce);
        const { dbid, dbkey } = keepass.getCryptoKey();

        if (dbkey === null || dbid === null) {
            if (tab && page.tabs[tab.id]) {
                keepass.handleError(tab, kpErrors.NO_SAVED_DATABASES_FOUND);
            }
            callback(false);
            return false;
        }

        const messageData = {
            action: kpAction,
            id: dbid,
            key: dbkey
        };

        const request = {
            action: kpAction,
            message: keepass.encrypt(messageData, nonce),
            nonce: nonce,
            clientID: keepass.clientID
        };

        keepass.sendNativeMessage(request, enableTimeout).then((response) => {
            if (response.message && response.nonce) {
                const res = keepass.decrypt(response.message, response.nonce);
                if (!res) {
                    keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                    callback(false);
                    return;
                }

                const message = nacl.util.encodeUTF8(res);
                const parsed = JSON.parse(message);
                keepass.setcurrentKeePassXCVersion(parsed.version);
                keepass.isEncryptionKeyUnrecognized = false;

                if (!keepass.verifyResponse(parsed, incrementedNonce)) {
                    const hash = response.hash || 0;
                    keepass.deleteKey(hash);
                    keepass.isEncryptionKeyUnrecognized = true;
                    keepass.handleError(tab, kpErrors.ENCRYPTION_KEY_UNRECOGNIZED);
                    keepass.associated.value = false;
                    keepass.associated.hash = null;
                } else if (!keepass.isAssociated()) {
                    keepass.handleError(tab, kpErrors.ASSOCIATION_FAILED);
                } else {
                    if (tab && page.tabs[tab.id]) {
                        delete page.tabs[tab.id].errorMessage;
                    }
                }
            } else if (response.error && response.errorCode) {
                keepass.handleError(tab, response.errorCode, response.error);
            }
            callback(keepass.isAssociated());
        });
    }, tab, enableTimeout, triggerUnlock);
};

keepass.getDatabaseHash = function(callback, tab, enableTimeout = false, triggerUnlock = false) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        callback([]);
        return;
    }

    if (!keepass.serverPublicKey) {
        keepass.changePublicKeys(tab);
    }

    const kpAction = kpActions.GET_DATABASE_HASH;
    const nonce = keepass.getNonce();
    const incrementedNonce = keepass.incrementedNonce(nonce);

    const messageData = {
        action: kpAction,
        connectedKeys: Object.keys(keepass.keyRing) // This will be removed in the future
    };

    const encrypted = keepass.encrypt(messageData, nonce);
    if (encrypted.length <= 0) {
        keepass.handleError(tab, kpErrors.PUBLIC_KEY_NOT_FOUND);
        callback(keepass.databaseHash);
        return;
    }

    const request = {
        action: kpAction,
        message: encrypted,
        nonce: nonce,
        clientID: keepass.clientID
    };

    if (triggerUnlock === true) {
        request.triggerUnlock = 'true';
    }

    keepass.sendNativeMessage(request, enableTimeout).then((response) => {
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                callback('');
                return;
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);
            if (keepass.verifyDatabaseResponse(parsed, incrementedNonce) && parsed.hash) {
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

                callback(parsed.hash);
                return;
            } else if (parsed.errorCode) {
                keepass.databaseHash = '';
                keepass.isDatabaseClosed = true;
                keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
                callback(keepass.databaseHash);
                return;
            }
        } else {
            keepass.databaseHash = '';
            keepass.isDatabaseClosed = true;
            if (response.message && response.message === '') {
                keepass.isKeePassXCAvailable = false;
                keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
            } else {
                keepass.handleError(tab, response.errorCode, response.error);
            }
            callback(keepass.databaseHash);
            return;
        }
    });
};

keepass.changePublicKeys = function(tab, enableTimeout = false) {
    return new Promise((resolve, reject) => {
        if (!keepass.isConnected) {
            keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
            reject(false);
        }

        const kpAction = kpActions.CHANGE_PUBLIC_KEYS;
        const key = nacl.util.encodeBase64(keepass.keyPair.publicKey);
        const nonce = keepass.getNonce();
        const incrementedNonce = keepass.incrementedNonce(nonce);
        keepass.clientID = nacl.util.encodeBase64(nacl.randomBytes(keepass.keySize));

        const request = {
            action: kpAction,
            publicKey: key,
            nonce: nonce,
            clientID: keepass.clientID
        };

        keepass.sendNativeMessage(request, enableTimeout).then((response) => {
            keepass.setcurrentKeePassXCVersion(response.version);

            if (!keepass.verifyKeyResponse(response, key, incrementedNonce)) {
                if (tab && page.tabs[tab.id]) {
                    keepass.handleError(tab, kpErrors.KEY_CHANGE_FAILED);
                }
                reject(false);
            } else {
                keepass.isKeePassXCAvailable = true;
                console.log('Server public key: ' + nacl.util.encodeBase64(keepass.serverPublicKey));
            }
            resolve(true);
        });
    });
};

keepass.lockDatabase = function(tab) {
    return new Promise((resolve, reject) => {
        if (!keepass.isConnected) {
            keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
            reject(false);
        }

        const kpAction = kpActions.LOCK_DATABASE;
        const nonce = keepass.getNonce();
        const incrementedNonce = keepass.incrementedNonce(nonce);

        const messageData = {
            action: kpAction
        };

        const request = {
            action: kpAction,
            message: keepass.encrypt(messageData, nonce),
            nonce: nonce,
            clientID: keepass.clientID
        };

        keepass.sendNativeMessage(request).then((response) => {
            if (response.message && response.nonce) {
                const res = keepass.decrypt(response.message, response.nonce);
                if (!res) {
                    keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                    resolve(false);
                    return;
                }

                const message = nacl.util.encodeUTF8(res);
                const parsed = JSON.parse(message);
                keepass.setcurrentKeePassXCVersion(parsed.version);

                if (keepass.verifyResponse(parsed, incrementedNonce)) {
                    keepass.isDatabaseClosed = true;
                    keepass.updateDatabase();

                    // Display error message in the popup
                    keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
                    resolve(true);
                }
            } else if (response.error && response.errorCode) {
                keepass.isDatabaseClosed = true;
                keepass.handleError(tab, response.errorCode, response.error);
            }
            resolve(false);
        });
    });
};

keepass.getDatabaseGroups = function(callback, tab) {
    keepass.testAssociation((taResponse) => {
        if (!taResponse) {
            browserAction.showDefault(null, tab);
            callback([]);
            return;
        }

        if (tab && page.tabs[tab.id]) {
            page.tabs[tab.id].errorMessage = null;
        }

        if (!keepass.isConnected) {
            callback([]);
            return;
        }

        let groups = [];
        const kpAction = kpActions.GET_DATABASE_GROUPS;
        const nonce = keepass.getNonce();
        const incrementedNonce = keepass.incrementedNonce(nonce);

        const messageData = {
            action: kpAction
        };

        const request = {
            action: kpAction,
            message: keepass.encrypt(messageData, nonce),
            nonce: nonce,
            clientID: keepass.clientID
        };

        keepass.sendNativeMessage(request).then((response) => {
            if (response.message && response.nonce) {
                const res = keepass.decrypt(response.message, response.nonce);
                if (!res) {
                    keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                    callback([]);
                    return;
                }

                const message = nacl.util.encodeUTF8(res);
                const parsed = JSON.parse(message);

                if (keepass.verifyResponse(parsed, incrementedNonce)) {
                    groups = parsed.groups;
                    groups.defaultGroup = page.settings.defaultGroup;
                    groups.defaultGroupAlwaysAsk = page.settings.defaultGroupAlwaysAsk;
                    keepass.updateLastUsed(keepass.databaseHash);
                    callback(groups);
                } else {
                    console.log('getDatabaseGroups rejected');
                    callback([]);
                }
            } else if (response.error && response.errorCode) {
                keepass.handleError(tab, response.errorCode, response.error);
                callback([]);
            } else {
                browserAction.showDefault(null, tab);
                callback([]);
            }
        });
    }, tab, false);
};

keepass.createNewGroup = function(callback, tab, groupName) {
    keepass.testAssociation((taResponse) => {
        if (!taResponse) {
            browserAction.showDefault(null, tab);
            callback([]);
            return;
        }

        if (tab && page.tabs[tab.id]) {
            page.tabs[tab.id].errorMessage = null;
        }

        if (!keepass.isConnected) {
            callback([]);
            return;
        }

        const kpAction = kpActions.CREATE_NEW_GROUP;
        const nonce = keepass.getNonce();
        const incrementedNonce = keepass.incrementedNonce(nonce);

        const messageData = {
            action: kpAction,
            groupName: groupName
        };

        const request = {
            action: kpAction,
            message: keepass.encrypt(messageData, nonce),
            nonce: nonce,
            clientID: keepass.clientID
        };

        keepass.sendNativeMessage(request).then((response) => {
            if (response.message && response.nonce) {
                const res = keepass.decrypt(response.message, response.nonce);
                if (!res) {
                    keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                    callback([]);
                    return;
                }

                const message = nacl.util.encodeUTF8(res);
                const parsed = JSON.parse(message);

                if (keepass.verifyResponse(parsed, incrementedNonce)) {
                    keepass.updateLastUsed(keepass.databaseHash);
                    callback(parsed);
                } else {
                    console.log('getDatabaseGroups rejected');
                    callback([]);
                }
            } else if (response.error && response.errorCode) {
                keepass.handleError(tab, response.errorCode, response.error);
                callback([]);
            } else {
                browserAction.showDefault(null, tab);
                callback([]);
            }
        });
    }, tab, false);
};

keepass.generateNewKeyPair = function() {
    keepass.keyPair = nacl.box.keyPair();
    //console.log(nacl.util.encodeBase64(keepass.keyPair.publicKey) + ' ' + nacl.util.encodeBase64(keepass.keyPair.secretKey));
};

keepass.isConfigured = function() {
    return new Promise((resolve, reject) => {
        if (typeof(keepass.databaseHash) === 'undefined') {
            keepass.getDatabaseHash((hash) => {
                resolve(hash in keepass.keyRing);
            });
        } else {
            resolve(keepass.databaseHash in keepass.keyRing);
        }
    });
};

keepass.checkDatabaseHash = function(callback, tab) {
    callback(keepass.databaseHash);
};

keepass.isAssociated = function() {
    return (keepass.associated.value && keepass.associated.hash && keepass.associated.hash === keepass.databaseHash);
};

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
    if (!oldHash || !newHash) {
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

keepass.setcurrentKeePassXCVersion = function(version) {
    if (version) {
        keepass.currentKeePassXC = version;
    }
};

keepass.keePassXCUpdateAvailable = function() {
    if (page.settings.checkUpdateKeePassXC && page.settings.checkUpdateKeePassXC > 0) {
        const lastChecked = (keepass.latestKeePassXC.lastChecked) ? new Date(keepass.latestKeePassXC.lastChecked) : new Date(1986, 11, 21);
        const daysSinceLastCheck = Math.floor(((new Date()).getTime() - lastChecked.getTime()) / 86400000);
        if (daysSinceLastCheck >= page.settings.checkUpdateKeePassXC) {
            keepass.checkForNewKeePassXCVersion();
        }
    }

    return keepass.compareVersion(keepass.currentKeePassXC, keepass.latestKeePassXC.version, false);
};

keepass.checkForNewKeePassXCVersion = function() {
    const xhr = new XMLHttpRequest();
    let version = -1;

    xhr.onload = function(e) {
        if (xhr.readyState === 4 && xhr.status === 200) {
            const json = JSON.parse(xhr.responseText);
            if (json.tag_name) {
                version = json.tag_name;
                keepass.latestKeePassXC.version = version;
            }
        }

        if (version !== -1) {
            browser.storage.local.set({ 'latestKeePassXC': keepass.latestKeePassXC });
        }
    };

    xhr.onerror = function(e) {
        console.log('checkForNewKeePassXCVersion error:' + e);
    };

    try {
        xhr.open('GET', keepass.latestVersionUrl, true);
        xhr.send();
    } catch (ex) {
        console.log(ex);
    }
    keepass.latestKeePassXC.lastChecked = new Date().valueOf();
};

keepass.connectToNative = function() {
    if (keepass.nativePort) {
        keepass.nativePort.disconnect();
    }
    keepass.nativeConnect();
};

keepass.onNativeMessage = function(response) {
    //console.log('Received message: ' + JSON.stringify(response));

    // Handle database lock/unlock status
    if (response.action === kpActions.DATABASE_LOCKED || response.action === kpActions.DATABASE_UNLOCKED) {
        keepass.updateDatabase();
    }
};

function onDisconnected() {
    keepass.nativePort = null;
    keepass.isConnected = false;
    keepass.isDatabaseClosed = true;
    keepass.isKeePassXCAvailable = false;
    keepass.associated.value = false;
    keepass.associated.hash = null;
    keepass.databaseHash = '';
    page.clearCredentials(page.currentTabId, true);
    keepass.updatePopup('cross');
    keepass.updateDatabaseHashToContent();
    console.log('Failed to connect: ' + (browser.runtime.lastError === null ? 'Unknown error' : browser.runtime.lastError.message));
}

keepass.getNonce = function() {
    return nacl.util.encodeBase64(nacl.randomBytes(keepass.keySize));
};

keepass.incrementedNonce = function(nonce) {
    const oldNonce = nacl.util.decodeBase64(nonce);
    let newNonce = oldNonce.slice(0);

    // from libsodium/utils.c
    let i = 0;
    let c = 1;
    for (; i < newNonce.length; ++i) {
        c += newNonce[i];
        newNonce[i] = c;
        c >>= 8;
    }

    return nacl.util.encodeBase64(newNonce);
};

keepass.nativeConnect = function() {
    console.log('Connecting to native messaging host ' + keepass.nativeHostName);
    keepass.nativePort = browser.runtime.connectNative(keepass.nativeHostName);
    keepass.nativePort.onMessage.addListener(keepass.onNativeMessage);
    keepass.nativePort.onDisconnect.addListener(onDisconnected);
    keepass.isConnected = true;
    return keepass.nativePort;
};

keepass.verifyKeyResponse = function(response, key, nonce) {
    if (!response.success || !response.publicKey) {
        keepass.associated.hash = null;
        return false;
    }

    let reply = false;
    if (!keepass.checkNonceLength(response.nonce)) {
        console.log('Error: Invalid nonce length');
        return false;
    }

    reply = (response.nonce === nonce);

    if (response.publicKey) {
        keepass.serverPublicKey = nacl.util.decodeBase64(response.publicKey);
        reply = true;
    }

    return reply;
};

keepass.verifyResponse = function(response, nonce, id) {
    keepass.associated.value = response.success;
    if (response.success !== 'true') {
        keepass.associated.hash = null;
        return false;
    }

    keepass.associated.hash = keepass.databaseHash;

    if (!keepass.checkNonceLength(response.nonce)) {
        return false;
    }

    keepass.associated.value = (response.nonce === nonce);
    if (keepass.associated.value === false) {
        console.log('Error: Nonce compare failed');
        return false;
    }

    if (id) {
        keepass.associated.value = (keepass.associated.value && id === response.id);
    }

    keepass.associated.hash = (keepass.associated.value) ? keepass.databaseHash : null;
    return keepass.isAssociated();
};

keepass.verifyDatabaseResponse = function(response, nonce) {
    if (response.success !== 'true') {
        keepass.associated.hash = null;
        return false;
    }

    if (!keepass.checkNonceLength(response.nonce)) {
        console.log('Error: Invalid nonce length');
        return false;
    }

    if (response.nonce !== nonce) {
        console.log('Error: Nonce compare failed');
        return false;
    }

    keepass.associated.hash = response.hash;
    return response.hash !== '' && response.success === 'true';
};

keepass.checkNonceLength = function(nonce) {
    return nacl.util.decodeBase64(nonce).length === nacl.secretbox.nonceLength;
};

keepass.handleError = function(tab, errorCode, errorMessage = '') {
    if (errorMessage.length === 0) {
        errorMessage = kpErrors.getError(errorCode);
    }
    console.log('Error ' + errorCode + ': ' + errorMessage);
    if (tab && page.tabs[tab.id]) {
        page.tabs[tab.id].errorMessage = errorMessage;
    }
};

keepass.getCryptoKey = function() {
    let dbkey = null;
    let dbid = null;
    if (!(keepass.databaseHash in keepass.keyRing)) {
        return { dbid, dbkey };
    }

    dbid = keepass.keyRing[keepass.databaseHash].id;

    if (dbid) {
        dbkey = keepass.keyRing[keepass.databaseHash].key;
    }

    return { dbid, dbkey };
};

keepass.setCryptoKey = function(id, key) {
    keepass.saveKey(keepass.databaseHash, id, key);
};

keepass.encrypt = function(input, nonce) {
    const messageData = nacl.util.decodeUTF8(JSON.stringify(input));
    const messageNonce = nacl.util.decodeBase64(nonce);

    if (keepass.serverPublicKey) {
        const message = nacl.box(messageData, messageNonce, keepass.serverPublicKey, keepass.keyPair.secretKey);
        if (message) {
            return nacl.util.encodeBase64(message);
        }
    }
    return '';
};

keepass.decrypt = function(input, nonce) {
    const m = nacl.util.decodeBase64(input);
    const n = nacl.util.decodeBase64(nonce);
    const res = nacl.box.open(m, n, keepass.serverPublicKey, keepass.keyPair.secretKey);
    return res;
};

keepass.enableAutomaticReconnect = function() {
    // Disable for Windows if KeePassXC is older than 2.3.4
    if (!page.settings.autoReconnect ||
        (navigator.platform.toLowerCase().includes('win') && !keepass.compareVersion('2.3.4', keepass.currentKeePassXC))) {
        return;
    }

    if (keepass.reconnectLoop === null) {
        keepass.reconnectLoop = setInterval(async() => {
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

keepass.reconnect = function(callback, tab) {
    return new Promise((resolve) => {
        keepass.connectToNative();
        keepass.generateNewKeyPair();
        keepass.changePublicKeys(tab, true).then((r) => {
            keepass.getDatabaseHash((gdRes) => {
                if (gdRes !== '' && tab && page.tabs[tab.id]) {
                    delete page.tabs[tab.id].errorMessage;
                }
                keepass.testAssociation((associationResponse) => {
                    keepass.isConfigured().then((configured) => {
                        resolve(true);
                    });
                });
            }, tab);
        }).catch((e) => {
            resolve(false); 
        });
    });
};

keepass.updatePopup = function(iconType) {
    if (page && page.tabs.length > 0) {
        const data = page.tabs[page.currentTabId].stack[page.tabs[page.currentTabId].stack.length - 1];
        data.iconType = iconType;
        browserAction.show(null, { 'id': page.currentTabId });
    }
};

// Updates the database hashes to content script
keepass.updateDatabase = function() {
    keepass.testAssociation((associationResponse) => {
        keepass.isConfigured().then((configured) => {
            keepass.updatePopup(configured ? 'normal' : 'cross');
            keepass.updateDatabaseHashToContent();
        });
    }, null);
};

keepass.updateDatabaseHashToContent = function() {
    // Send message to content script
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs.length) {
            browser.tabs.sendMessage(tabs[0].id, {
                action: 'check_database_hash',
                hash: { old: keepass.previousDatabaseHash, new: keepass.databaseHash }
            }).catch((err) => {
                console.log(err);
            });
            keepass.previousDatabaseHash = keepass.databaseHash;
        }
    });
};

keepass.compareVersion = function(minimum, current, canBeEqual = true) {
    if (!minimum || !current) {
        return false;
    }

    const min = minimum.split('.', 3).map(s => s.padStart(4, '0')).join('.');
    const cur = current.split('.', 3).map(s => s.padStart(4, '0')).join('.');
    return (canBeEqual ? (min <= cur) : (min < cur));
};
