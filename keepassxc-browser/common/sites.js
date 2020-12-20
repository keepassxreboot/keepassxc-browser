'use strict';

const PREDEFINED_SITELIST = [
    'https://accounts.google.com/*',
    'https://www.paypal.com/*/signin',
    'https://outlook.live.com/*',
    'https://login.live.com/*',
    'https://login.microsoftonline.com/*',
    'https://www.amazon.com/ap/*',
    'https://www.amazon.de/ap/*',
    'https://www.amazon.co.uk/ap/*',
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
    'https://www.fidelity.com/*'
];

const kpxcSites = {};
kpxcSites.googlePasswordFormUrl = 'https://accounts.google.com/signin/v2/challenge/password';
kpxcSites.googleUrl = 'https://accounts.google.com';
kpxcSites.savedForm = undefined;

// Handles a few exceptions for certain sites where password form is inside a div
// or another element that is not detected directly. Triggered by MutationObserver.
// Returns true if an Element has a matching classList.
kpxcSites.exceptionFound = function(classList) {
    if (!classList || classList.length === 0) {
        return;
    }

    if (document.location.origin === 'https://idmsa.apple.com'
        && [ 'password', 'form-row', 'show-password' ].every(c => classList.contains(c))) {
        return true;
    } else if (document.location.origin.startsWith('https://signin.ebay.com')
               && classList.contains('null')) {
        return true;
    } else if (document.location.origin.startsWith('https://www.fidelity.com')
               && classList.contains('fs-mask-username')) {
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
