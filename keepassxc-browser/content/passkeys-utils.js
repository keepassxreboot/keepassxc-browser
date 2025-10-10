'use strict';

const MINIMUM_TIMEOUT = 15000;
const DEFAULT_TIMEOUT = 30000;
const DISCOURAGED_TIMEOUT = 120000;

// From ArrayBuffer to URL encoded base64 string
const kpxcArrayBufferToBase64 = function(buf) {
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
        ? { errorCode: errorCode, errorMessage: errorMessage, fallback: kpxcPasskeysUtils?.passkeysFallback }
        : { publicKey: publicKey, fallback: kpxcPasskeysUtils?.passkeysFallback };
    const details = kpxc.isFirefox ? cloneInto(response, document.defaultView) : response;
    document.dispatchEvent(new CustomEvent('kpxc-passkeys-response', { detail: details }));
};

// Create a new object with base64 strings for KeePassXC
kpxcPasskeysUtils.buildCredentialCreationOptions = function(pkOptions, sameOriginWithAncestors) {
    try {
        checkErrors(pkOptions, sameOriginWithAncestors);

        const publicKey = {};
        publicKey.attestation = pkOptions?.attestation;
        publicKey.authenticatorSelection = pkOptions?.authenticatorSelection;
        publicKey.challenge = kpxcArrayBufferToBase64(pkOptions.challenge);
        publicKey.extensions = pkOptions?.extensions;

        // Make sure integers are used for "alg". Set to reserved if not found.
        // https://www.iana.org/assignments/cose/cose.xhtml#algorithms
        publicKey.pubKeyCredParams = [];
        if (pkOptions.pubKeyCredParams) {
            for (const credParam of pkOptions.pubKeyCredParams) {
                publicKey.pubKeyCredParams.push({
                    type: credParam?.type,
                    alg: credParam.alg ? Number(credParam.alg) : 0
                });
            }
        }

        publicKey.rp = pkOptions?.rp;
        publicKey.timeout = getTimeout(publicKey?.authenticatorSelection?.userVerification, pkOptions?.timeout);

        publicKey.excludeCredentials = [];
        if (pkOptions.excludeCredentials && pkOptions.excludeCredentials.length > 0) {
            for (const cred of pkOptions.excludeCredentials) {
                publicKey.excludeCredentials.push({
                    id: kpxcArrayBufferToBase64(cred.id),
                    transports: cred.transports,
                    type: cred.type
                });
            }
        }

        publicKey.user = {};
        publicKey.user.displayName = pkOptions.user.displayName;
        publicKey.user.id = kpxcArrayBufferToBase64(pkOptions.user.id);
        publicKey.user.name = pkOptions.user.name;

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
        publicKey.challenge = kpxcArrayBufferToBase64(pkOptions.challenge);
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
                    id: kpxcArrayBufferToBase64(cred.id),
                    transports: [ ...transports, 'internal' ],
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
