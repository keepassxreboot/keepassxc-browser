'use strict';

const PREDEFINED_SITELIST = [
    'https://accounts.google.com/*',
    'https://www.paypal.com/*/signin',
    'https://outlook.live.com/*',
    'https://login.live.com/*',
    'https://odc.officeapps.live.com/*',
    'https://login.microsoftonline.com/*',
    'https://www.amazon.ae/ap/*',
    'https://www.amazon.ca/ap/*',
    'https://www.amazon.cn/ap/*',
    'https://www.amazon.co.jp/ap/*',
    'https://www.amazon.co.uk/ap/*',
    'https://www.amazon.com/ap/*',
    'https://www.amazon.com.au/ap/*',
    'https://www.amazon.com.br/ap/*',
    'https://www.amazon.com.mx/ap/*',
    'https://www.amazon.com.tr/ap/*',
    'https://www.amazon.de/ap/*',
    'https://www.amazon.es/ap/*',
    'https://www.amazon.fr/ap/*',
    'https://www.amazon.in/ap/*',
    'https://www.amazon.it/ap/*',
    'https://www.amazon.nl/ap/*',
    'https://www.amazon.pl/ap/*',
    'https://www.amazon.sa/ap/*',
    'https://www.amazon.se/ap/*',
    'https://www.amazon.sg/ap/*',
    'https://signin.aws.amazon.com/*',
    'https://www.upwork.com/ab/*',
    'https://home.personalcapital.com/*',
    'https://auth.services.adobe.com/*',
    'https://idmsa.apple.com/*',
    'https://secure.soundcloud.com/*',
    'https://icloud.com/*',
    'https://signin.ebay.de/*',
    'https://signin.ebay.com/*',
    'https://signin.ebay.com.au/*',
    'https://signin.ebay.com.cn/*',
    'https://signin.ebay.com.hk/*',
    'https://signin.ebay.com.my/*',
    'https://signin.ebay.com.sg/*',
    'https://signin.ebay.it/*',
    'https://signin.ebay.co.uk/*',
    'https://signin.ebay.ca/*',
    'https://signin.ebay.at/*',
    'https://signin.ebay.be/*',
    'https://signin.ebay.fr/*',
    'https://signin.ebay.ie/*',
    'https://signin.ebay.nl/*',
    'https://signin.ebay.es/*',
    'https://signin.ebay.ch/*',
    'https://signin.ebay.in/*',
    'https://signin.ebay.ph/*',
    'https://login.yahoo.com/*',
    'https://id.atlassian.com/*',
    'https://www.fidelity.com/*',
    'https://twitter.com/i/flow/login'
];

const kpxcSites = {};
kpxcSites.ebayUrl = 'https://www.ebay.';
kpxcSites.googlePasswordFormUrl = 'https://accounts.google.com/signin/v2/challenge/password';
kpxcSites.googleUrl = 'https://accounts.google.com';
kpxcSites.savedForm = undefined;

/**
 * Tries to detect a username from the page.
 * @returns {string}   Returns the detected username if there is one, undefined otherwise.
 */
kpxcSites.detectUsername = function() {
  if (document.location.origin === kpxcSites.googleUrl) {
    const profileIdentifier = document.getElementById('profileIdentifier');
    if (profileIdentifier) {
      return profileIdentifier.textContent.trim();
    }
  }
};

/**
 * Handles a few exceptions for certain sites where password form is inside a div
 * or another element that is not detected directly. Triggered by MutationObserver.
 * @param {string} identifier   Usually a classList or element id
 * @returns {boolean}           True if an Element has a match with the identifier and document location
 */
kpxcSites.exceptionFound = function(identifier) {
    if (!identifier || identifier.length === 0) {
        return;
    }

    if (document.location.origin === 'https://idmsa.apple.com'
        && ((typeof identifier === 'string' && identifier === 'password_text_field')
        || [ 'password', 'form-row', 'show-password' ].every(c => identifier.contains(c)))) {
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
    }

    return false;
};

/**
 * Handles a few exceptions for certain sites where 2FA field is not regognized properly.
 * @param {object} field   Input field Element
 * @returns {boolean}      True if an Element has a match with the needed indentfifiers and document location
 */
kpxcSites.totpExceptionFound = function(field) {
    if (!field || field.nodeName !== 'INPUT') {
        return false;
    }

    if (document.location.href === 'https://twitter.com/i/flow/login'
        && field.autocomplete === 'on' && field.dir === 'auto'
        && field.name === 'text' && field.type === 'text') {
        return true;
    }

    return false;
};

kpxcSites.expectedTOTPMaxLength = function() {
    if (document.location.origin.startsWith('https://www.amazon')
        && document.location.href.includes('/ap/mfa')) {
        return 20;
    }

    return MAX_TOTP_INPUT_LENGTH;
};
