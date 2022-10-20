'use strict';

// Posts a message to extension's content script and waits for response
const postMessageToExtension = function(request) {
    return new Promise((resolve, reject) => {
        const ev = window;

        const listener = ((messageEvent, messageRequest) => {
            const handler = (msg) => {
                if (msg && msg.data && msg.data.action === messageRequest + '-response') {
                    messageEvent.removeEventListener('message', listener);
                    resolve(msg.data.data);
                    return;
                }
            };
            return handler;
        })(ev, request.action);
        ev.addEventListener('message', listener);

        // Send the request
        window.postMessage(request, window.location.origin);
    });
};

const stringToArrayBuffer = function(str) {
    const arr = Uint8Array.from(str, c => c.charCodeAt(0));
    return arr.buffer;
};

const arrayToArrayBuffer = function(arr) {
    const buf = Uint8Array.from(arr);
    return buf.buffer;
}

const base64ToArrayBuffer = function(str) {
    return stringToArrayBuffer(atob(str));
};

(async () => {
    const webauthnCredentials = {
        async create(options) {
            console.log('Overridden create');

            const publicKey = {};
            publicKey.attestation = options.publicKey.attestation;
            publicKey.authenticatorSelection = options.publicKey.authenticatorSelection;
            publicKey.challenge = window.btoa(options.publicKey.challenge); // Use b64 instead
            publicKey.pubKeyCredParams = options.publicKey.pubKeyCredParams;
            publicKey.rp = options.publicKey.rp;
            publicKey.timeout = options.publicKey.timeout;
            publicKey.user = options.publicKey.user;
            publicKey.user.id = window.btoa(options.publicKey.user.id); // Use b64 instead

            const publicKeyCredential = await postMessageToExtension({ action: 'webauthn-create', publicKey: publicKey });
            console.log('Response: ', publicKeyCredential);

            // Parse the response and change needed variables from b64 to ArrayBuffer/UInt8Array etc.
            publicKeyCredential.rawId = base64ToArrayBuffer(publicKeyCredential.id);
            publicKeyCredential.response.attestationObject.authData = arrayToArrayBuffer(publicKeyCredential.response.attestationObject.authData);
            publicKeyCredential.response.clientDataJSON = stringToArrayBuffer(JSON.stringify(publicKeyCredential.response.clientDataJSON));

            console.log('Final response: ', publicKeyCredential);
            return publicKeyCredential;
        },
        async get(options) {
            console.log('Overridden get');
        }
    };

    // Overwrite navigator.credentials
    try {
        Object.assign(navigator.credentials, webauthnCredentials);
    } catch (err) {
        console.log(err);
    }
})();
