'use strict';

(async () => {


    const webauthnCredentials = {
        async create(options) {
           console.log('Overridden create');

           //await browser.runtime.sendMessage({ action: 'request_autotype', args: [ window.location.hostname ] });
           window.postMessage({ action: 'webauthn-create' }, window.location.origin);
           await waitForCreateResponse();
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
