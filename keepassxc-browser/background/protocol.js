'use strict';

//--------------------------------------------------------------------------
// Protocol V2
//--------------------------------------------------------------------------

const protocol = {};

protocol.associate = async function(tab, args = []) {
    if (!keepass.isKeePassXCAvailable) {
        return AssociatedAction.NOT_ASSOCIATED;
    }

    try {
        keepass.clearErrorMessage(tab);

        const publicKey = protocolClient.getPublicConnectionKey();
        const idKey = protocolClient.generateIdKey();

        const messageData = {
            action: kpActions.ASSOCIATE,
            idKey: idKey,
            publicKey: publicKey
        };

        const response = await protocolClient.sendMessage(tab, messageData, false, true);
        if (response && response.id && response.hash) {
            keepass.setCryptoKey(response.id, idKey);

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

// Unencrypted
protocol.changePublicKeys = async function(tab, enableTimeout = false, connectionTimeout) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const kpAction = kpActions.CHANGE_PUBLIC_KEYS;
    const key = protocolClient.getPublicConnectionKey();
    const [ nonce, incrementedNonce ] = protocolClient.getNonces();
    keepass.clientID = protocolClient.generateClientId();

    const request = {
        action: kpAction,
        clientID: keepass.clientID,
        nonce: nonce,
        publicKey: key,
        requestID: protocolClient.getRequestId()
    };

    try {
        const response = await protocolClient.sendNativeMessage(kpAction, request, enableTimeout, connectionTimeout);
        if (response.error && response.errorCode) {
            keepass.handleError(tab, kpErrors.KEY_CHANGE_FAILED);
            return false;
        }

        keepass.setcurrentKeePassXCVersion(response.version);
        keepass.protocolV2 = response?.protocolVersion === 2;

        const verified = keepass.protocolV2
            ? protocolClient.verifyNonce(response, incrementedNonce)
            : keepassClient.verifyKeyResponse(response, key, incrementedNonce);
        if (!response?.publicKey || !verified) {
            if (tab && page.tabs[tab.id]) {
                keepass.handleError(tab, kpErrors.KEY_CHANGE_FAILED);
            }

            keepass.updateDatabaseHashToContent();
            return false;
        }

        keepass.serverPublicKey = nacl.util.decodeBase64(response.publicKey);
        keepass.isKeePassXCAvailable = true;
        console.log(`${EXTENSION_NAME}: Server public key: ${nacl.util.encodeBase64(keepass.serverPublicKey)}`);
        return true;
    } catch (err) {
        logError(`changePublicKeys failed: ${err}`);
        return false;
    }
};

protocol.createCredentials = async function(tab, args = []) {
    const [ username, password, url, group, groupUuid ] = args;
    return protocol.updateCredentials(tab, [ null, username, password, url, group, groupUuid ]);
};

protocol.createNewGroup = async function(tab, args = []) {
    if (!keepass.isConnected) {
        return [];
    }

    keepass.clearErrorMessage(tab);

    const [ groupName ] = args;

    const messageData = {
        action: kpActions.CREATE_NEW_GROUP,
        groupName: groupName,
        keys: protocol.getCurrentKey()
    };

    try {
        // TODO: Handle errors
        const response = await protocolClient.sendMessage(tab, messageData);
        if (response) {
            keepass.updateLastUsed(keepass.databaseHash); // TODO: Remove?
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

protocol.generatePassword = async function(tab, args = []) {
    if (!keepass.isConnected) {
        return undefined;
    }

    if (!keepass.compareVersion(keepass.requiredKeePassXC, keepass.currentKeePassXC)) {
        return undefined;
    }

    const messageData = {
        action: kpActions.GENERATE_PASSWORD,
    };

    try {
        const response = await protocolClient.sendMessage(tab, messageData);
        if (response) {
            if (response.error && response.errorCode) {
                keepass.handleError(tab, response.errorCode);
                return undefined;
            }

            const password = response.entries ?? response.password;
            keepass.updateLastUsed(keepass.databaseHash); // TODO: Remove?
            return password;
        } else {
            logError('generatePassword rejected');
        }

        return undefined;
    } catch (err) {
        logError(`generatePassword failed: ${err}`);
        return undefined;
    }
};

protocol.getCredentials = async function(tab, args = []) {
    if (!keepass.isConnected) {
        return [];
    }

    keepass.clearErrorMessage(tab);

    const [ url, submiturl, triggerUnlock = false, httpAuth = false ] = args;
    let entries = [];

    const messageData = {
        action: kpActions.GET_CREDENTIALS,
        keys: protocol.getKeys(),
        url: url
    };

    if (submiturl) {
        messageData.submitUrl = submiturl;
    }

    if (httpAuth) {
        messageData.httpAuth = true;
    }

    try {
        const response = await protocolClient.sendMessage(tab, messageData, false, triggerUnlock);
        if (response) {
            if (response.error && response.errorCode) {
                keepass.handleError(tab, response.errorCode);
                return [];
            }

            entries = keepass.removeDuplicateEntries(response.entries);
            keepass.updateLastUsed(keepass.databaseHash); // TODO: Remove?

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
        logError(`getCredentials failed: ${err}`);
        return [];
    }
};

protocol.getDatabaseGroups = async function(tab, args = []) {
    if (!keepass.isConnected) {
        return [];
    }

    keepass.clearErrorMessage(tab);

    let groups = [];

    const messageData = {
        action: kpActions.GET_DATABASE_GROUPS,
        keys: protocol.getCurrentKey()
    };

    try {
        const response = await protocolClient.sendMessage(tab, messageData);
        if (response) {
            if (response.error && response.errorCode) {
                keepass.handleError(tab, response.errorCode);
                return [];
            }

            groups = response.groups;
            groups.defaultGroup = page.settings.defaultGroup;
            groups.defaultGroupAlwaysAsk = page.settings.defaultGroupAlwaysAsk;
            keepass.updateLastUsed(keepass.databaseHash); // TODO: Remove?
            return groups;
        }

        browserAction.showDefault(tab);
        return [];
    } catch (err) {
        logError(`getDatabaseGroups failed: ${err}`);
        return [];
    }
};

protocol.getDatabaseStatuses = async function(tab, args = []) {
    if (!keepass.isKeePassXCAvailable) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return;
    }

    if (!keepass.serverPublicKey) {
        await protocol.changePublicKeys(tab);
    }

    const [ enableTimeout = false, triggerUnlock = false ] = args;

    const messageData = {
        action: kpActions.GET_DATABASE_STATUSES,
        keys: protocol.getKeys()
    };

    try {
        const response = await protocolClient.sendMessage(tab, messageData, enableTimeout, triggerUnlock);
        if (response) {
            keepass.databaseHash = response?.hash;

            // Return this error only if all databases are closed
            if (response?.statuses.every(s => s.locked)) {
                keepass.databaseHash = '';
                keepass.isDatabaseClosed = true;
                keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
            }

            return response;
        }

        keepass.handleError(tab, kpErrors.ACTION_TIMEOUT);
    } catch (err) {
        logError(`getDatabaseStatuses failed: ${err}`);
    }
};

protocol.getTotp = async function(tab, args = []) {
    if (!keepass.isConnected) {
        return [];
    }

    const messageData = {
        action: kpActions.GET_TOTP,
        keys: protocol.getKeys(),
        uuids: args
    };

    try {
        const response = await protocolClient.sendMessage(tab, messageData);
        if (response) {
            keepass.updateLastUsed(keepass.databaseHash);
            return response.totpList;
        }

        return;
    } catch (err) {
        logError(`getTotp failed: ${err}`);
    }
};

protocol.lockDatabase = async function(tab, args = []) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const messageData = {
        action: kpActions.LOCK_DATABASE
    };

    try {
        const response = await protocolClient.sendMessage(tab, messageData);
        if (response) {
            //keepass.isDatabaseClosed = true; // ?
            keepass.updateDatabase();

            // Display error message in the popup
            keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
            return true;
        } else {
            //keepass.isDatabaseClosed = true; // ?
        }

        return false;
    } catch (err) {
        logError(`lockDatabase failed: ${err}`);
        return false;
    }
};

protocol.requestAutotype = async function(tab, args = []) {
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return false;
    }

    const messageData = {
        action: kpActions.REQUEST_AUTOTYPE,
        search: getTopLevelDomainFromUrl(args[0])
    };

    try {
        const response = await protocolClient.sendMessage(tab, messageData);
        return response?.result;
    } catch (err) {
        logError(`requestAutotype failed: ${err}`);
        return false;
    }
};

protocol.testAssociationFromDatabaseStatuses = async function(tab, args = []) {
    const databaseStatuses = await protocol.getDatabaseStatuses(tab, args);
    console.log(databaseStatuses);
    if (!databaseStatuses) {
        return {};
    }

    const result = {
        areAllLocked: true,
        associationNeeded: false,
        databaseHash: undefined,
        isAnyAssociated: false
    };

    if (!databaseStatuses || databaseStatuses.statuses.length === 0) {
        keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
        return result;
    }

    const currentDatabaseStatus = databaseStatuses.statuses.filter(s => s.hash === databaseStatuses.hash);
    const isCurrentAssociated = currentDatabaseStatus[0]?.associated;
    const isCurrentLocked = currentDatabaseStatus[0]?.locked;

    const isAnyAssociated = databaseStatuses.statuses.some(s => s.associated);
    const areAllLocked = databaseStatuses.statuses.every(s => s.locked);

    // TODO: Add a warning notification if two databases with identical hashes are regognized.
    //       To where? DOM? KeePassXC? Popup? Maybe this feature should be in KeePassXC instead when making the request and not here.
    if (currentDatabaseStatus.length > 1) {
        console.log('Identical databases found.');
    }

    // TODO: If the current one is not associated, activate the Connect button in the popup?
    //       But only if the current database is not locked..
    if (!isCurrentAssociated && !isCurrentLocked) {
        console.log('Current one is not associated');
    }

    // Current association status
    keepass.associated.hash = currentDatabaseStatus[0]?.hash;
    keepass.associated.value = isCurrentAssociated;

    // This should be true only if all databases are locked
    keepass.isDatabaseClosed = areAllLocked; // ?

    result.areAllLocked = areAllLocked;
    result.associationNeeded = !isCurrentAssociated && !isCurrentLocked;
    result.databaseHash = databaseStatuses.hash;
    result.isAnyAssociated = isAnyAssociated;

    keepass.databaseStatuses = databaseStatuses;
    keepass.databaseAssociationStatuses = result;
    return result;
};

protocol.updateCredentials = async function(tab, args = []) {
    if (!keepass.isConnected) {
        return [];
    }

    const [ entryId, username, password, url, group, groupUuid ] = args;

    const messageData = {
        action: kpActions.CREATE_CREDENTIALS,
        keys: protocol.getCurrentKey(),
        login: username,
        password: password,
        submitUrl: url,
        url: url,
    };

    if (entryId) {
        messageData.uuid = entryId;
    }

    if (!entryId && page.settings.downloadFaviconAfterSave) {
        messageData.downloadFavicon = true;
    }

    if (group && groupUuid) {
        messageData.group = group;
        messageData.groupUuid = groupUuid;
    }

    try {
        const response = await protocolClient.sendMessage(tab, messageData);
        if (response) {
            if (response?.result === true) {
                return entryId ? AddCredentials.UPDATED : AddCredentials.CREATED;
            }

            return AddCredentials.CANCELED;
        } else {
            return AddCredentials.ERROR;
        }
    } catch (err) {
        logError(`updateCredentials failed: ${err}`);
        return [];
    }
};

//--------------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------------

protocol.getKeys = function() {
    const keys = [];

    for (const keyHash in keepass.keyRing) {
        keys.push({
            id: keepass.keyRing[keyHash].id,
            key: keepass.keyRing[keyHash].key
        });
    }

    return keys;
};

// Gets the key only from the current active database
protocol.getCurrentKey = function() {
    const [ id, key ] = keepass.getCryptoKey();
    return [
        {
            id: id,
            key: key
        }
    ];
};
