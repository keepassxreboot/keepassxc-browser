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
    CREATE_NEW_GROUP: 'create-new-group',
    GET_TOTP: 'get-totp',
    REQUEST_AUTOTYPE: 'request-autotype'
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

const messageBuffer = {
    buffer: [],

    addMessage(msg) {
        if (!this.buffer.includes(msg)) {
            this.buffer.push(msg);
        }
    },

    matchAndRemove(msg) {
        for (let i = 0; i < this.buffer.length; ++i) {
            if (msg.nonce && msg.nonce === keepass.incrementedNonce(this.buffer[i].nonce)) {
                this.buffer.splice(i, 1);
                return true;
            }
        }

        return false;
    }
};

keepass.sendNativeMessage = function(request, enableTimeout = false, timeoutValue) {
    return new Promise((resolve, reject) => {
        let timeout;
        const requestAction = request.action;
        const ev = keepass.nativePort.onMessage;

        const listener = ((port, action) => {
            const handler = (msg) => {
                if (msg && msg.action === action) {
                    // Only resolve a matching response or a notification (without nonce)
                    if (!msg.nonce || messageBuffer.matchAndRemove(msg)) {
                        port.removeListener(handler);
                        if (enableTimeout) {
                            clearTimeout(timeout);
                        }

                        resolve(msg);
                        return;
                    }
                }
            };
            return handler;
        })(ev, requestAction);
        ev.addListener(listener);

        const messageTimeout = timeoutValue || keepass.messageTimeout;

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
            }, messageTimeout);
        }

        // Store the request to the buffer
        messageBuffer.addMessage(request);

        // Send the request
        if (keepass.nativePort) {
            keepass.nativePort.postMessage(request);
        }
    });
};

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
        const [ nonce, incrementedNonce ] = keepass.getNonces();

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

        const request = keepass.buildRequest(kpAction, keepass.encrypt(messageData, nonce), nonce, keepass.clientID);
        const response = await keepass.sendNativeMessage(request);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return 'error';
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);

            // KeePassXC versions lower than 2.5.0 will have an empty parsed.error
            let successMessage = parsed.error;
            if (parsed.error === 'success' || parsed.error === '') {
                successMessage = entryId ? 'updated' : 'created';
            }
            return keepass.verifyResponse(parsed, incrementedNonce) ? successMessage : 'error';
        } else if (response.error && response.errorCode) {
            keepass.handleError(tab, response.errorCode, response.error);
            return 'error';
        }

        browserAction.showDefault(tab);
        return [];
    } catch (err) {
        console.log('updateCredentials failed: ', err);
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
        const [ nonce, incrementedNonce ] = keepass.getNonces();
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

        const request = keepass.buildRequest(kpAction, keepass.encrypt(messageData, nonce), nonce, keepass.clientID);
        const response = await keepass.sendNativeMessage(request);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return [];
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);
            keepass.setcurrentKeePassXCVersion(parsed.version);

            if (keepass.verifyResponse(parsed, incrementedNonce)) {
                entries = removeDuplicateEntries(parsed.entries);
                keepass.updateLastUsed(keepass.databaseHash);
                if (entries.length === 0) {
                    // Questionmark-icon is not triggered, so we have to trigger for the normal symbol
                    browserAction.showDefault(tab);
                }

                return entries;
            } else {
                console.log('RetrieveCredentials for ' + url + ' rejected');
            }
        } else if (response.error && response.errorCode) {
            keepass.handleError(tab, response.errorCode, response.error);
            return [];
        }

        browserAction.showDefault(tab);
        return [];
    } catch (err) {
        console.log('retrieveCredentials failed: ', err);
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
        const [ nonce, incrementedNonce ] = keepass.getNonces();

        const request = {
            action: kpAction,
            nonce: nonce,
            clientID: keepass.clientID
        };

        const response = await keepass.sendNativeMessage(request);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return [];
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);
            keepass.setcurrentKeePassXCVersion(parsed.version);

            if (keepass.verifyResponse(parsed, incrementedNonce)) {
                password = parsed.entries ?? parsed.password;
                keepass.updateLastUsed(keepass.databaseHash);
            } else {
                console.log('GeneratePassword rejected');
            }

            return password;
        } else if (response.error && response.errorCode) {
            keepass.handleError(tab, response.errorCode, response.error);
        }

        return password;
    } catch (err) {
        console.log('generatePassword failed: ', err);
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
        const [ nonce, incrementedNonce ] = keepass.getNonces();
        const idKeyPair = nacl.box.keyPair();
        const idKey = nacl.util.encodeBase64(idKeyPair.publicKey);

        const messageData = {
            action: kpAction,
            key: key,
            idKey: idKey
        };

        const request = keepass.buildRequest(kpAction, keepass.encrypt(messageData, nonce), nonce, keepass.clientID, true);

        const response = await keepass.sendNativeMessage(request);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return AssociatedAction.NOT_ASSOCIATED;
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);
            keepass.setcurrentKeePassXCVersion(parsed.version);
            const id = parsed.id;

            if (!keepass.verifyResponse(parsed, incrementedNonce)) {
                keepass.handleError(tab, kpErrors.ASSOCIATION_FAILED);
                return AssociatedAction.NOT_ASSOCIATED;
            } else {
                // Use public key as identification key with older KeePassXC releases
                const savedKey = keepass.compareVersion('2.3.4', keepass.currentKeePassXC) ? idKey : key;
                keepass.setCryptoKey(id, savedKey); // Save the new identification public key as id key for the database
                keepass.associated.value = true;
                keepass.associated.hash = parsed.hash || 0;
            }

            browserAction.show(tab);
            return AssociatedAction.NEW_ASSOCIATION;
        } else if (response.error && response.errorCode) {
            keepass.handleError(tab, response.errorCode, response.error);
        }
    } catch (err) {
        console.log('associate failed: ', err);
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
        const [ nonce, incrementedNonce ] = keepass.getNonces();
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

        const request = keepass.buildRequest(kpAction, keepass.encrypt(messageData, nonce), nonce, keepass.clientID);

        const response = await keepass.sendNativeMessage(request, enableTimeout);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return false;
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
                keepass.isEncryptionKeyUnrecognized = false;
                if (tab && page.tabs[tab.id]) {
                    delete page.tabs[tab.id].errorMessage;
                }
            }
        } else if (response.error && response.errorCode) {
            keepass.handleError(tab, response.errorCode, response.error);
        }

        return keepass.isAssociated();
    } catch (err) {
        console.log('testAssociation failed: ', err);
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
    const [ nonce, incrementedNonce ] = keepass.getNonces();

    const messageData = {
        action: kpAction,
        connectedKeys: Object.keys(keepass.keyRing) // This will be removed in the future
    };

    const encrypted = keepass.encrypt(messageData, nonce);
    if (encrypted.length <= 0) {
        keepass.handleError(tab, kpErrors.PUBLIC_KEY_NOT_FOUND);
        keepass.updateDatabaseHashToContent();
        return keepass.databaseHash;
    }

    const request = keepass.buildRequest(kpAction, keepass.encrypt(messageData, nonce), nonce, keepass.clientID, triggerUnlock);

    try {
        const response = await keepass.sendNativeMessage(request, enableTimeout);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return '';
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
        console.log('getDatabaseHash failed: ', err);
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
    const [ nonce, incrementedNonce ] = keepass.getNonces();
    keepass.clientID = nacl.util.encodeBase64(nacl.randomBytes(keepass.keySize));

    const request = {
        action: kpAction,
        publicKey: key,
        nonce: nonce,
        clientID: keepass.clientID
    };

    try {
        const response = await keepass.sendNativeMessage(request, enableTimeout, connectionTimeout);
        keepass.setcurrentKeePassXCVersion(response.version);

        if (!keepass.verifyKeyResponse(response, key, incrementedNonce)) {
            if (tab && page.tabs[tab.id]) {
                keepass.handleError(tab, kpErrors.KEY_CHANGE_FAILED);
            }

            keepass.updateDatabaseHashToContent();
            return false;
        }

        keepass.isKeePassXCAvailable = true;
        console.log('Server public key: ' + nacl.util.encodeBase64(keepass.serverPublicKey));
        return true;
    } catch (err) {
        console.log('changePublicKeys failed: ', err);
        return false;
    }
};

keepass.lockDatabase = async function(tab) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const kpAction = kpActions.LOCK_DATABASE;
    const [ nonce, incrementedNonce ] = keepass.getNonces();

    const messageData = {
        action: kpAction
    };

    const request = keepass.buildRequest(kpAction, keepass.encrypt(messageData, nonce), nonce, keepass.clientID);

    try {
        const response = await keepass.sendNativeMessage(request);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return false;
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);
            keepass.setcurrentKeePassXCVersion(parsed.version);

            if (keepass.verifyResponse(parsed, incrementedNonce)) {
                keepass.isDatabaseClosed = true;
                keepass.updateDatabase();

                // Display error message in the popup
                keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
                return true;
            }
        } else if (response.error && response.errorCode) {
            keepass.isDatabaseClosed = true;
            keepass.handleError(tab, response.errorCode, response.error);
        }

        return false;
    } catch (err) {
        console.log('lockDatabase failed: ', err);
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
        const [ nonce, incrementedNonce ] = keepass.getNonces();

        const messageData = {
            action: kpAction
        };

        const request = keepass.buildRequest(kpAction, keepass.encrypt(messageData, nonce), nonce, keepass.clientID);
        const response = await keepass.sendNativeMessage(request);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return [];
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);

            if (keepass.verifyResponse(parsed, incrementedNonce)) {
                groups = parsed.groups;
                groups.defaultGroup = page.settings.defaultGroup;
                groups.defaultGroupAlwaysAsk = page.settings.defaultGroupAlwaysAsk;
                keepass.updateLastUsed(keepass.databaseHash);
                return groups;
            } else {
                console.log('getDatabaseGroups rejected');
                return [];
            }
        } else if (response.error && response.errorCode) {
            keepass.handleError(tab, response.errorCode, response.error);
            return [];
        }

        browserAction.showDefault(tab);
        return [];
    } catch (err) {
        console.log('getDatabaseGroups failed: ', err);
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
        const [ nonce, incrementedNonce ] = keepass.getNonces();

        const messageData = {
            action: kpAction,
            groupName: groupName
        };

        const request = keepass.buildRequest(kpAction, keepass.encrypt(messageData, nonce), nonce, keepass.clientID);
        const response = await keepass.sendNativeMessage(request);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return [];
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);

            if (keepass.verifyResponse(parsed, incrementedNonce)) {
                keepass.updateLastUsed(keepass.databaseHash);
                return parsed;
            }

            console.log('getDatabaseGroups rejected');
            return [];
        } else if (response.error && response.errorCode) {
            keepass.handleError(tab, response.errorCode, response.error);
            return [];
        }

        browserAction.showDefault(tab);
        return [];
    } catch (err) {
        console.log('createNewGroup failed: ', err);
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
    const [ nonce, incrementedNonce ] = keepass.getNonces();

    const messageData = {
        action: kpAction,
        uuid: uuid
    };

    try {
        const request = keepass.buildRequest(kpAction, keepass.encrypt(messageData, nonce), nonce, keepass.clientID);
        const response = await keepass.sendNativeMessage(request);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return;
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);
            if (keepass.verifyResponse(parsed, incrementedNonce) && parsed.totp) {
                keepass.updateLastUsed(keepass.databaseHash);
                return parsed.totp;
            }
        } else if (response.error && response.errorCode) {
            keepass.handleError(tab, response.errorCode, response.error);
        }

        return;
    } catch (err) {
        console.log('getTotp failed: ', err);
    }
};

keepass.requestAutotype = async function(tab, args = []) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const kpAction = kpActions.REQUEST_AUTOTYPE;
    const [ nonce, incrementedNonce ] = keepass.getNonces();
    const search = getTopLevelDomainFromUrl(args[0]);

    const messageData = {
        action: kpAction,
        search: search
    };

    const request = keepass.buildRequest(kpAction, keepass.encrypt(messageData, nonce), nonce, keepass.clientID);

    try {
        const response = await keepass.sendNativeMessage(request);
        if (response.message && response.nonce) {
            const res = keepass.decrypt(response.message, response.nonce);
            if (!res) {
                keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
                return false;
            }

            const message = nacl.util.encodeUTF8(res);
            const parsed = JSON.parse(message);

            if (keepass.verifyResponse(parsed, incrementedNonce)) {
                return true;
            }
        } else if (response.error && response.errorCode) {
            keepass.handleError(tab, response.errorCode, response.error);
        }

        return false;
    } catch (err) {
        console.log('requestAutotype failed: ', err);
        return false;
    }
};


keepass.generateNewKeyPair = function() {
    keepass.keyPair = nacl.box.keyPair();
    //console.log(nacl.util.encodeBase64(keepass.keyPair.publicKey) + ' ' + nacl.util.encodeBase64(keepass.keyPair.secretKey));
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
    const newNonce = oldNonce.slice(0);

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

keepass.getNonces = function() {
    const nonce = keepass.getNonce();
    const incrementedNonce = keepass.incrementedNonce(nonce);
    return [ nonce, incrementedNonce ];
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

    if (!keepass.checkNonceLength(response.nonce)) {
        console.log('Error: Invalid nonce length');
        return false;
    }

    const reply = (response.nonce === nonce);
    if (response.publicKey && reply) {
        keepass.serverPublicKey = nacl.util.decodeBase64(response.publicKey);
        return true;
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
    keepass.connectToNative();
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
                console.log('Error: No content script available for this tab.');
            });
            keepass.previousDatabaseHash = keepass.databaseHash;
        }
    } catch (err) {
        console.log('updateDatabaseHashToContent failed: ', err);
    }
};

keepass.compareVersion = function(minimum, current, canBeEqual = true) {
    if (!minimum || !current) {
        return false;
    }

    // Handle snapshot builds as stable version
    const snapshot = '-snapshot';
    if (current.endsWith(snapshot)) {
        current = current.slice(0, -snapshot.length);
    }

    const min = minimum.split('.', 3).map(s => s.padStart(4, '0')).join('.');
    const cur = current.split('.', 3).map(s => s.padStart(4, '0')).join('.');
    return (canBeEqual ? (min <= cur) : (min < cur));
};

keepass.buildRequest = function(action, encrypted, nonce, clientID, triggerUnlock = false) {
    const request = {
        action: action,
        message: encrypted,
        nonce: nonce,
        clientID: clientID
    };

    if (triggerUnlock) {
        request.triggerUnlock = 'true';
    }

    return request;
};

keepass.getIsKeePassXCAvailable = async function() {
    return keepass.isKeePassXCAvailable;
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
