'use strict';

const MINIMUM_TIMEOUT = 15000;
const DEFAULT_TIMEOUT = 30000;
const DISCOURAGED_TIMEOUT = 120000;

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

const checkErrors = function(pkOptions, sameOriginWithAncestors) {
    if (!pkOptions) {
        throw new Error('No publicKey configuration options were provided');
    }

    if (pkOptions.signal && pkOptions.signal.aborted) {
        throw new DOMException('Abort signalled', DOMException.AbortError);
    }

    if (!sameOriginWithAncestors) {
        throw new DOMException('Cross-origin register or authentication is not allowed.', DOMException.NotAllowedError);
    }

    if (pkOptions.challenge.length < 16) {
        throw new TypeError('challenge is shorter than required minimum length.');
    }
};

const getTimeout = function(userVerification, timeout) {
    if (!timeout || Number(timeout) === 0 || isNaN(Number(timeout))) {
        return userVerification === 'discouraged' ? DISCOURAGED_TIMEOUT : DEFAULT_TIMEOUT;
    }

    // Note: A suggested reasonable range for the timeout member of options is 15 seconds to 120 seconds.
    if (Number(timeout) < MINIMUM_TIMEOUT || Number(timeout) > DISCOURAGED_TIMEOUT) {
        return DEFAULT_TIMEOUT;
    }

    return Number(timeout);
};

const kpxcPasskeysUtils = {};

// Sends response from KeePassXC back to the injected script
kpxcPasskeysUtils.sendPasskeysResponse = function(publicKey, errorCode, errorMessage) {
    const response = errorCode
        ? { errorCode: errorCode, errorMessage: errorMessage, fallback: kpxc.settings.passkeysFallback }
        : { publicKey: publicKey, fallback: kpxc.settings.passkeysFallback };
    const details = isFirefox() ? cloneInto(response, document.defaultView) : response;
    document.dispatchEvent(new CustomEvent('kpxc-passkeys-response', { detail: details }));
};

// Create a new object with base64 strings for KeePassXC
kpxcPasskeysUtils.buildCredentialCreationOptions = function(pkOptions, sameOriginWithAncestors) {
    try {
        checkErrors(pkOptions, sameOriginWithAncestors);

        const publicKey = {};
        publicKey.attestation = pkOptions?.attestation;
        publicKey.authenticatorSelection = pkOptions?.authenticatorSelection;
        publicKey.challenge = arrayBufferToBase64(pkOptions.challenge);
        publicKey.extensions = pkOptions?.extensions;
        publicKey.pubKeyCredParams = pkOptions?.pubKeyCredParams;
        publicKey.rp = pkOptions?.rp;
        publicKey.timeout = getTimeout(publicKey?.authenticatorSelection?.userVerification, pkOptions?.timeout);

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

        // TODO: Disable after fixed in KeePassXC side
        if (!publicKey.rp.id) {
            publicKey.rp.id = window.location.hostname;
        }

        return publicKey;
    } catch (e) {
        console.log(e);
    }
};

// Create a new object with base64 strings for KeePassXC
kpxcPasskeysUtils.buildCredentialRequestOptions = function(pkOptions, sameOriginWithAncestors) {
    try {
        checkErrors(pkOptions, sameOriginWithAncestors);

        const publicKey = {};
        publicKey.challenge = arrayBufferToBase64(pkOptions.challenge);
        publicKey.enterpriseAttestationPossible = false;
        publicKey.extensions = pkOptions?.extensions;
        publicKey.rpId = pkOptions?.rpId;
        publicKey.timeout = getTimeout(publicKey?.userVerification, pkOptions?.timeout);
        publicKey.userVerification = pkOptions?.userVerification;

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
                    transports: [ ...transports, 'internal' ],
                    type: cred.type
                };

                publicKey.allowCredentials.push(arr);
            }
        }

        // TODO: Disable after fixed in KeePassXC side
        if (!publicKey.rpId) {
            publicKey.rpId = window.location.hostname;
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
