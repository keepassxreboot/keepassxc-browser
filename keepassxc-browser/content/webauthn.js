'use strict';

(async () => {
    const webauthnCredentials = {
        async create(options) {
            console.log('Overridden create');

            const publicKey = {};
            publicKey.attestation = options.publicKey.attestation;
            publicKey.authenticatorSelection = options.publicKey.authenticatorSelection;
            publicKey.challenge = new Uint8Array(options.publicKey.challenge).toString();
            publicKey.pubKeyCredParams = options.publicKey.pubKeyCredParams;
            publicKey.rp = options.publicKey.rp;
            publicKey.timeout = options.publicKey.timeout;
            publicKey.user = options.publicKey.user;
            publicKey.user.id = options.publicKey.user.id.toString();

            /*const credential = await navigator.credentials.create({
                publicKey: publicKey
            });*/

            window.postMessage({ action: 'webauthn-create', publicKey: publicKey }, window.location.origin);
            //await waitForCreateResponse();
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
