'use strict';

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
            if (protocolClient.incrementedNonce(message.request.nonce) === response.nonce
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

            const messageTimeout = timeoutValue || protocolClient.messageTimeout;

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

// Legacy client for KeePassXC 2.7.x and older
const keepassClient = {};

//--------------------------------------------------------------------------
// Messaging
//--------------------------------------------------------------------------

keepassClient.sendNativeMessage = async function(request, enableTimeout = false, timeoutValue) {
    if (!protocolClient.nativePort) {
        logError('No native messaging port defined.');
        return;
    }

    const message = new Message(request, enableTimeout, timeoutValue);
    await navigator.locks.request('messageBuffer', async (lock) => {
        messageBuffer.addMessage(message);
    });

    protocolClient.nativePort.postMessage(request);

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
