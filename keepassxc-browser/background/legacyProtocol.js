'use strict';

// Legacy protocol, "old" client for KeePassXC 2.7.5 and older.
const keepassProtocol = {};

//--------------------------------------------------------------------------
// Commands
//--------------------------------------------------------------------------

keepassProtocol.addCredentials = async function(tab, args = []) {
    const [ username, password, url, group, groupUuid ] = args;
    return keepass.updateCredentials(tab, [ null, username, password, url, group, groupUuid ]);
};

keepassProtocol.associate = async function(tab) {
    if (keepass.isAssociated()) {
        return AssociatedAction.ASSOCIATED;
    }

    try {
        await keepassProtocol.getDatabaseHash(tab);
        if (keepass.isDatabaseClosed || !keepass.isKeePassXCAvailable) {
            return AssociatedAction.NOT_ASSOCIATED;
        }

        keepass.clearErrorMessage(tab);

        const kpAction = kpActions.ASSOCIATE;
        const key = nacl.util.encodeBase64(keepass.keyPair.publicKey);
        const nonce = protocolClient.getNonce();
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

keepassProtocol.createNewGroup = async function(tab, args = []) {
    try {
        const [ groupName ] = args;
        const taResponse = await keepassProtocol.testAssociation(tab, [ false ]);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        keepass.clearErrorMessage(tab);

        if (!keepass.isConnected) {
            return [];
        }

        const kpAction = kpActions.CREATE_NEW_GROUP;
        const nonce = protocolClient.getNonce();

        const messageData = {
            action: kpAction,
            groupName: groupName
        };

        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
        if (response) {
            keepass.updateLastUsed(keepass.databaseHash);
            return response;
        } else {
            logError('getDatabaseGroups rejected');
        }

        browserAction.showDefault(tab);
        return [];
    } catch (err) {
        logError(`createNewGroup failed: ${err}`);
        return [];
    }
};


keepassProtocol.changePublicKeys = async function(tab, enableTimeout = false, connectionTimeout) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const kpAction = kpActions.CHANGE_PUBLIC_KEYS;
    const key = nacl.util.encodeBase64(keepass.keyPair.publicKey);
    const [ nonce, incrementedNonce ] = protocolClient.getNonces();
    keepass.clientID = nacl.util.encodeBase64(nacl.randomBytes(protocolClient.keySize));

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

keepassProtocol.generatePassword = async function(tab) {
    if (!keepass.isConnected) {
        return [];
    }

    try {
        const taResponse = await keepassProtocol.testAssociation(tab);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        if (!keepass.compareVersion(keepass.requiredKeePassXC, keepass.currentKeePassXC)) {
            return [];
        }

        let password;
        const kpAction = kpActions.GENERATE_PASSWORD;
        const nonce = protocolClient.getNonce();

        const messageData = {
            action: kpAction,
            nonce: nonce,
            clientID: keepass.clientID,
            requestID: protocolClient.getRequestId()
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

keepassProtocol.getDatabaseGroups = async function(tab) {
    try {
        const taResponse = await keepassProtocol.testAssociation(tab, [ false ]);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        keepass.clearErrorMessage(tab);

        if (!keepass.isConnected) {
            return [];
        }

        let groups = [];
        const kpAction = kpActions.GET_DATABASE_GROUPS;
        const nonce = protocolClient.getNonce();

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


keepassProtocol.getDatabaseHash = async function(tab, args = []) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return '';
    }

    if (!keepass.serverPublicKey) {
        keepassProtocol.changePublicKeys(tab);
    }

    const [ enableTimeout = false, triggerUnlock = false ] = args;
    const kpAction = kpActions.GET_DATABASE_HASH;
    const [ nonce, incrementedNonce ] = protocolClient.getNonces();

    const messageData = {
        action: kpAction,
        connectedKeys: Object.keys(keepass.keyRing) // This will be removed in the future
    };

    // Why is this here?
    /*const encrypted = protocolClient.encrypt(messageData, nonce);
    if (encrypted.length <= 0) {
        keepass.handleError(tab, kpErrors.PUBLIC_KEY_NOT_FOUND);
        keepass.updateDatabaseHashToContent();
        return keepass.databaseHash;
    }*/

    try {
        const request = keepassClient.buildRequest(kpAction, protocolClient.encrypt(messageData, nonce), nonce, keepass.clientID, triggerUnlock);
        const response = await keepassClient.sendNativeMessage(request, enableTimeout);
        if (response.message && response.nonce) {
            const res = protocolClient.decrypt(response.message, response.nonce);
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

keepassProtocol.getTotp = async function(tab, args = []) {
    const [ uuid, oldTotp ] = args;
    if (!keepass.compareVersion('2.6.1', keepass.currentKeePassXC, true)) {
        return oldTotp;
    }

    const taResponse = await keepassProtocol.testAssociation(tab, [ false ]);
    if (!taResponse || !keepass.isConnected) {
        return;
    }

    const kpAction = kpActions.GET_TOTP;
    const nonce = protocolClient.getNonce();

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

keepassProtocol.lockDatabase = async function(tab) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const kpAction = kpActions.LOCK_DATABASE;
    const nonce = protocolClient.getNonce();

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

keepassProtocol.requestAutotype = async function(tab, args = []) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const kpAction = kpActions.REQUEST_AUTOTYPE;
    const nonce = protocolClient.getNonce();
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

keepassProtocol.retrieveCredentials = async function(tab, args = []) {
    try {
        const [ url, submiturl, triggerUnlock = false, httpAuth = false ] = args;
        const taResponse = await keepassProtocol.testAssociation(tab, [ false, triggerUnlock ]);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        keepass.clearErrorMessage(tab);

        if (!keepass.isConnected) {
            return [];
        }

        let entries = [];
        const keys = [];
        const kpAction = kpActions.GET_LOGINS;
        const nonce = protocolClient.getNonce();
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
            entries = keepass.removeDuplicateEntries(response.entries);
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

keepassProtocol.testAssociation = async function(tab, args = []) {
    keepass.clearErrorMessage(tab);

    try {
        const [ enableTimeout = false, triggerUnlock = false ] = args;
        const dbHash = await keepassProtocol.getDatabaseHash(tab, [ enableTimeout, triggerUnlock ]);
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
        const nonce = protocolClient.getNonce();
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
            keepass.clearErrorMessage(tab);
        }

        return keepass.isAssociated();
    } catch (err) {
        logError(`testAssociation failed: ${err}`);
        return false;
    }
};

keepassProtocol.updateCredentials = async function(tab, args = []) {
    try {
        const [ entryId, username, password, url, group, groupUuid ] = args;
        const taResponse = await keepassProtocol.testAssociation(tab);
        if (!taResponse) {
            browserAction.showDefault(tab);
            return [];
        }

        const kpAction = kpActions.SET_LOGIN;
        const [ dbid ] = keepass.getCryptoKey();
        const nonce = protocolClient.getNonce();

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
