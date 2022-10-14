'use strict';

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

            window.postMessage({ action: 'webauthn-create', publicKey: publicKey }, window.location.origin);
            //await waitForCreateResponse(); // How to do this?
        },
        async get(options) {
            console.log('Overridden get');
        }
    };

    try {
        Object.assign(navigator.credentials, webauthnCredentials);
    } catch (err) {
        console.log(err);
    }

    window.addEventListener('message', (ev) => {
        if (ev.data.action === 'webauthn-create-response') {
            console.log('Response received!');
        }
    });
})();
