'use strict';

// Posts a message to extension's content script and waits for response
const postMessageToExtension = function(request) {
    return new Promise((resolve, reject) => {
        const ev = document;

        const listener = ((messageEvent) => {
            const handler = (msg) => {
                if (msg && msg.type === 'kpxc-passkeys-response' && msg.detail) {
                    messageEvent.removeEventListener('kpxc-passkeys-response', listener);
                    resolve(msg.detail);
                    return;
                }
            };
            return handler;
        })(ev);
        ev.addEventListener('kpxc-passkeys-response', listener);

        // Send the request
        document.dispatchEvent(new CustomEvent('kpxc-passkeys-request', { detail: request }));
    });
};

(async () => {
    const originalCredentials = navigator.credentials;

    const passkeysCredentials = {
        async create(options) {
            if (!options.publicKey) {
                return null;
            }

            const response = await postMessageToExtension({ action: 'passkeys_create', publicKey: options.publicKey });
            if (!response.publicKey) {
                return response.fallback ? originalCredentials.create(options) : null;
            }

            response.publicKey.getClientExtensionResults = () => {};
            response.publicKey.clientExtensionResults = () => {};
            return response.publicKey;
        },
        async get(options) {
            if (!options.publicKey) {
                return null;
            }

            if (options.mediation === 'conditional') {
                return originalCredentials.get(options);
            }

            const response = await postMessageToExtension({ action: 'passkeys_get', publicKey: options.publicKey });
            if (!response.publicKey) {
                return response.fallback ? originalCredentials.get(options) : null;
            }

            response.publicKey.getClientExtensionResults = () => {};
            response.publicKey.clientExtensionResults = () => {};
            return response.publicKey;
        }
    };

    const isConditionalMediationAvailable = async() => false;

    // Overwrite navigator.credentials and PublicKeyCredential.isConditionalMediationAvailable.
    // The latter requires user to select which device to use for authentication, but for now browsers cannot
    // select a software authenticator. This could be removed in the future.
    try {
        Object.defineProperty(navigator, 'credentials', { value: passkeysCredentials });
        Object.defineProperty(window.PublicKeyCredential, 'isConditionalMediationAvailable', { value: isConditionalMediationAvailable });
    } catch (err) {
        console.log('Cannot override navigator.credentials: ', err);
    }
})();
