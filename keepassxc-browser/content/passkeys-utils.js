'use strict';

const stringToArrayBuffer = function(str) {
    const arr = Uint8Array.from(str, c => c.charCodeAt(0));
    return arr.buffer;
};

// From URL encoded base64 string to ArrayBuffer
const base64ToArrayBuffer = function(str) {
    return stringToArrayBuffer(window.atob(str.replaceAll('-', '+').replaceAll('_', '/')));
};

// From ArrayBuffer to URL encoded base64 string
const arrayBufferToBase64 = function(buf) {
    const str = [ ...new Uint8Array(buf) ].map(c => String.fromCharCode(c)).join('');
    return window.btoa(str).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

// Error checks for both registration and authentication
const checkErrors = function(pkOptions) {
    if (pkOptions.sameOriginWithAncestors !== undefined && pkOptions.sameOriginWithAncestors === false) {
        throw new DOMException('Cross-origin register is not allowed.', DOMException.NotAllowedError);
    }

    if (pkOptions.challenge.length < 16) {
        throw new TypeError('challenge is shorter than required minimum length.');
    }
};

const kpxcPasskeysUtils = {};

// Sends response from KeePassXC back to the injected script
kpxcPasskeysUtils.sendPasskeysResponse = function(publicKey) {
    const response = { publicKey: publicKey, fallback: kpxc.settings.passkeysFallback };
    const details = isFirefox() ? cloneInto(response, document.defaultView) : response;
    document.dispatchEvent(new CustomEvent('kpxc-passkeys-response', { detail: details }));
};

// Create a new object with base64 strings for KeePassXC
kpxcPasskeysUtils.buildCredentialCreationOptions = function(pkOptions) {
    try {
        checkErrors(pkOptions);

        if (pkOptions.user.id && (pkOptions.user.id.length < 1 || pkOptions.user.id.length > 64)) {
            throw new TypeError('user.id does not match the required length.');
        }

        if (!pkOptions.rp.id) {
            pkOptions.rp.id = window.location.host;
            pkOptions.rp.name = window.location.host;
        } else if (!window.location.host.endsWith(pkOptions.rp.id)) {
            throw new DOMException('Site domain differs from RP ID', DOMException.SecurityError);
        }

        if (!pkOptions.pubKeyCredParams || pkOptions.pubKeyCredParams.length === 0) {
            pkOptions.pubKeyCredParams.push({
                'type': 'public-key',
                'alg': -7
            });
            pkOptions.pubKeyCredParams.push({
                'type': 'public-key',
                'alg': -257
            });
        }

        const publicKey = {};
        publicKey.attestation = pkOptions.attestation || 'none';
        publicKey.authenticatorSelection = pkOptions.authenticatorSelection || { userVerification: 'preferred' };
        publicKey.challenge = arrayBufferToBase64(pkOptions.challenge);
        publicKey.extensions = pkOptions.extensions;
        publicKey.pubKeyCredParams = pkOptions.pubKeyCredParams;
        publicKey.rp = pkOptions.rp;
        publicKey.timeout = pkOptions.timeout;

        publicKey.excludeCredentials = [];
        if (pkOptions.excludeCredentials && pkOptions.excludeCredentials.length > 0) {
            for (const cred of pkOptions.excludeCredentials) {
                const arr = {
                    id: arrayBufferToBase64(cred.id),
                    transports: cred.transports,
                    type: cred.type
                };

                publicKey.excludeCredentials.push(arr);
            }
        }

        publicKey.user = {};
        publicKey.user.displayName = pkOptions.user.displayName;
        publicKey.user.id = arrayBufferToBase64(pkOptions.user.id);
        publicKey.user.name = pkOptions.user.name;

        return publicKey;
    } catch (e) {
        console.log(e);
    }
};

// Create a new object with base64 strings for KeePassXC
kpxcPasskeysUtils.buildCredentialRequestOptions = function(pkOptions) {
    try {
        checkErrors(pkOptions);

        if (!pkOptions.rpId) {
            pkOptions.rpId = window.location.host;
        } else if (!window.location.host.endsWith(pkOptions.rpId)) {
            throw new DOMException('Site domain differs from RP ID', DOMException.SecurityError);
        }

        const publicKey = {};
        publicKey.challenge = arrayBufferToBase64(pkOptions.challenge);
        publicKey.rpId = pkOptions.rpId;
        publicKey.timeout = pkOptions.timeout;
        publicKey.userVerification = pkOptions.userVerification || 'preferred';

        publicKey.allowCredentials = [];
        if (pkOptions.allowCredentials && pkOptions.allowCredentials.length > 0) {
            for (const cred of pkOptions.allowCredentials) {
                const transports = [];
                if (cred.transports) {
                    for (const tp of cred.transports) {
                        transports.push(tp);
                    }
                }

                const arr = {
                    id: arrayBufferToBase64(cred.id),
                    transports: transports,
                    type: cred.type
                };

                publicKey.allowCredentials.push(arr);
            }
        }

        return publicKey;
    } catch (e) {
        console.log(e);
    }
};

// Parse register response back from base64 strings to ByteArrays
kpxcPasskeysUtils.parsePublicKeyCredential = function(publicKeyCredential) {
    if (!publicKeyCredential || !publicKeyCredential.type) {
        return undefined;
    }

    publicKeyCredential.rawId = base64ToArrayBuffer(publicKeyCredential.id);
    publicKeyCredential.response.attestationObject =
        base64ToArrayBuffer(publicKeyCredential.response.attestationObject);
    publicKeyCredential.response.clientDataJSON = base64ToArrayBuffer(publicKeyCredential.response.clientDataJSON);

    return publicKeyCredential;
};

// Parse authentication response back from base64 strings to ByteArrays
kpxcPasskeysUtils.parseGetPublicKeyCredential = function(publicKeyCredential) {
    if (!publicKeyCredential || !publicKeyCredential.type) {
        return undefined;
    }

    publicKeyCredential.rawId = base64ToArrayBuffer(publicKeyCredential.id);
    publicKeyCredential.response.authenticatorData =
        base64ToArrayBuffer(publicKeyCredential.response.authenticatorData);
    publicKeyCredential.response.clientDataJSON = base64ToArrayBuffer(publicKeyCredential.response.clientDataJSON);
    publicKeyCredential.response.signature = base64ToArrayBuffer(publicKeyCredential.response.signature);

    if (publicKeyCredential.response.userHandle) {
        publicKeyCredential.response.userHandle = base64ToArrayBuffer(publicKeyCredential.response.userHandle);
    }

    return publicKeyCredential;
};
