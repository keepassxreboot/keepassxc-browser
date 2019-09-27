'use strict';

// List of sites that need special handling. 'rep' is the replacement URL.
const siteList = [
    {
        url: 'accounts.google.com',
        rep: 'https://accounts.google.com/*'
    }
];

var kpxcSites = {};

// Returns a predefined URL for certain sites to ensure compatibility with Site Preferences
kpxcSites.definedURL = function(url) {
    for (const site of siteList) {
        if (url.includes(site.url)) {
            return site.rep;
        }
    }

    return url;
};

// UNUSED: Adds all common sites with multi-page login to Site Preferences
kpxcSites.addAllCommonSites = function() {
    kpxc.initializeSitePreferences();

    for (const site of siteList) {
        kpxc.settings['sitePreferences'].push({
            url: site.rep,
            ignore: IGNORE_NOTHING,
            usernameOnly: true
        });
    }
};
