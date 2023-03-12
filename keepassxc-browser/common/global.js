'use strict';

const EXTENSION_NAME = 'KeePassXC-Browser';

// Site Preferences ignore options
const IGNORE_NOTHING = 'ignoreNothing';
const IGNORE_NORMAL = 'ignoreNormal';
const IGNORE_AUTOSUBMIT = 'ignoreAutoSubmit';
const IGNORE_FULL = 'ignoreFull';

// Credential sorting options
const SORT_BY_TITLE = 'sortByTitle';
const SORT_BY_USERNAME = 'sortByUsername';
const SORT_BY_GROUP_AND_TITLE = 'sortByGroupAndTitle';
const SORT_BY_GROUP_AND_USERNAME = 'sortByGroupAndUsername';
const SORT_BY_MATCHING_CREDENTIALS_SETTING = 'sortByMatchingCredentials';
const SORT_BY_RELEVANT_ENTRY = 'sortByRelevantEntry';

// Update check intervals
const CHECK_UPDATE_NEVER = 0;
const CHECK_UPDATE_THREE_DAYS = 3;
const CHECK_UPDATE_ONE_WEEK = 7;
const CHECK_UPDATE_ONE_MONTH = 30;

const URL_WILDCARD = '1kpxcwc1';
const schemeSegment = '(\\*|http|https|ws|wss|ftp)';
const hostSegment = '(\\*|(?:\\*\\.)?(?:[^/*]+))?';

const isFirefox = function() {
    return navigator.userAgent.indexOf('Firefox') !== -1 || navigator.userAgent.indexOf('Gecko/') !== -1;
};

const isEdge = function() {
    return navigator.userAgent.indexOf('Edg') !== -1;
};

const showNotification = function(message) {
    browser.notifications.create({
        'type': 'basic',
        'iconUrl': browser.extension.getURL('icons/keepassxc_64x64.png'),
        'title': 'KeePassXC-Browser',
        'message': message
    });
};

const AssociatedAction = {
    NOT_ASSOCIATED: 0,
    ASSOCIATED: 1,
    NEW_ASSOCIATION: 2,
    CANCELED: 3
};

const ManualFill = {
    NONE: 0,
    PASSWORD: 1,
    BOTH: 2
};

// Match hostname or path with wildcards
const matchWithRegex = function(firstUrlPart, secondUrlPart, hostnameUsed = false) {
    if (firstUrlPart === secondUrlPart) {
        return true;
    }

    // If there's no wildcard with hostname, just compare directly
    if (hostnameUsed && !firstUrlPart.includes(URL_WILDCARD) && firstUrlPart !== secondUrlPart) {
        return false;
    }

    // Escape illegal characters
    let re = firstUrlPart.replaceAll(/[!\^$\+\-\(\)@<>]/g, '\\$&');
    if (hostnameUsed) {
        // Replace all host parts with wildcards so e.g. https://*.example.com is accepted with https://example.com
        re = re.replaceAll(`${URL_WILDCARD}.`, '(.*?)');
    }

    // Replace any remaining wildcards for paths
    re = re.replaceAll(URL_WILDCARD, '(.*?)');

    return secondUrlPart.match(new RegExp(re));
};

// Matches URL in Site Preferences with the current URL
const siteMatch = function(site, url) {
    try {
        site = site.replaceAll('*', URL_WILDCARD);
        const siteUrl = new URL(site);
        const currentUrl = new URL(url);

        // Match scheme and port
        if (siteUrl.protocol !== currentUrl.protocol || siteUrl.port !== currentUrl.port) {
            return false;
        }

        // Match hostname and path
        if (!matchWithRegex(siteUrl.hostname, currentUrl.hostname, true)
            || !matchWithRegex(siteUrl.pathname, currentUrl.pathname)) {
            return false;
        }

        return true;
    } catch(e) {
        logError(e);
    }

    return false;
};

const slashNeededForUrl = function(pattern) {
    const matchPattern = new RegExp(`^${schemeSegment}://${hostSegment}$`);
    return matchPattern.exec(pattern);
};

// Returns the top level domain, e.g. https://another.example.co.uk -> example.co.uk
// This is done because a top level domain will probably give better matches with Auto-Type than a full hostname.
const getTopLevelDomainFromUrl = function(hostname) {
    const domainRegex = new RegExp(/(\w+).(com|net|org|edu|co)*(.\w+)$/g);
    const domainMatch = domainRegex.exec(hostname);

    if (domainMatch) {
        return domainMatch[0];
    }

    return hostname;
};

function tr(key, params) {
    return browser.i18n.getMessage(key, params);
}

// Removes everything after '?' from URL
const trimURL = function(url) {
    return url.indexOf('?') !== -1 ? url.split('?')[0] : url;
};

const debugLogMessage = function(message, extra) {
    console.log(`[Debug ${getFileAndLine()}] ${EXTENSION_NAME} - ${message}`);

    if (extra) {
        console.log(extra);
    }
};

const logError = function(message) {
    console.log(`[Error ${getFileAndLine()}] ${EXTENSION_NAME} - ${message}`);
};

// Returns file name and line number from error stack
const getFileAndLine = function() {
    const err = new Error().stack.split('\n');
    const line = err[4] ?? err.at(-1);
    const result = line.substring(line.lastIndexOf('/') + 1, line.lastIndexOf(':'));

    return result;
};

const getCurrentTab = async function() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs.length > 0 ? tabs[0] : undefined;
};

HTMLElement.prototype.show = function() {
    this.style.display = 'block';
};

HTMLElement.prototype.hide = function() {
    this.style.display = 'none';
};
