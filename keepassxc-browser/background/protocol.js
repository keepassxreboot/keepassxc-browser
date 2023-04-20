'use strict';

const protocol = {};

protocol.associate = async function(tab, args = []) {
    console.log('associate');

    if (!keepass.isKeePassXCAvailable) {
        return AssociatedAction.NOT_ASSOCIATED;
    }

    try {
        keepass.clearErrorMessage(tab);

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

        const response = await keepassClient.sendMessageV2(kpAction, tab, messageData, nonce, false, true);
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
    console.log('change-public-keys');

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
        const response = await keepassClient.sendNativeMessageV2(kpAction, request, enableTimeout, connectionTimeout);
        keepass.setcurrentKeePassXCVersion(response.version);

        const verified = keepass.protocolV2
            ? keepassClient.verifyResponseV2(response, incrementedNonce)
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
    console.log('create-credentials');

    const [ username, password, url, group, groupUuid ] = args;
    return protocol.updateCredentials(tab, [ null, username, password, url, group, groupUuid ]);
};

protocol.createNewGroup = async function(tab, args = []) {
    console.log('create-new-group');

    if (!keepass.isConnected) {
        return [];
    }

    keepass.clearErrorMessage(tab);

    const [ groupName ] = args;
    const kpAction = kpActions.CREATE_NEW_GROUP;
    const nonce = keepassClient.getNonce();

    const messageData = {
        action: kpAction,
        groupName: groupName
    };

    try {
        // TODO: Handle errors
        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
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
    console.log('generate-password');

    if (!keepass.isConnected) {
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

    try {
        const response = await keepassClient.sendMessage(kpAction, tab, messageData, nonce);
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
    console.log('get-credentials');

    if (!keepass.isConnected) {
        return [];
    }

    keepass.clearErrorMessage(tab);

    const [ url, submiturl, triggerUnlock = false, httpAuth = false ] = args;
    let entries = [];
    const kpAction = kpActions.GET_CREDENTIALS;
    const nonce = keepassClient.getNonce();
    const [ dbid ] = keepass.getCryptoKey();

    const messageData = {
        action: kpAction,
        id: dbid,
        url: url,
        keys: keepass.getKeys()
    };

    if (submiturl) {
        messageData.submitUrl = submiturl;
    }

    if (httpAuth) {
        messageData.httpAuth = 'true';
    }

    try {
        // TODO: Handle errors
        const response = await keepassClient.sendMessageV2(kpAction, tab, messageData, nonce, false, triggerUnlock);
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
    console.log('get-database-groups');

    if (!keepass.isConnected) {
        return [];
    }

    keepass.clearErrorMessage(tab);

    let groups = [];
    const kpAction = kpActions.GET_DATABASE_GROUPS;
    const nonce = keepassClient.getNonce();

    const messageData = {
        action: kpAction
    };

    try {
        // TODO: Handle errors
        const response = await keepassClient.sendMessageV2(kpAction, tab, messageData, nonce);
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

// Obsolete? This should be checked inside KeePassXC
protocol.getDatabaseStatuses = async function(tab, args = []) {
    console.log('get-database-statuses');
};

protocol.getTotp = async function(tab, args = []) {
    console.log('get-totp');

    if (!keepass.isConnected) {
        return [];
    }

    const [ uuid, oldTotp ] = args;
    if (!keepass.compareVersion('2.6.1', keepass.currentKeePassXC, true)) {
        return oldTotp;
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

protocol.lockDatabase = async function(tab, args = []) {
    console.log('lock-database');

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
        const response = await keepassClient.sendMessageV2(kpAction, tab, messageData, nonce);
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
    console.log('request-autotype');

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
        const response = await keepassClient.sendMessageV2(kpAction, tab, messageData, nonce);
        return response?.result;
    } catch (err) {
        logError(`requestAutotype failed: ${err}`);
        return false;
    }
};

protocol.updateCredentials = async function(tab, args = []) {
    console.log('update-credentials');

    if (!keepass.isConnected) {
        return [];
    }

    const [ entryId, username, password, url, group, groupUuid ] = args;
    const kpAction = kpActions.CREATE_CREDENTIALS;
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
        messageData.downloadFavicon = true;
    }

    if (group && groupUuid) {
        messageData.group = group;
        messageData.groupUuid = groupUuid;
    }

    try {
        // TODO: Check response messages
        const response = await keepassClient.sendMessageV2(kpAction, tab, messageData, nonce);
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
