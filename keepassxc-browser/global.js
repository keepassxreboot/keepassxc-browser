'use strict';

const IGNORE_NOTHING = 'ignoreNothing';
const IGNORE_NORMAL = 'ignoreNormal';
const IGNORE_FULL = 'ignoreFull';

const schemeSegment = '(\\*|http|https|ws|wss|file|ftp)';
const hostSegment = '(\\*|(?:\\*\\.)?(?:[^/*]+))?';
const pathSegment = '(.*)';

var isFirefox = function() {
    return navigator.userAgent.indexOf('Firefox') !== -1 || navigator.userAgent.indexOf('Gecko/') !== -1;
};

var showNotification = function(message) {
    browser.notifications.create({
        'type': 'basic',
        'iconUrl': browser.extension.getURL('icons/keepassxc_64x64.png'),
        'title': 'KeePassXC-Browser',
        'message': message
    });
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
var matchPatternToRegExp = function(pattern) {
    if (pattern === '') {
        return (/^(?:http|https|file|ftp|app):\/\//);
    }

    const matchPatternRegExp = new RegExp(
        `^${schemeSegment}://${hostSegment}/${pathSegment}$`
    );

    let match = matchPatternRegExp.exec(pattern);
    if (!match) {
         throw new TypeError('"${pattern}" is not a valid MatchPattern');
    }

    let [, scheme, host, path] = match;
    if (!host) {
        throw new TypeError('"${pattern}" does not have a valid host');
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

var siteMatch = function(site, url) {
    const rx = matchPatternToRegExp(site);
    return url.match(rx);
};

var slashNeededForUrl = function(pattern) {
    const matchPattern = new RegExp(`^${schemeSegment}://${hostSegment}$`);
    return matchPattern.exec(pattern);
};

function tr(key, params) {
    return browser.i18n.getMessage(key, params);
};
