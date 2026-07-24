'use strict';

const PASSKEYS_NO_LOGINS_FOUND = 15;
const PASSKEYS_CREDENTIAL_IS_EXCLUDED = 21;
const PASSKEYS_REQUEST_CANCELED = 22;
const PASSKEYS_WAIT_FOR_LIFETIMER = 30;

// Apply a script to the page for intercepting Passkeys (WebAuthn) requests
const enablePasskeys = async function() {
    const passkeysLogDebug = function(message, extra) {
        if (kpxcPasskeysUtils.debugLogging) {
            if (typeof debugLogMessage === 'function') {
                debugLogMessage(message, extra);
            } else {
                console.debug(message, extra);
            }
        }
    };

    const passkeys = document.createElement('script');
    passkeys.src = chrome.runtime.getURL('content/passkeys.js');
    document.documentElement.appendChild(passkeys);
    passkeys.remove();

    /**
     * @param {number=} timeout
     */
    const startTimer = function (timeout) {
        let resolve, reject;
        /** @type {Promise<void>} */
        let promise = new Promise((_resolve, _reject) => {
            resolve = _resolve;
            reject = _reject;
        });

        let timerId = setTimeout(resolve, timeout);

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
        if (ret) {
            passkeysLogDebug('Passkey response', ret.response);

            let errorMessage;
            if (ret.response?.errorCode) {
                errorMessage = await chrome.runtime.sendMessage({
                    action: 'get_error_message',
                    args: ret.response.errorCode,
                });
                kpxcUI.createNotification('error', errorMessage);

                if (!kpxcPasskeysUtils.passkeysFallback && letTimerRunOut(ret.response.errorCode)) {
                    await lifetimeTimer.promise;
                }
            }

            kpxcPasskeysUtils.sendPasskeysResponse(ret.response, ret.response?.errorCode, errorMessage);
            lifetimeTimer.promise.catch(() => {}); // prevent error in console
            lifetimeTimer.abort();
        }
    };

    const isSameOriginWithAncestors = function () {
        try {
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
                isSameOriginWithAncestors(),
            );
            passkeysLogDebug('Passkey request', publicKey);
            await sendResponse('passkeys_register', publicKey);
        } else if (ev.detail.action === 'passkeys_get') {
            const publicKey = kpxcPasskeysUtils.buildCredentialRequestOptions(
                ev.detail.publicKey,
                isSameOriginWithAncestors(),
            );
            passkeysLogDebug('Passkey request', publicKey);
            await sendResponse('passkeys_get', publicKey);
        }
    });
};

const initContent = async () => {
    if (document?.documentElement?.ownerDocument?.contentType !== 'text/html'
        && document?.documentElement?.ownerDocument?.contentType !== 'application/xhtml+xml'
    ) {
        return;
    }

    const settings = await chrome.runtime.sendMessage({ action: 'load_settings' });
    if (!settings) {
        console.log('Error: Cannot load extension settings');
        return;
    }

    if (await chrome.runtime.sendMessage({ action: 'is_site_ignored', args: [ window.self.location.href, true ] })) {
        console.log('This site is ignored in Site Preferences.');
        return;
    }

    if (settings.passkeys) {
        kpxcPasskeysUtils.debugLogging = settings?.debugLogging;
        kpxcPasskeysUtils.passkeysFallback = settings?.passkeysFallback;
        enablePasskeys();
    }
};

initContent();
