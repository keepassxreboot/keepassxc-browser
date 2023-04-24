'use strict';

const messageBuffer = {
    buffer: [],

    addMessage(msg) {
        if (!this.buffer.includes(msg)) {
            this.buffer.push(msg);
        }
    },

    matchAndRemove(msg) {
        for (let i = 0; i < this.buffer.length; ++i) {
            if (msg.nonce && msg.nonce === protocolClient.incrementedNonce(this.buffer[i].nonce)) {
                this.buffer.splice(i, 1);
                return true;
            }
        }

        return false;
    }
};

const keepassClient = {};

//--------------------------------------------------------------------------
// Messaging
//--------------------------------------------------------------------------

keepassClient.sendNativeMessage = function(request, enableTimeout = false, timeoutValue) {
    return new Promise((resolve, reject) => {
        let timeout;
        const requestAction = request.action;
        const ev = protocolClient.nativePort.onMessage;

        const listener = ((port, action) => {
            const handler = (msg) => {
                if (msg && msg?.action === action) {
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
        messageBuffer.addMessage(request);

        // Send the request
        if (protocolClient.nativePort) {
            protocolClient.nativePort.postMessage(request);
        }
    });
};

keepassClient.handleResponse = function(response, incrementedNonce, tab) {
    if (response.message && response.nonce) {
        const res = protocolClient.decrypt(response.message, response.nonce);
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
    const request = keepassClient.buildRequest(kpAction, protocolClient.encrypt(messageData, nonce), nonce, keepass.clientID, triggerUnlock);
    if (messageData.requestID) {
        request['requestID'] = messageData.requestID;
    }

    const response = await keepassClient.sendNativeMessage(request, enableTimeout);
    const incrementedNonce = protocolClient.incrementedNonce(nonce);

    return keepassClient.handleResponse(response, incrementedNonce, tab);
};

//--------------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------------

keepassClient.verifyKeyResponse = function(response, key, nonce) {
    if (!response.success || !response.publicKey) {
        keepass.associated.hash = null;
        return false;
    }

    if (!protocolClient.checkNonceLength(response.nonce)) {
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

    if (!protocolClient.checkNonceLength(response.nonce)) {
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

    if (!protocolClient.checkNonceLength(response.nonce)) {
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
