'use strict';

const PREDEFINED_SITELIST = [
    'https://accounts.google.com/*',
    'https://www.paypal.com/*/cgi-bin/webscr*',
    'https://www.paypal.com/*/checkoutnow*',
    'https://www.paypal.com/*/signin*',
    'https://www.paypal.com/cgi-bin/webscr*',
    'https://www.paypal.com/checkoutnow*',
    'https://www.paypal.com/signin*',
    'https://outlook.live.com/*',
    'https://login.live.com/*',
    'https://odc.officeapps.live.com/*',
    'https://login.microsoftonline.*/*',
    'https://www.amazon.*/ap/*',
    'https://signin.aws.amazon.com/*',
    'https://www.upwork.com/ab/*',
    'https://home.personalcapital.com/*',
    'https://auth.services.adobe.com/*',
    'https://idmsa.apple.com/*',
    'https://secure.soundcloud.com/*',
    'https://icloud.com/*',
    'https://signin.benl.ebay.be/*',
    'https://signin.ebay.*/*',
    'https://www.ebay.*/signin/*',
    'https://login.yahoo.com/*',
    'https://id.atlassian.com/*',
    'https://www.fidelity.com/*',
    'https://twitter.com/i/flow/login',
    'https://login3.id.hp.com/*',
    'https://secure.fnac.com/identity/server/gateway/*',
    'https://*.openai.com/u/login/*',
    'https://www.patreon.com/login',
    'https://*.wordpress.com/log-in/'
];

const IMPROVED_DETECTION_PREDEFINED_SITELIST = [
    'https://auth.max.com/',
    'https://login.qt.io/login',
    'https://secure.chase.com/*',
    'https://www.reddit.com/',
    'https://old.reddit.com/login/*',
    'https://www.icloud.com/'
];

const googleUrl = 'https://accounts.google.com';

const kpxcSites = {};
kpxcSites.googlePasswordFormUrl = 'https://accounts.google.com/signin/v2/challenge/password';
kpxcSites.savedForm = undefined;

/**
 * Tries to detect a username from the page.
 * @returns {string}   Returns the detected username if there is one, undefined otherwise.
 */
kpxcSites.detectUsernameFromPage = function() {
    if (document.location.origin === googleUrl) {
        const profileIdentifier = document.querySelector('[data-profile-identifier]');
        if (profileIdentifier) {
            return profileIdentifier.textContent.trim();
        }
    }
    return undefined;
};

/**
 * Handles a few exceptions for certain sites where password form is inside a div
 * or another element that is not detected directly. Triggered by MutationObserver.
 * @param {string} identifier   Usually a classList or element id
 * @param {object} field        The target element
 * @returns {boolean}           True if an Element has a match with the identifier and document location
 */
kpxcSites.exceptionFound = function(identifier, field) {
    if (!identifier || identifier.length === 0) {
        return;
    }

    if (document.location.origin === 'https://idmsa.apple.com'
        && ((typeof identifier === 'string' && identifier === 'password_text_field')
        || (typeof identifier === 'object' && [ 'password', 'form-row', 'show-password' ].every(c => identifier.contains(c))))) {
        return true;
    } else if (document.location.origin.startsWith('https://signin.ebay.')
               && (identifier === 'null' || identifier.value === 'null' || identifier === 'pass')) {
        return true;
    } else if (document.location.origin.startsWith('https://www.fidelity.com')) {
        if (typeof identifier === 'string') {
            return identifier.includes('fs-mask-username');
        }

        return identifier.contains('fs-mask-username');
    } else if (document.location.origin.startsWith('https://app.protonmail.ch')
              || document.location.origin.startsWith('https://mail.protonmail.com')
              && identifier === 'mailboxPassword') {
        return true;
    } else if (document.location.origin === 'https://www.patreon.com' &&
               (field?.name === 'current-password' || field?.innerHTML?.includes('current-password'))) {
        return true;
    } else if (document.location.origin === 'https://wordpress.com' && identifier?.value === 'login__form-password') {
        return true;
    } else if (document.location.origin === 'https://id.atlassian.com' &&
                Array.isArray(identifier) && identifier?.contains('password-field')) {
        return true;
    } else if (document.location.origin === 'https://app.fastmail.com'
        && identifier?.contains('u-space-y-5') && field?.id === 'v25') {
        return true;
    }

    return false;
};

// Forbids using Shadow DOM query with some sites unless a login dialog has been identified
kpxcSites.isShadowDomQueryAllowed = function(nodeName) {
    if (document.location.href?.startsWith('https://www.reddit.com')
        && nodeName !== 'BODY'
        && !document.querySelector('auth-flow-manager[step-name=login]')) {
        return false;
    }
    return true;
};

/**
 * Handles a few exceptions for certain sites where 2FA field is not regognized properly.
 * @param {object} field   Input field Element
 * @returns {boolean}      True if an Element has a match with the needed indentfifiers and document location
 */
kpxcSites.totpExceptionFound = function(field) {
    if (!field || !matchesWithNodeName(field, 'INPUT')) {
        return false;
    }

    if (document.location.href === 'https://twitter.com/i/flow/login'
        && field.autocomplete === 'on' && field.dir === 'auto'
        && field.name === 'text' && field.type === 'text') {
        return true;
    }

    return false;
};

/**
 * Handles a few exceptions for certain sites where segmented 2FA fields are not regognized properly.
 * @param {object} form     Form Element
 * @returns {boolean}       True if an Element has a match with the needed indentfifiers and document location
 */
kpxcSites.segmentedTotpExceptionFound = function(form) {
    if (!form || !matchesWithNodeName(form, 'FORM')) {
        return false;
    }

    if ((document.location.href.startsWith('https://store.steampowered.com')
        || document.location.href.startsWith('https://steamcommunity.com/login')) && form.length === 5) {
        return true;
    }

    return false;
};

kpxcSites.expectedTOTPMaxLength = function() {
    if (document.location.origin.startsWith('https://www.amazon')
        && document.location.href.includes('/ap/mfa')) {
        return 20;
    } else if (document.location.origin.startsWith('https://adf.ly')
        && document.location.href.includes('/index/twoFactorAuthentication')) {
        return 30;
    }

    return MAX_TOTP_INPUT_LENGTH;
};

/**
 * Handles a few exceptions for certain sites where form submit button is not regognized properly.
 * @param {object} form     Form element (optional)
 * @returns {object}        Button element
 */
kpxcSites.formSubmitButtonExceptionFound = function(form) {
    if (form?.action?.startsWith(googleUrl)) {
        const findDiv = $('#identifierNext, #passwordNext');
        if (!findDiv) {
            return undefined;
        }

        const buttons = findDiv.getElementsByTagName('button');
        kpxcSites.savedForm = form;
        return buttons.length > 0 ? buttons[0] : undefined;
    } else if (form?.action?.startsWith('https://www.ebay.')) {
        // For eBay we must return the first button.
        for (const i of form.elements) {
            if (i.type === 'button') {
                return i;
            }
        }
    } else if (form?.action?.includes('signin.aws.amazon.com')) {
        // For Amazon AWS the button is outside the form.
        const button = $('#signin_button');
        if (button) {
            return button;
        }
    } else if (
        [
            'outlook.live.com',
            'login.live.com',
            'odc.officeapps.live.com',
            'login.microsoftonline.com',
            'login.microsoftonline.us',
        ].some(u => form?.action?.includes(u))) {
        const buttons = Array.from(form.querySelectorAll(kpxcForm.formButtonQuery));
        if (buttons?.length > 1) {
            return buttons[1];
        }
    } else if (form?.action?.startsWith('https://barmerid.id.bconnect.barmer.de')) {
        const loginButton = $('#btn-login');
        return loginButton?.shadowRoot?.children?.[0];
    } else if (!form && document.location.href.includes('reddit.com/settings')) {
        // Reddit change password popup
        return $('.button[slot=primary-button]');
    } else if (form?.action === 'https://auth.openai.com/log-in/password') {
        return form.querySelector('button[class*=_primary_]');
    } else if (!form && document.location.origin === 'https://www.reddit.com') {
        return $('button.login');
    }

    return undefined;
};

/**
 * Handles a few exceptions for certain sites where popup fill is not working properly.
 * @param {object} form     Form element
 * @returns {boolean}       True if exception found
 */
kpxcSites.popupExceptionFound = function(combinations) {
    if (combinations?.[0].form?.action.startsWith(googleUrl)) {
        return true;
    }

    return false;
};

/**
 * Handles a few exceptions for certain sites where Username Icon is not placed properly.
 * @param {number} left         Absolute left position of the icon
 * @param {number} top          Absolute top position of the icon
 * @param {number} iconSize     Size of the icon
 * @param {string} inputType    Input field type
 * @returns {array}             New left and top values as an Array
 */
kpxcSites.iconOffset = function(left, top, iconSize, inputType) {
    if (document.location.hostname.includes('idmsa.apple.com')) {
        return [ left - (iconSize + 10), top + 3 ];
    } else if (document.location.origin === 'https://secure.royalbank.com' && inputType === 'password') {
        return [ left - (iconSize + 10), top ];
    }

    return undefined;
};
