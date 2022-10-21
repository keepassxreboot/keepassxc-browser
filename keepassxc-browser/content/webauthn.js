'use strict';

// Posts a message to extension's content script and waits for response
const postMessageToExtension = function(request) {
    return new Promise((resolve, reject) => {
        const ev = window;

        const listener = ((messageEvent, messageRequest) => {
            const handler = (msg) => {
                if (msg && msg.data && msg.data.action === messageRequest + '-response') {
                    messageEvent.removeEventListener('message', listener);
                    resolve(msg.data.response);
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
};

// URL encoding needs some characters replaced
const base64ToArrayBuffer = function(str) {
    return stringToArrayBuffer(window.atob(str.replaceAll('-', '+').replaceAll('_', '/')));
};

// URL encoding needs some characters replaced
const arrayBufferToBase64 = function(arr) {
    var clonedArr = new ArrayBuffer(arr.byteLength);
    new Uint8Array(clonedArr).set(new Uint8Array(arr));

    return window.btoa(clonedArr).replaceAll('\\', '-').replaceAll('/', '_').replaceAll('=', '');
};

/*const arrayBufferToBase64HexString = function(arr) {
    return window.btoa(arrayBufferToHexString(arr));
};*/

const arrayBufferToHexString = function(arr) {
    return [ ...new Uint8Array(arr) ].map(c => c.toString(16).padStart(2, '0')).join('');
};

const buildCredentialCreationOptions = function(options) {
    const publicKey = {};
    publicKey.attestation = options.publicKey.attestation;
    publicKey.authenticatorSelection = options.publicKey.authenticatorSelection;
    //publicKey.challenge = arrayBufferToBase64(options.publicKey.challenge);
    publicKey.challenge = arrayBufferToHexString(options.publicKey.challenge);
    publicKey.extensions = options.publicKey.extensions;
    publicKey.pubKeyCredParams = options.publicKey.pubKeyCredParams;
    publicKey.rp = options.publicKey.rp;
    publicKey.timeout = options.publicKey.timeout;

    publicKey.excludeCredentials = [];
    for (const cred of options.publicKey.excludeCredentials) {
        const arr = {
            //id: arrayBufferToBase64(cred.id),
            id: arrayBufferToHexString(cred.id),
            transports: cred.transports,
            type: cred.type
        };

        publicKey.excludeCredentials.push(arr);
    }

    publicKey.user = {};
    publicKey.user.displayName = options.publicKey.user.displayName;
    //publicKey.user.id = arrayBufferToBase64(options.publicKey.user.id);
    publicKey.user.id = arrayBufferToHexString(options.publicKey.user.id);
    publicKey.user.name = options.publicKey.user.name;

    return publicKey;
};

const buildCredentialRequestOptions = function(options) {
    const publicKey = {};

    return publicKey;
};

(async () => {
    const originalCredentials = navigator.credentials;

    const webauthnCredentials = {
        async create(options) {
            if (options.publicKey) {
                console.log(options.publicKey);
                const publicKey = buildCredentialCreationOptions(options);
                console.log(publicKey);
                const response = await postMessageToExtension({ action: 'webauthn-create', publicKey: publicKey });
                if (response.length === 0 || response.response === 'canceled') {
                    return;
                }

                // Parse
                const publicKeyCredential = response.response;
                publicKeyCredential.rawId = base64ToArrayBuffer(publicKeyCredential.id);
                publicKeyCredential.response.attestationObject.authData = arrayToArrayBuffer(publicKeyCredential.response.attestationObject.authData);
                publicKeyCredential.response.clientDataJSON = stringToArrayBuffer(JSON.stringify(publicKeyCredential.response.clientDataJSON));
                publicKeyCredential.getClientExtensionResults = () => {};
                return publicKeyCredential;
            }

            //const createResponse = await originalCredentials.create(options);
            //console.log(createResponse);
            //return createResponse;
            return originalCredentials.create(options);
        },
        async get(options) {
            if (options.publicKey) {
                console.log(options.publicKey);

                const publicKey = buildCredentialRequestOptions(options);
            }

            return originalCredentials.get(options);
        }
    };

    // Overwrite navigator.credentials
    try {
        Object.defineProperty(navigator, 'credentials', { value: webauthnCredentials });
    } catch (err) {
        console.log('Cannot override navigator.credentials: ', err);
    }
})();
