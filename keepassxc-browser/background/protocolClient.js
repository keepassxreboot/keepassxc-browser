'use strict';

// Stores 'requestID' and 'action' to internal buffer
const protocolBuffer = {
    buffer: [],

    addMessage(msg) {
        if (!this.buffer.includes(msg)) {
            this.buffer.push({
                action: msg?.action,
                requestID: msg?.requestID
            });
        }
    },

    matchAndRemove(msg) {
        for (let i = 0; i < this.buffer.length; ++i) {
            if (msg?.requestID === this.buffer[i].requestID
                || (msg.action === kpActions.CHANGE_PUBLIC_KEYS && msg?.action === this.buffer[i].action)) {
                this.buffer.splice(i, 1);
                return true;
            }
        }

        return false;
    }
};

//--------------------------------------------------------------------------
// Protocol V2
//--------------------------------------------------------------------------

const protocolClient = {};
protocolClient.keySize = 24;
protocolClient.messageTimeout = 500; // Milliseconds
protocolClient.nativeHostName = 'org.keepassxc.keepassxc_browser';
protocolClient.nativePort = null;

protocolClient.sendNativeMessage = function(requestAction, request, enableTimeout = false, timeoutValue) {
    return new Promise((resolve, reject) => {
        let timeout;
        const ev = protocolClient.nativePort.onMessage;

        const listener = ((port) => {
            const handler = (msg) => {
                if (msg && (msg?.requestID === request.requestID || msg?.action === kpActions.CHANGE_PUBLIC_KEYS)) {
                    // Only resolve a matching response
                    if (protocolBuffer.matchAndRemove(msg)) {
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
        })(ev);
        ev.addListener(listener);

        const messageTimeout = timeoutValue || protocolClient.messageTimeout;

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
        protocolBuffer.addMessage(request);

        // Send the request
        if (protocolClient.nativePort) {
            protocolClient.nativePort.postMessage(request);
        }
    });
};

protocolClient.sendMessage = async function(tab, messageData, enableTimeout = false, triggerUnlock = false) {
    const nonce = protocolClient.getNonce();
    const encryptedMessage = protocolClient.encrypt(messageData, nonce);
    const request = protocolClient.buildRequest(encryptedMessage, nonce, keepass.clientID, triggerUnlock);
    const response = await protocolClient.sendNativeMessage(messageData.action, request, enableTimeout);
    const incrementedNonce = protocolClient.incrementedNonce(nonce);

    return protocolClient.handleResponse(response, incrementedNonce, tab);
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

// Verifies nonces, decrypts and parses the response
protocolClient.handleResponse = function(response, incrementedNonce, tab) {
    if (response.message && protocolClient.verifyNonce(response, incrementedNonce)) {
        const res = protocolClient.decrypt(response.message, response.nonce);
        if (!res) {
            keepass.handleError(tab, kpErrors.CANNOT_DECRYPT_MESSAGE);
            return undefined;
        }

        const message = nacl.util.encodeUTF8(res);
        const parsed = JSON.parse(message);
        return parsed;
    } else if (response.error && response.errorCode) {
        keepass.handleError(tab, response.errorCode, response.error);
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
};
