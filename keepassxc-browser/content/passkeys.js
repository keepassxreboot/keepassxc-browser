'use strict';

const PASSKEYS_ATTESTATION_NOT_SUPPORTED = 20;
const PASSKEYS_CREDENTIAL_IS_EXCLUDED = 21;
const PASSKEYS_REQUEST_CANCELED = 22;
const PASSKEYS_INVALID_USER_VERIFICATION = 23;
const PASSKEYS_EMPTY_PUBLIC_KEY = 24;
const PASSKEYS_INVALID_URL_PROVIDED = 25;
const PASSKEYS_ORIGIN_NOT_ALLOWED = 26;
const PASSKEYS_DOMAIN_IS_NOT_VALID = 27;
const PASSKEYS_DOMAIN_RPID_MISMATCH = 28;
const PASSKEYS_NO_SUPPORTED_ALGORITHMS = 29;
const PASSKEYS_WAIT_FOR_LIFETIMER = 30;
const PASSKEYS_UNKNOWN_ERROR = 31;
const PASSKEYS_INVALID_CHALLENGE = 32;
const PASSKEYS_INVALID_USER_ID = 33;

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

const isSameOriginWithAncestors = function() {
    try {
        return window.self.origin === window.top.origin;
    } catch (err) {
        return false;
    }
};

// Throws errors to a correct exceptions
const handleError = function(errorCode, errorMessage) {
    if ((!errorCode && !errorMessage) || errorCode === PASSKEYS_REQUEST_CANCELED) {
        // No error or canceled by user. Stop the timer but throw no exception. Fallback with be called instead.
        return;
    }

    if (errorCode === PASSKEYS_WAIT_FOR_LIFETIMER || errorCode === PASSKEYS_CREDENTIAL_IS_EXCLUDED) {
        // Timer handled in the content script
        return;
    }

    if ([ PASSKEYS_DOMAIN_RPID_MISMATCH, PASSKEYS_DOMAIN_IS_NOT_VALID ].includes(errorCode)) {
        throw new DOMException(errorMessage, DOMException.SECURITY_ERR);
    }

    if (errorCode === PASSKEYS_NO_SUPPORTED_ALGORITHMS) {
        throw new DOMException(errorMessage, DOMException.NOT_SUPPORTED_ERR);
    }

    if ([ PASSKEYS_INVALID_CHALLENGE, PASSKEYS_INVALID_USER_ID ].includes(errorCode)) {
        throw new TypeError(errorMessage);
    }

    if (
        [
            PASSKEYS_ATTESTATION_NOT_SUPPORTED,
            PASSKEYS_INVALID_URL_PROVIDED,
            PASSKEYS_INVALID_USER_VERIFICATION,
            PASSKEYS_EMPTY_PUBLIC_KEY,
            PASSKEYS_UNKNOWN_ERROR,
            PASSKEYS_ORIGIN_NOT_ALLOWED,
        ].includes(errorCode)
    ) {
        throw new DOMException(errorMessage, 'NotAllowedError');
    }

    throw new DOMException(errorMessage, 'UnknownError');
};


(async () => {
    const originalCredentials = navigator.credentials;

    const passkeysCredentials = {
        async create(options) {
            if (!options.publicKey) {
                return null;
            }

            const sameOriginWithAncestors = isSameOriginWithAncestors();
            const response = await postMessageToExtension({
                action: 'passkeys_create',
                publicKey: options.publicKey,
                sameOriginWithAncestors: sameOriginWithAncestors,
            });

            if (!response.publicKey) {
                handleError(response?.errorCode, response?.errorMessage);
                return response.fallback ? originalCredentials.create(options) : null;
            }

            response.publicKey.getClientExtensionResults = () => {};
            response.publicKey.clientExtensionResults = () => {};
            response.publicKey.response.getTransports = () => [];
            return response.publicKey;
        },
        async get(options) {
            if (!options.publicKey || options?.mediation === 'silent') {
                return null;
            }

            if (options?.mediation === 'conditional') {
                return originalCredentials.get(options);
            }

            const sameOriginWithAncestors = isSameOriginWithAncestors();
            const response = await postMessageToExtension({
                action: 'passkeys_get',
                publicKey: options.publicKey,
                sameOriginWithAncestors: sameOriginWithAncestors,
            });

            if (!response.publicKey) {
                handleError(response?.errorCode, response?.errorMessage);
                return response.fallback ? originalCredentials.get(options) : null;
            }

            response.publicKey.getClientExtensionResults = () => {};
            response.publicKey.clientExtensionResults = () => {};
            return response.publicKey;
        }
    };

    const isConditionalMediationAvailable = async() => false;
    const isUserVerifyingPlatformAuthenticatorAvailable = async() => true;

    // Overwrite navigator.credentials and PublicKeyCredential.isConditionalMediationAvailable.
    // The latter requires user to select which device to use for authentication, but for now browsers cannot
    // select a software authenticator. This could be removed in the future.
    try {
        Object.defineProperty(navigator, 'credentials', { value: passkeysCredentials });
        Object.defineProperty(window.PublicKeyCredential, 'isConditionalMediationAvailable', {
            value: isConditionalMediationAvailable,
        });
        Object.defineProperty(window.PublicKeyCredential, 'isUserVerifyingPlatformAuthenticatorAvailable', {
            value: isUserVerifyingPlatformAuthenticatorAvailable,
        });
    } catch (err) {
        console.log('Cannot override navigator.credentials: ', err);
    }
})();
