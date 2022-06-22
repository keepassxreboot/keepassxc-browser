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

const messageBuffer = {
    buffer: [],

    addMessage(msg) {
        if (!this.buffer.includes(msg)) {
            this.buffer.push(msg);
        }
    },

    matchAndRemove(msg) {
        for (let i = 0; i < this.buffer.length; ++i) {
            if (msg.nonce && msg.nonce === keepassClient.incrementedNonce(this.buffer[i].nonce)) {
                this.buffer.splice(i, 1);
                return true;
            }
        }

        return false;
    }
};

//--------------------------------------------------------------------------
// Messaging
//--------------------------------------------------------------------------

keepassClient.sendNativeMessage = function(request, enableTimeout = false, timeoutValue) {
    return new Promise((resolve, reject) => {
        let timeout;
        const requestAction = request.action;
        const ev = keepassClient.nativePort.onMessage;

        const listener = ((port, action) => {
            const handler = (msg) => {
                if (msg && msg.action === action) {
                    // If the request has a separate requestID, check if it matches when there's no nonce (an error message)
                    const isNotificationOrError = !msg.nonce && request.requestID === msg.requestID;

                    // Only resolve a matching response or a notification (without nonce)
                    if (isNotificationOrError || messageBuffer.matchAndRemove(msg)) {
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

        const messageTimeout = timeoutValue || keepassClient.messageTimeout;

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
        if (keepassClient.nativePort) {
            keepassClient.nativePort.postMessage(request);
        }
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
        request["requestID"] = messageData.requestID;
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
    }
};
