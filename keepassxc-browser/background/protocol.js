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

        const kpAction = kpActions.ASSOCIATE;
        const key = nacl.util.encodeBase64(keepass.keyPair.publicKey);
        const idKeyPair = nacl.box.keyPair();
        const idKey = nacl.util.encodeBase64(idKeyPair.publicKey);

        const messageData = {
            action: kpAction,
            key: key,
            idKey: idKey
        };

        const response = await protocolClient.sendMessage(kpAction, tab, messageData, false, true);
        if (response && response.id && response.hash) {
            keepass.setCryptoKey(response.id, key); // Save the new identification public key as id key for the database

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

protocol.changePublicKeys = async function(tab, enableTimeout = false, connectionTimeout) {
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
        clientID: keepass.clientID,
        requestID: keepassClient.getRequestId()
    };

    try {
        const response = await protocolClient.sendNativeMessage(kpAction, request, enableTimeout, connectionTimeout);
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

    const kpAction = kpActions.CREATE_NEW_GROUP;
    const [ groupName ] = args;
    const [ dbid ] = keepass.getCryptoKey();

    const messageData = {
        action: kpAction,
        id: dbid,
        groupName: groupName,
    };

    try {
        // TODO: Handle errors
        const response = await protocolClient.sendMessage(kpAction, tab, messageData);
        if (response) {
            keepass.updateLastUsed(keepass.databaseHash); // ?
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
        return [];
    }

    if (!keepass.compareVersion(keepass.requiredKeePassXC, keepass.currentKeePassXC)) {
        return [];
    }

    const kpAction = kpActions.GENERATE_PASSWORD;
    let password;

    const messageData = {
        action: kpAction,
        clientID: keepass.clientID,
        requestID: keepassClient.getRequestId() // Needed?
    };

    try {
        const response = await protocolClient.sendMessage(kpAction, tab, messageData);
        if (response) {
            password = response.entries ?? response.password;
            keepass.updateLastUsed(keepass.databaseHash); // ?
        } else {
            logError('generatePassword rejected');
        }

        return password;
    } catch (err) {
        logError(`generatePassword failed: ${err}`);
        return [];
    }
};

protocol.getCredentials = async function(tab, args = []) {
    if (!keepass.isConnected) {
        return [];
    }

    keepass.clearErrorMessage(tab);

    const kpAction = kpActions.GET_CREDENTIALS;
    const [ url, submiturl, triggerUnlock = false, httpAuth = false ] = args;
    let entries = [];

    const messageData = {
        action: kpAction,
        url: url,
        keys: protocol.getKeys()
    };

    if (submiturl) {
        messageData.submitUrl = submiturl;
    }

    if (httpAuth) {
        messageData.httpAuth = 'true';
    }

    try {
        // TODO: Handle errors
        const response = await protocolClient.sendMessage(kpAction, tab, messageData, false, triggerUnlock);
        if (response) {
            entries = keepass.removeDuplicateEntries(response.entries);
            keepass.updateLastUsed(keepass.databaseHash); // What about this?

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

protocol.getDatabaseGroups = async function(tab, args = []) {
    if (!keepass.isConnected) {
        return [];
    }

    keepass.clearErrorMessage(tab);

    const kpAction = kpActions.GET_DATABASE_GROUPS;
    const [ dbid ] = keepass.getCryptoKey();
    let groups = [];

    const messageData = {
        action: kpAction,
        id: dbid
    };

    try {
        // TODO: Handle errors
        const response = await protocolClient.sendMessage(kpAction, tab, messageData);
        if (response) {
            groups = response.groups;
            groups.defaultGroup = page.settings.defaultGroup;
            groups.defaultGroupAlwaysAsk = page.settings.defaultGroupAlwaysAsk;
            keepass.updateLastUsed(keepass.databaseHash); // ?
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
    if (!keepass.isConnected) {
        keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        return;
    }

    if (!keepass.serverPublicKey) {
        await protocol.changePublicKeys(tab);
    }

    const kpAction = kpActions.GET_DATABASE_STATUSES;
    const [ enableTimeout = false, triggerUnlock = false ] = args;

    const messageData = {
        action: kpAction,
        keys: protocol.getKeys()
    };

    try {
        const response = await protocolClient.sendMessage(kpAction, tab, messageData, enableTimeout, triggerUnlock);
        if (response) {
            keepass.databaseHash = response.hash;

            // Return this error only if all databases are closed
            if (response?.statuses.every(s => s.locked)) {
                keepass.databaseHash = '';
                keepass.isDatabaseClosed = true;
                keepass.handleError(tab, kpErrors.DATABASE_NOT_OPENED);
            }

            return response;
        }

        // TODO: Check if these are even possible ..?
        keepass.databaseHash = '';
        keepass.isDatabaseClosed = true;
        if (response.message && response.message === '') {
            // ..?
            keepass.isKeePassXCAvailable = false;
            keepass.handleError(tab, kpErrors.TIMEOUT_OR_NOT_CONNECTED);
        } else {
            keepass.handleError(tab, response.errorCode, response.error);
        }
    } catch (err) {
        logError(`getDatabaseStatuses failed: ${err}`);
    }
};

protocol.getTotp = async function(tab, args = []) {
    if (!keepass.isConnected) {
        return [];
    }

    const kpAction = kpActions.GET_TOTP;
    const [ uuid, oldTotp ] = args;
    if (!keepass.compareVersion('2.6.1', keepass.currentKeePassXC, true)) {
        return oldTotp;
    }

    const messageData = {
        action: kpAction,
        uuid: uuid
    };

    try {
        const response = await protocolClient.sendMessage(kpAction, tab, messageData);
        if (response) {
            keepass.updateLastUsed(keepass.databaseHash);
            return response.totp;
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

    const kpAction = kpActions.LOCK_DATABASE;
    const messageData = {
        action: kpAction
    };

    try {
        const response = await protocolClient.sendMessage(kpAction, tab, messageData);
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

    const kpAction = kpActions.REQUEST_AUTOTYPE;
    const search = getTopLevelDomainFromUrl(args[0]);

    const messageData = {
        action: kpAction,
        search: search
    };

    try {
        const response = await protocolClient.sendMessage(kpAction, tab, messageData);
        return response?.result;
    } catch (err) {
        logError(`requestAutotype failed: ${err}`);
        return false;
    }
};

protocol.testAssociationFromDatabaseStatuses = async function(tab, args = []) {
    const databaseStatuses = await protocol.getDatabaseStatuses(tab, args);
    console.log(databaseStatuses);

    const result = {
        areAllLocked: true,
        associationNeeded: false,
        databaseHash: undefined,
        isAnyAssociated: false
    };

    // TODO: Handle this already in getDatabaseStatuses?
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

    // This should be true only if all databases are locked
    keepass.isDatabaseClosed = areAllLocked; // ?

    result.areAllLocked = areAllLocked;
    result.associationNeeded = !isCurrentAssociated && !isCurrentLocked;
    result.databaseHash = databaseStatuses.hash;
    result.isAnyAssociated = isAnyAssociated;

    keepass.databaseAssosiationStatuses = result;
    return result;
};

protocol.updateCredentials = async function(tab, args = []) {
    console.log('update-credentials');

    if (!keepass.isConnected) {
        return [];
    }

    const kpAction = kpActions.CREATE_CREDENTIALS;
    const [ entryId, username, password, url, group, groupUuid ] = args;
    const [ dbid ] = keepass.getCryptoKey();

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
        messageData.downloadFavicon = true;
    }

    if (group && groupUuid) {
        messageData.group = group;
        messageData.groupUuid = groupUuid;
    }

    try {
        // TODO: Check response messages
        const response = await protocolClient.sendMessage(kpAction, tab, messageData);
        if (response) {
            // KeePassXC versions lower than 2.5.0 will have an empty parsed.error
            let successMessage = response.error;
            if (response?.result === true || response.error === '') {
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
