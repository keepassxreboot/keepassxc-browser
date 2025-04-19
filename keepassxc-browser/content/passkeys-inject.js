'use strict';

const PASSKEYS_NO_LOGINS_FOUND = 15;
const PASSKEYS_CREDENTIAL_IS_EXCLUDED = 21;
const PASSKEYS_WAIT_FOR_LIFETIMER = 30;

// Apply a script to the page for intercepting Passkeys (WebAuthn) requests
const enablePasskeys = async function() {
    const passkeysLogDebug = function(message, extra) {
        if (kpxcPasskeysUtils.debugLogging) {
            debugLogMessage(message, extra);   
        }
    };

    const passkeys = document.createElement('script');
    passkeys.src = chrome.runtime.getURL('content/passkeys.js');
    document.documentElement.appendChild(passkeys);

    const startTimer = function(timeout) {
        return setTimeout(() => {
            throw new DOMException('lifetimeTimer has expired', 'NotAllowedError');
        }, timeout);
    };

    const stopTimer = function(lifetimeTimer) {
        if (lifetimeTimer) {
            clearTimeout(lifetimeTimer);
        }
    };

    const letTimerRunOut = function (errorCode) {
        return (
            errorCode === PASSKEYS_WAIT_FOR_LIFETIMER ||
            errorCode === PASSKEYS_CREDENTIAL_IS_EXCLUDED ||
            errorCode === PASSKEYS_NO_LOGINS_FOUND
        );
    };

    const sendResponse = async function(command, publicKey, callback) {
        const lifetimeTimer = startTimer(publicKey?.timeout);

        const ret = await chrome.runtime.sendMessage({ action: command, args: [ publicKey, window.location.origin ] });
        if (ret) {
            let errorMessage;
            if (ret.response && ret.response.errorCode) {
                errorMessage = await chrome.runtime.sendMessage({
                    action: 'get_error_message',
                    args: ret.response.errorCode,
                });
                kpxcUI.createNotification('error', errorMessage);

                if (kpxcPasskeysUtils.passkeysFallback) {
                    kpxcPasskeysUtils.sendPasskeysResponse(undefined, ret.response?.errorCode, errorMessage);
                } else if (letTimerRunOut(ret?.response?.errorCode)) {
                    return;
                }
            }

            passkeysLogDebug('Passkey response', ret.response);
            kpxcPasskeysUtils.sendPasskeysResponse(ret.response, ret.response?.errorCode, errorMessage);
            stopTimer(lifetimeTimer);
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
                ev.detail.sameOriginWithAncestors,
            );
            passkeysLogDebug('Passkey request', publicKey);
            await sendResponse('passkeys_register', publicKey);
        } else if (ev.detail.action === 'passkeys_get') {
            const publicKey = kpxcPasskeysUtils.buildCredentialRequestOptions(
                ev.detail.publicKey,
                ev.detail.sameOriginWithAncestors,
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

    if (await chrome.runtime.sendMessage({ action: 'is_site_ignored', args: window.self.location.href })) {
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
