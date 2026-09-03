// @ts-check
'use strict';

const PASSKEYS_NO_LOGINS_FOUND = 15;
const PASSKEYS_CREDENTIAL_IS_EXCLUDED = 21;
const PASSKEYS_REQUEST_CANCELED = 22;
const PASSKEYS_WAIT_FOR_LIFETIMER = 30;

(async function() {
    if (
        document?.documentElement?.ownerDocument?.contentType !== 'text/html'
        && document?.documentElement?.ownerDocument?.contentType !== 'application/xhtml+xml'
    ) {
        return;
    }

    /** @type {Awaited<ReturnType<page.passkeysInjectIntoPage>>} */
    const kpxcPasskeysSettings = await chrome.runtime.sendMessage({ action: 'passkeys_inject_into_page' });

    if (!kpxcPasskeysSettings.passkeys || kpxcPasskeysSettings.siteIgnored) {
        return;
    }

    if (!kpxcPasskeysSettings.backgroundInject) {
        await (async function injectPageScript() {
            const src = chrome.runtime.getURL('page-context/passkeys.js');
            let evalInject = true; // TODO

            if (
                typeof cloneInto === 'function' // is Firefox
                && evalInject
            ) {
                // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#using_eval_in_content_scripts
                try {
                    window.eval(''); // check CSP before downloading script
                    const code = await (await fetch(src)).text();
                    window.eval(code);
                    return;
                } catch { } // blocked by CSP
            }

            const script = document.createElement('script');
            script.src = src;
            const id = 'kpxc-id';
            script.id = id;

            const container = document.createElement('span');
            container.attachShadow({ mode: 'closed' }).append(script);

            document.documentElement.append(container);
            console.assert(!Array.from(document.scripts).find(el => el.id === id));
            console.assert(!document.getElementById(id));
            container.remove();
            console.debug('[KPXC] script', script);
        })();
    }

    const passkeysLogDebug = function(message, extra) {
        if (kpxcPasskeysUtils.debugLogging) {
            if (typeof debugLogMessage === 'function') {
                debugLogMessage(message, extra);
            } else {
                console.debug(message, extra);
            }
        }
    };

    /**
     * @param {number=} timeout
     */
    const startTimer = function (timeout) {
        let resolve, reject;
        /** @type {Promise<void>} */
        const promise = new Promise((_resolve, _reject) => {
            resolve = _resolve;
            reject = _reject;
        });

        const timerId = setTimeout(resolve, timeout);

        return {
            promise,
            abort() {
                clearTimeout(timerId);
                reject('the timer has been aborted');
            }
        };
    };

    // https://www.w3.org/TR/webauthn-2/#sctn-assertion-privacy
    // https://www.w3.org/TR/webauthn-2/#sctn-getAssertion:~:text=constructAssertionAlg%20and%20terminate%20this%20algorithm%2E-,Return,details
    const letTimerRunOut = function (errorCode) {
        return [
            PASSKEYS_NO_LOGINS_FOUND,
            PASSKEYS_CREDENTIAL_IS_EXCLUDED,
            PASSKEYS_REQUEST_CANCELED,
            PASSKEYS_WAIT_FOR_LIFETIMER,
        ].includes(errorCode);
    };

    const sendResponse = async function(command, publicKey) {
        const lifetimeTimer = startTimer(publicKey?.timeout);

        const ret = await chrome.runtime.sendMessage({ action: command, args: [ publicKey, window.location.origin ] });
        passkeysLogDebug('Passkey response', ret);

        // `null` - any error not related to passkeys (no connection to KPXC, database not opened, unknown error, etc.)
        const errorCode = ret === null ? PASSKEYS_REQUEST_CANCELED : ret?.response?.errorCode;
        let errorMessage;

        if (errorCode) {
            errorMessage = await chrome.runtime.sendMessage({
                action: 'get_error_message',
                args: errorCode,
            });
            kpxcUI.createNotification('error', errorMessage);

            if (!kpxcPasskeysUtils.passkeysFallback && letTimerRunOut(errorCode)) {
                await lifetimeTimer.promise;
            }
        }

        kpxcPasskeysUtils.sendPasskeysResponse(ret?.response, errorCode, errorMessage);
        lifetimeTimer.promise.catch(() => { }); // prevent error in console
        lifetimeTimer.abort();
    };

    /**
     * @param {'create' | 'get'} action
     * @returns {boolean}
     */
    const isAllowedByPolicy = function (action) {
        // https://www.w3.org/TR/webauthn-2/#sctn-permissions-policy
        // https://www.w3.org/TR/webauthn-2/#sctn-iframe-guidance
        const feature = `publickey-credentials-${action}`;

        // https://www.w3.org/TR/permissions-policy/#the-policy-object
        const policy = document.featurePolicy || document.permissionsPolicy;

        if (
            action === 'get' && // remove it since WebAuthn 3
            policy?.features().includes(feature)
        ) {
            passkeysLogDebug('Checking Permissions Policy');
            return policy.allowsFeature(feature);
        }

        // fallback to sameOriginWithAncestors
        try {
            passkeysLogDebug('Checking sameOriginWithAncestors');
            return window.origin === window.top.origin;
        } catch (_err) {
            return false;
        }
    };

    document.addEventListener('kpxc-passkeys-request', async (ev) => {
        if (!window.isSecureContext) {
            kpxcUI.createNotification('error', tr('errorMessagePasskeysContextIsNotSecure'));
            return;
        }

        if (ev.detail.action === 'passkeys_create') {
            const publicKey = kpxcPasskeysUtils.buildCredentialCreationOptions(
                ev.detail.publicKey,
                isAllowedByPolicy('create'),
            );
            passkeysLogDebug('Passkey request', publicKey);
            await sendResponse('passkeys_register', publicKey);
        } else if (ev.detail.action === 'passkeys_get') {
            const publicKey = kpxcPasskeysUtils.buildCredentialRequestOptions(
                ev.detail.publicKey,
                isAllowedByPolicy('get'),
            );
            passkeysLogDebug('Passkey request', publicKey);
            await sendResponse('passkeys_get', publicKey);
        }
    });
})();
