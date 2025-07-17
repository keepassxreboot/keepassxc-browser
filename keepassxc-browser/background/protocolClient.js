'use strict';

const protocolBuffer = {
    buffer: [],

    addMessage(message) {
        this.buffer.push(message);
    },

    // Returns corresponding message from the response. If the response is an error,
    // return the first matching action from the buffer.
    getMessage(response) {
        const isError = Boolean(!response.nonce && response.error && response.errorCode);
        return this.buffer.find(message => {
            if (message.request.requestID === response.requestID
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
class ProtocolMessage {
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
                    // The error is action timeout if action is not change-public-keys
                    let error = kpErrors.ACTION_TIMEOUT;
                    if (request.action === kpActions.CHANGE_PUBLIC_KEYS) {
                        error = kpErrors.TIMEOUT_OR_NOT_CONNECTED;
                        keepass.isKeePassXCAvailable = false;
                    }

                    resolve({
                        action: request.action,
                        error: kpErrors.getError(error),
                        errorCode: error
                    });
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
// Protocol V2
//--------------------------------------------------------------------------

const protocolClient = {};
protocolClient.keySize = 24;
protocolClient.messageTimeout = 500; // Milliseconds
protocolClient.nativeHostName = 'org.keepassxc.keepassxc_browser';
protocolClient.nativePort = null;

protocolClient.sendNativeMessage = async function(request, enableTimeout = false, timeoutValue = protocolClient.messageTimeout) {
    if (!protocolClient.nativePort) {
        logError('No native messaging port defined.');
        return;
    }

    const message = new ProtocolMessage(request, enableTimeout, timeoutValue);
    await navigator.locks.request('messageBuffer', async (lock) => {
        protocolBuffer.addMessage(message);
    });

    protocolClient.nativePort.postMessage(request);

    const response = await message.promise;

    // Remove a timeouted message
    if (response.error && response?.errorCode === kpErrors.TIMEOUT_OR_NOT_CONNECTED) {
        protocolBuffer.matchAndRemove(message);
    }

    return response;
};

protocolClient.sendMessage = async function(tab, messageData, enableTimeout = false, triggerUnlock = false) {
    const nonce = protocolClient.getNonce();
    const encryptedMessage = protocolClient.encrypt(messageData, nonce);
    const request = protocolClient.buildRequest(encryptedMessage, nonce, keepass.clientID, triggerUnlock);
    const response = await protocolClient.sendNativeMessage(request, enableTimeout);
    const incrementedNonce = protocolClient.incrementedNonce(nonce);

    return protocolClient.handleResponse(response, incrementedNonce, request.requestID, tab);
};

protocolClient.buildRequest = function(encryptedMessage, nonce, clientID, triggerUnlock = false) {
    const request = {
        message: encryptedMessage,
        nonce: nonce,
        clientID: clientID,
        requestID: protocolClient.getRequestId()
    };

    if (triggerUnlock) {
        request.triggerUnlock = true;
    }

    return request;
};

protocolClient.handleNativeMessage = async function(response) {
    // Parse through the message buffer to find the corresponding Promise.
    await navigator.locks.request('messageBuffer', async (lock) => {
        const message = protocolBuffer.getMessage(response);
        if (message) {
            message.resolve(response);
            protocolBuffer.removeMessage(message);
            return;
        }

        debugLogMessage('Corresponding request not found in the message buffer for response: ', response);
    });
};

// Verifies nonces, decrypts and parses the response
protocolClient.handleResponse = function(response, incrementedNonce, requestID, tab) {
    if (response.message && protocolClient.verifyNonce(response, incrementedNonce)) {
        const res = protocolClient.decrypt(response.message, response.nonce);
        if (!res) {
            keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
            protocolBuffer.matchAndRemove({ requestID: requestID });
            return undefined;
        }

        const message = nacl.util.encodeUTF8(res);
        const parsed = JSON.parse(message);
        return parsed;
    } else if (response.error && response.errorCode) {
        keepass.handleError(tab, response.errorCode, response.error);
        protocolBuffer.matchAndRemove({ requestID: requestID });
    }

    return undefined;
};

protocolClient.verifyNonce = function(response, nonce) {
    if (!response.nonce) {
        logError('No nonce in response');
        return false;
    }

    if (!protocolClient.checkNonceLength(response.nonce)) {
        logError('Incorrect nonce length');
        return false;
    }

    if (response.nonce !== nonce) {
        logError('Nonce compare failed');
        return false;
    }

    return true;
};

//--------------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------------

protocolClient.getNonce = function() {
    return nacl.util.encodeBase64(nacl.randomBytes(protocolClient.keySize));
};

// Creates a random 8 character string for Request ID
protocolClient.getRequestId = function() {
    return Math.random().toString(16).substring(2, 10);
};

protocolClient.incrementedNonce = function(nonce) {
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

protocolClient.getNonces = function() {
    const nonce = protocolClient.getNonce();
    const incrementedNonce = protocolClient.incrementedNonce(nonce);
    return [ nonce, incrementedNonce ];
};

protocolClient.checkNonceLength = function(nonce) {
    return nacl.util.decodeBase64(nonce).length === nacl.secretbox.nonceLength;
};

protocolClient.generateNewKeyPair = function() {
    keepass.keyPair = nacl.box.keyPair();
};

protocolClient.getPublicConnectionKey = function() {
    return nacl.util.encodeBase64(keepass.keyPair.publicKey);
};

protocolClient.generateIdKey = function() {
    const idKeyPair = nacl.box.keyPair();
    return nacl.util.encodeBase64(idKeyPair.publicKey);
};

protocolClient.generateClientId = function() {
    return nacl.util.encodeBase64(nacl.randomBytes(protocolClient.keySize));
};

//--------------------------------------------------------------------------
// Encrypt/Decrypt
//--------------------------------------------------------------------------

protocolClient.encrypt = function(input, nonce) {
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

protocolClient.decrypt = function(input, nonce) {
    const m = nacl.util.decodeBase64(input);
    const n = nacl.util.decodeBase64(nonce);
    const res = nacl.box.open(m, n, keepass.serverPublicKey, keepass.keyPair.secretKey);
    return res;
};

//--------------------------------------------------------------------------
// Native Messaging related
//--------------------------------------------------------------------------

protocolClient.connectToNative = function() {
    if (protocolClient.nativePort) {
        protocolClient.nativePort.disconnect();
    }
    protocolClient.nativeConnect();
};

protocolClient.nativeConnect = function() {
    console.log(`${EXTENSION_NAME}: Connecting to native messaging host ${protocolClient.nativeHostName}`);
    protocolClient.nativePort = browser.runtime.connectNative(protocolClient.nativeHostName);
    protocolClient.nativePort.onMessage.addListener(protocolClient.onNativeMessage);
    protocolClient.nativePort.onDisconnect.addListener(onDisconnected);
    keepass.isConnected = true;
    return protocolClient.nativePort;
};

function onDisconnected() {
    protocolClient.nativePort = null;
    keepass.isConnected = false;
    keepass.isDatabaseClosed = true;
    keepass.isKeePassXCAvailable = false;
    keepass.associated.value = false;
    keepass.associated.hash = null;
    keepass.databaseHash = '';

    page.clearAllLogins();
    keepass.updatePopup();
    keepass.updateDatabaseHashToContent();
    logError(`Failed to connect: ${(browser.runtime.lastError === null ? 'Unknown error' : browser.runtime.lastError.message)}`);
}

protocolClient.onNativeMessage = function(response) {
    // Handle database lock/unlock status
    if (response.action === kpActions.DATABASE_LOCKED || response.action === kpActions.DATABASE_UNLOCKED) {
        keepass.updateDatabase();
    }

    // Generic response handling
    if (response.action === kpActions.CHANGE_PUBLIC_KEYS || !keepass.protocolV2) {
        keepassClient.handleNativeMessage(response);
    } else {
        protocolClient.handleNativeMessage(response);
    }
};
