'use strict';

// Posts a message to extension's content script and waits for response
const postMessageToExtension = function(request) {
    return new Promise((resolve, reject) => {
        const ev = window;

        const listener = ((messageEvent, messageRequest) => {
            const handler = (msg) => {
                if (msg && msg.data && msg.data.action === messageRequest + '-response') {
                    messageEvent.removeEventListener('message', listener);
                    resolve(msg.data);
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

            const response = await postMessageToExtension({ action: 'webauthn-create', publicKey: publicKey });
            console.log('Response: ', response);

            // Parse the response and change needed variables from b64 to ArrayBuffer/UInt8Array etc.


            return [];
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
