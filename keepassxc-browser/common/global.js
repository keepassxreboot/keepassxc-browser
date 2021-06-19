'use strict';

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

const schemeSegment = '(\\*|http|https|ws|wss|ftp)';
const hostSegment = '(\\*|(?:\\*\\.)?(?:[^/*]+))?';
const pathSegment = '(.*)';

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

/**
 * Transforms a valid match pattern into a regular expression
 * which matches all URLs included by that pattern.
 *
 * @param  {string}  pattern  The pattern to transform.
 * @return {RegExp}           The pattern's equivalent as a RegExp.
 * @throws {TypeError}        If the pattern is not a valid MatchPattern
 *
 * https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Match_patterns
 */
const matchPatternToRegExp = function(pattern) {
    if (pattern === '') {
        return (/^(?:http|https|file|ftp|app):\/\//);
    }

    // special handling of file:// since there is no host
    if (pattern.startsWith('file://')) {
        let regex = '^';
        pattern = pattern.replace(/\./g, '\\.');
        if (pattern.endsWith('*')) {
            regex += pattern.slice(0, -1);
        }
        else {
            regex += `${pattern}$`;
        }
        return new RegExp(regex);
    }

    const matchPatternRegExp = new RegExp(
        `^${schemeSegment}://${hostSegment}/${pathSegment}$`
    );

    const match = matchPatternRegExp.exec(pattern);
    if (!match) {
        throw new TypeError(`"${pattern}" is not a valid MatchPattern`);
    }

    let [ , scheme, host, path ] = match;
    if (!host) {
        throw new TypeError(`"${pattern}" does not have a valid host`);
    }

    let regex = '^';

    if (scheme === '*') {
        regex += '(http|https)';
    } else {
        regex += scheme;
    }

    regex += '://';

    if (host && host === '*') {
        regex += '[^/]+?';
    } else if (host) {
        if (host.match(/^\*\./)) {
            regex += '[^/]*?';
            host = host.substring(2);
        }
        regex += host.replace(/\./g, '\\.');
    }

    if (path) {
        path = trimURL(path);

        if (path === '*') {
            regex += '(/.*)?';
        } else if (path.charAt(0) !== '/') {
            regex += '/';
            regex += path.replace(/\./g, '\\.').replace(/\*/g, '.*?');
            regex += '/?';
        }
    }

    regex += '$';
    return new RegExp(regex);
};

const siteMatch = function(site, url) {
    const rx = matchPatternToRegExp(site);
    return url.match(rx);
};

const slashNeededForUrl = function(pattern) {
    const matchPattern = new RegExp(`^${schemeSegment}://${hostSegment}$`);
    return matchPattern.exec(pattern);
};

function tr(key, params) {
    return browser.i18n.getMessage(key, params);
}

// Removes everything after '?' from URL
const trimURL = function(url) {
    return url.indexOf('?') !== -1 ? url.split('?')[0] : url;
};
