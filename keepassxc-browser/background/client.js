'use strict';

const keepassClient = {};
keepassClient.keySize = 24;
keepassClient.messageTimeout = 500; // Milliseconds
keepassClient.nativeHostName = 'org.keepassxc.keepassxc_browser';
keepassClient.nativePort = null;

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
    },

    getError(errorCode) {
        return this.errorMessages[errorCode].msg;
    }
};

const messageBuffer = {
    buffer: [],

    addMessage(message) {
        this.buffer.push(message);
    },

    // Returns corresponding message from the response. If the response is an error,
    // return the first matching action from the buffer.
    getMessage(response) {
        const isError = Boolean(!response.nonce && response.error && response.errorCode);
        return this.buffer.find(message => {
            if (keepassClient.incrementedNonce(message.request.nonce) === response.nonce
                || (isError && message.request?.action === response?.action)) {
                // Cancel timeout
                if (message.enableTimeout) {
                    message.cancelTimeout();
                }

                return message;
            }
        });
    },

    removeMessage(message) {
        const index = this.buffer.indexOf(message);
        if (index >= 0 && index < this.buffer.length) {
            this.buffer.splice(index, 1);
        }
    },
};

// Basic class for a message to be sent. The Promise inside the class will be resolved when
// the response to the message is received.
class Message {
    constructor(request, enableTimeout, timeoutValue) {
        this.enableTimeout = enableTimeout;
        this.request = request;
        this.timeout = undefined;

        this.promise = new Promise((resolve, reject) => {
            this.reject = reject;
            this.resolve = resolve;

            const messageTimeout = timeoutValue || keepassClient.messageTimeout;

            // Handle timeout
            if (this.enableTimeout) {
                this.timeout = setTimeout(() => {
                    const errorMessage = {
                        action: request.action,
                        error: kpErrors.getError(kpErrors.TIMEOUT_OR_NOT_CONNECTED),
                        errorCode: kpErrors.TIMEOUT_OR_NOT_CONNECTED
                    };

                    keepass.isKeePassXCAvailable = false;
                    resolve(errorMessage);
                }, messageTimeout);
            }
        });
    }

    cancelTimeout() {
        this.enableTimeout = false;
        clearTimeout(this.timeout);
    }
}

//--------------------------------------------------------------------------
// Messaging
//--------------------------------------------------------------------------

keepassClient.sendNativeMessage = async function(request, enableTimeout = false, timeoutValue) {
    if (!keepassClient.nativePort) {
        logError('No native messaging port defined.');
        return;
    }

    const message = new Message(request, enableTimeout, timeoutValue);
    await navigator.locks.request('messageBuffer', async (lock) => {
        messageBuffer.addMessage(message);
    });

    keepassClient.nativePort.postMessage(request);

    const response = await message.promise;

    // Remove a timeouted message
    if (response.error && response?.errorCode === kpErrors.TIMEOUT_OR_NOT_CONNECTED) {
        messageBuffer.removeMessage(message);
    }

    return response;
};

keepassClient.handleNativeMessage = async function(response) {
    // Parse through the message buffer to find the corresponding Promise.
    await navigator.locks.request('messageBuffer', async (lock) => {
        const message = messageBuffer.getMessage(response);
        if (message) {
            message.resolve(response);
            messageBuffer.removeMessage(message);
            return;
        }

        debugLogMessage('Corresponding request not found in the message buffer for response: ', response);
    });
};

keepassClient.handleResponse = function(response, incrementedNonce, tab) {
    if (response.message && response.nonce) {
        const res = keepassClient.decrypt(response.message, response.nonce);
        if (!res) {
            keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
            return undefined;
        }

        const message = nacl.util.encodeUTF8(res);
        const parsed = JSON.parse(message);

        if (keepassClient.verifyResponse(parsed, incrementedNonce)) {
            return parsed;
        }
    } else if (response.error && response.errorCode) {
        keepass.handleError(tab, response.errorCode, response.error);
    }

    return undefined;
};

keepassClient.buildRequest = function(action, encrypted, nonce, clientID, triggerUnlock = false) {
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

keepassClient.sendMessage = async function(kpAction, tab, messageData, nonce, enableTimeout = false, triggerUnlock = false) {
    const request = keepassClient.buildRequest(kpAction, keepassClient.encrypt(messageData, nonce), nonce, keepass.clientID, triggerUnlock);
    if (messageData.requestID) {
        request['requestID'] = messageData.requestID;
    }

    const response = await keepassClient.sendNativeMessage(request, enableTimeout);
    const incrementedNonce = keepassClient.incrementedNonce(nonce);

    return keepassClient.handleResponse(response, incrementedNonce, tab);
};

//--------------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------------

keepassClient.getNonce = function() {
    return nacl.util.encodeBase64(nacl.randomBytes(keepassClient.keySize));
};

// Creates a random 8 character string for Request ID
keepassClient.getRequestId = function() {
    return Math.random().toString(16).substring(2, 10);
};

keepassClient.incrementedNonce = function(nonce) {
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

keepassClient.getNonces = function() {
    const nonce = keepassClient.getNonce();
    const incrementedNonce = keepassClient.incrementedNonce(nonce);
    return [ nonce, incrementedNonce ];
};

keepassClient.verifyKeyResponse = function(response, key, nonce) {
    if (!response.success || !response.publicKey) {
        keepass.associated.hash = null;
        return false;
    }

    if (!keepassClient.checkNonceLength(response.nonce)) {
        logError('Invalid nonce length.');
        return false;
    }

    const reply = (response.nonce === nonce);
    if (response.publicKey && reply) {
        keepass.serverPublicKey = nacl.util.decodeBase64(response.publicKey);
        return true;
    }

    return reply;
};

keepassClient.verifyResponse = function(response, nonce, id) {
    keepass.associated.value = response.success;
    if (response.success !== 'true') {
        keepass.associated.hash = null;
        return false;
    }

    keepass.associated.hash = keepass.databaseHash;

    if (!keepassClient.checkNonceLength(response.nonce)) {
        return false;
    }

    keepass.associated.value = (response.nonce === nonce);
    if (keepass.associated.value === false) {
        logError('Nonce compare failed');
        return false;
    }

    if (id) {
        keepass.associated.value = (keepass.associated.value && id === response.id);
    }

    keepass.associated.hash = (keepass.associated.value) ? keepass.databaseHash : null;
    return keepass.isAssociated();
};

keepassClient.verifyDatabaseResponse = function(response, nonce) {
    if (response.success !== 'true') {
        keepass.associated.hash = null;
        return false;
    }

    if (!keepassClient.checkNonceLength(response.nonce)) {
        logError('Invalid nonce length.');
        return false;
    }

    if (response.nonce !== nonce) {
        logError('Nonce compare failed.');
        return false;
    }

    keepass.associated.hash = response.hash;
    return response.hash !== '' && response.success === 'true';
};

keepassClient.checkNonceLength = function(nonce) {
    return nacl.util.decodeBase64(nonce).length === nacl.secretbox.nonceLength;
};

keepassClient.encrypt = function(input, nonce) {
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

keepassClient.decrypt = function(input, nonce) {
    const m = nacl.util.decodeBase64(input);
    const n = nacl.util.decodeBase64(nonce);
    const res = nacl.box.open(m, n, keepass.serverPublicKey, keepass.keyPair.secretKey);
    return res;
};

//--------------------------------------------------------------------------
// Native Messaging related
//--------------------------------------------------------------------------

keepassClient.connectToNative = function() {
    if (keepassClient.nativePort) {
        keepassClient.nativePort.disconnect();
    }
    keepassClient.nativeConnect();
};

keepassClient.nativeConnect = function() {
    console.log(`${EXTENSION_NAME}: Connecting to native messaging host ${keepassClient.nativeHostName}`);
    keepassClient.nativePort = browser.runtime.connectNative(keepassClient.nativeHostName);
    keepassClient.nativePort.onMessage.addListener(keepassClient.onNativeMessage);
    keepassClient.nativePort.onDisconnect.addListener(onDisconnected);
    keepass.isConnected = true;
    return keepassClient.nativePort;
};

function onDisconnected() {
    keepassClient.nativePort = null;
    keepass.isConnected = false;
    keepass.isDatabaseClosed = true;
    keepass.isKeePassXCAvailable = false;
    keepass.associated.value = false;
    keepass.associated.hash = null;
    keepass.databaseHash = '';

    page.clearAllLogins();
    keepass.updatePopup('cross');
    keepass.updateDatabaseHashToContent();
    logError(`Failed to connect: ${(browser.runtime.lastError === null ? 'Unknown error' : browser.runtime.lastError.message)}`);
}

keepassClient.onNativeMessage = function(response) {
    // Handle database lock/unlock status
    if (response.action === kpActions.DATABASE_LOCKED || response.action === kpActions.DATABASE_UNLOCKED) {
        keepass.updateDatabase();
        return;
    }

    // Generic response handling
    keepassClient.handleNativeMessage(response);
};
