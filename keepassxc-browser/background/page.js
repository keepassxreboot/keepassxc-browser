'use strict';

const defaultSettings = {
    afterFillSorting: SORT_BY_MATCHING_CREDENTIALS_SETTING,
    afterFillSortingTotp: SORT_BY_RELEVANT_ENTRY,
    autoCompleteUsernames: true,
    autoFillAndSend: false,
    autoFillSingleEntry: false,
    autoFillRelevantCredential: false,
    autoFillSingleTotp: false,
    autoReconnect: false,
    autoRetrieveCredentials: true,
    autoSubmit: false,
    bannerPosition: BannerPosition.TOP,
    checkUpdateKeePassXC: CHECK_UPDATE_NEVER,
    clearCredentialsTimeout: 10,
    colorTheme: 'system',
    credentialSorting: SORT_BY_GROUP_AND_TITLE,
    debugLogging: false,
    defaultGroup: '',
    defaultPasskeyGroup: '',
    defaultPasswordManager: false,
    defaultGroupAlwaysAsk: false,
    downloadFaviconAfterSave: false,
    passkeys: false,
    passkeysFallback: true,
    redirectAllowance: 1,
    saveDomainOnly: true,
    showGettingStartedGuideAlert: true,
    showGroupNameInAutocomplete: true,
    showLoginFormIcon: true,
    showLoginNotifications: true,
    showNotifications: true,
    showOTPIcon: true,
    showTroubleshootingGuideAlert: true,
    useCompactMode: false,
    useMonochromeToolbarIcon: false,
    useObserver: true,
    usePredefinedSites: true,
    usePasswordGeneratorIcons: false,
};

const AUTO_SUBMIT_TIMEOUT = 5000;

const page = {};
page.autoSubmitPerformed = false;
page.attributeMenuItems = [];
page.blockedTabs = [];
page.clearCredentialsTimeout = null;
page.currentRequest = {};
page.currentTabId = -1;
page.isFirefox = false;
page.manualFill = ManualFill.NONE;
page.menuContexts = [ 'editable' ];
page.passwordFilled = false;
page.redirectCount = 0;
page.submitted = false;
page.submittedCredentials = {};
page.tabs = [];

page.popupData = {
    iconType: 'normal',
    popup: 'popup'
};

page.initBrowser = async function() {
    page.isFirefox =
        navigator.userAgent.indexOf('Firefox') !== -1
        || navigator.userAgent.indexOf('Gecko/') !== -1
        || typeof browser.runtime.getBrowserInfo === 'function';
};

page.initSettings = async function() {
    try {
        const item = await browser.storage.local.get({ 'settings': {} });

        // Load managed settings if found
        if (page.isFirefox && typeof(browser.storage.managed) === 'object') {
            try {
                const managedSettings = await browser.storage.managed.get('settings');
                if (managedSettings?.settings) {
                    debugLogMessage('Managed settings found.');
                    item.settings = managedSettings.settings;
                }
            } catch (err) {
                debugLogMessage('page.initSettings: ' + err);
            }
        } else if (typeof chrome.storage.managed === 'object') {
            chrome.storage.managed.get('settings').then((managedSettings) => {
                if (managedSettings?.settings) {
                    debugLogMessage('Managed settings found.');
                    item.settings = managedSettings.settings;
                }
            }).catch((err) => {
                debugLogMessage('page.initSettings: ' + err);
            });
        }

        page.settings = item.settings;
        page.settings.autoReconnect = false;

        // Set default settings if needed
        for (const [ key, value ] of Object.entries(defaultSettings)) {
            if (!Object.hasOwn(page.settings, key)) {
                page.settings[key] = value;
            }
        }

        await browser.storage.local.set({ 'settings': page.settings });
        return page.settings;
    } catch (err) {
        logError('page.initSettings error: ' + err);
        return Promise.reject();
    }
};

page.initOpenedTabs = async function() {
    try {
        const tabs = await browser.tabs.query({});
        for (const i of tabs) {
            page.createTabEntry(i.id);
        }

        // Set initial tab-ID
        const currentTab = await getCurrentTab();
        if (!currentTab) {
            return;
        }

        page.currentTabId = currentTab?.id;
        browserAction.showDefault(currentTab);
    } catch (err) {
        logError('page.initOpenedTabs error: ' + err);
        return Promise.reject();
    }
};

page.initSitePreferences = async function() {
    if (!page.settings) {
        return;
    }

    if (!page.settings['sitePreferences']) {
        page.settings['sitePreferences'] = [];
    }

    await browser.storage.local.set({ 'settings': page.settings });
};

page.resetAllSettings = async function() {
    for (const [ key, value ] of Object.entries(defaultSettings)) {
        page.settings[key] = value;
    }

    page.settings[DEFINED_CUSTOM_FIELDS] = {};
    page.settings.sitePreferences = [];
    await browser.storage.local.set({ 'settings': page.settings });
};

page.switchTab = async function(tab) {
    // Clears Fill Attribute selection from context menu
    page.setFillAttributeContextMenuItemVisible(false);

    // Clears all logins from other tabs after a timeout
    if (page?.clearCredentialsTimeout) {
        clearTimeout(page.clearCredentialsTimeout);
    }

    page.clearCredentialsTimeout = setTimeout(() => {
        for (const pageTabId of Object.keys(page.tabs)) {
            if (tab?.id !== Number(pageTabId)) {
                page.clearCredentials(Number(pageTabId), true);
            }
        }
    }, page.settings.clearCredentialsTimeout * 1000);

    browserAction.showDefault(tab);
    if (tab?.id) {
        browser.tabs.sendMessage(tab.id, { action: 'activated_tab' }).catch((e) => {
            logError('Cannot send activated_tab message: ' + e.message);
        });
    }
};

page.clearCredentials = async function(tabId, complete) {
    if (!page.tabs[tabId]) {
        return;
    }

    page.passwordFilled = false;
    page.tabs[tabId].credentials = [];

    if (complete) {
        page.clearLogins(tabId);

        browser.tabs.sendMessage(tabId, {
            action: 'clear_credentials'
        }).catch((e) => {});
    }
};

page.clearLogins = async function(tabId) {
    if (!page.tabs[tabId]) {
        return;
    }

    page.tabs[tabId].allowIframes = false;
    page.tabs[tabId].credentials = [];
    page.tabs[tabId].loginList = [];
    page.currentRequest = {};
    page.passwordFilled = false;
    page.setFillAttributeContextMenuItemVisible(false);
};

// Clear all logins from all pages and update the content scripts
page.clearAllLogins = function() {
    for (const tabId of Object.keys(page.tabs)) {
        page.clearCredentials(Number(tabId), true);
    }
};

page.setSubmittedCredentials = function(submitted, username, password, url, oldCredentials, tabId) {
    page.submittedCredentials.submitted = submitted;
    page.submittedCredentials.username = username;
    page.submittedCredentials.password = password;
    page.submittedCredentials.url = url;
    page.submittedCredentials.oldCredentials = oldCredentials;
    page.submittedCredentials.tabId = tabId;
};

page.clearSubmittedCredentials = async function() {
    page.submitted = false;
    page.submittedCredentials = {};
};

page.createTabEntry = async function(tabId) {
    page.tabs[tabId] = {
        allowIframes: false,
        credentials: [],
        errorMessage: null,
        loginList: [],
        loginId: undefined
    };

    page.clearSubmittedCredentials();
    page.setFillAttributeContextMenuItemVisible(false);
};

// Retrieves the credentials. Returns cached values when found.
// Page reload or tab switch clears the cache.
// If the retrieval is forced (from Credential Banner), get new credentials normally.
page.retrieveCredentials = async function(tab, args = []) {
    if (!tab?.active || !tab?.id) {
        return [];
    }

    const [ url, submitUrl, force ] = args;
    if (page.tabs[tab.id]?.credentials.length > 0 && !force) {
        return page.tabs[tab.id].credentials;
    }

    // Ignore duplicate requests from the same tab
    if (page.currentRequest.url === url
        && page.currentRequest.submitUrl === submitUrl
        && page.currentRequest.tabId === tab.id
        && !force) {
        return [];
    } else {
        page.currentRequest.url = url;
        page.currentRequest.submitUrl = submitUrl;
        page.currentRequest.tabId = tab.id;
    }

    const credentials = await keepass.retrieveCredentials(tab, args);
    page.tabs[tab.id].credentials = credentials;
    return credentials;
};

page.getLoginId = async function(tab, returnSingle = true) {
    const currentTab = page.tabs[tab.id];

    // If there's only one credential available and loginId is not set
    if (currentTab && returnSingle && !currentTab.loginId && currentTab.credentials.length === 1) {
        return currentTab.credentials[0].uuid;
    }

    return currentTab ? currentTab.loginId : undefined;
};

page.setLoginId = async function(tab, loginId) {
    if (tab?.id) {
        page.tabs[tab.id].loginId = loginId;
    }
};

page.getManualFill = async function(tab) {
    return page.manualFill;
};

page.setManualFill = async function(tab, manualFill) {
    page.manualFill = manualFill;
};

page.getBannerPosition = async function(tab) {
    return page.settings.bannerPosition;
};

page.setBannerPosition = async function(tab, position) {
    page.settings.bannerPosition = position;
    await browser.storage.local.set({ 'settings': page.settings });
};

page.getSubmitted = async function(tab) {
    // Do not return any credentials if the tab ID does not match.
    if (tab?.id !== page.submittedCredentials.tabId) {
        return {};
    }

    return page.submittedCredentials;
};

page.setSubmitted = async function(tab, args = []) {
    const [ submitted, username, password, url, oldCredentials ] = args;
    page.setSubmittedCredentials(submitted, username, password, url, oldCredentials, tab.id);
};

page.getAutoSubmitPerformed = async function(tab) {
    return page.autoSubmitPerformed;
};

// Set autoSubmitPerformed to false after 5 seconds, preventing possible endless loops
page.setAutoSubmitPerformed = async function(tab) {
    if (!page.autoSubmitPerformed) {
        page.autoSubmitPerformed = true;

        setTimeout(() => {
            page.autoSubmitPerformed = false;
        }, AUTO_SUBMIT_TIMEOUT);
    }
};

page.getLoginList = async function(tab) {
    return page.tabs[tab.id] ? page.tabs[tab.id].loginList : [];
};

page.fillHttpAuth = async function(tab, credentials) {
    if (page.tabs[tab.id]?.loginList.resolve) {
        page.tabs[tab.id].loginList.resolve({
            authCredentials: {
                username: credentials.login,
                password: credentials.password
            }
        });
    }
};

page.isSiteIgnored = async function(tab, args = []) {
    const [ currentLocation, checkPasskeys ] = args;
    if (!page?.settings?.sitePreferences || !currentLocation) {
        return false;
    }

    for (const site of page.settings.sitePreferences) {
        if (siteMatch(site.url, currentLocation) || site.url === currentLocation) {
            if (site.ignore === IGNORE_FULL || (checkPasskeys && site.ignore === IGNORE_PASSKEYS)) {
                return true;
            }
        }
    }

    return false;
};

// Shows or hides the Fill Attribute context menu item
page.setFillAttributeContextMenuItemVisible = async function(visible) {
    try {
        await browser.contextMenus.update('fill_attribute', { visible: visible });
    } catch (e) {
        logError(e);
    }
};

// Update context menu for attribute filling
page.updateContextMenu = async function(tab, credentials) {
    // Remove any old attribute items
    page.attributeMenuItems.forEach(item => {
        browser.contextMenus.remove(item?.action);
    });
    page.attributeMenuItems = [];

    // Set parent item visibility
    page.setFillAttributeContextMenuItemVisible(true);

    // Add any new attribute items
    for (const cred of credentials) {
        if (!cred.stringFields) {
            continue;
        }

        for (const attribute of cred.stringFields) {
            // Show username inside [] if there are KPH attributes inside multiple credentials
            const attributeName = Object.keys(attribute)[0].slice(5);
            const finalName = credentials.length > 1
                ? `[${cred?.login}] ${attributeName} (${cred.name || credentials.indexOf(cred)})`
                : attributeName;

            const menuItem = {
                action: `fill_attribute_${cred?.uuid}_${attributeName}`,
                args: attribute,
                parentId: 'fill_attribute',
                title: finalName
            };

            createContextMenuItem(menuItem);
            page.attributeMenuItems.push(menuItem);
        }
    }
};

page.updatePopup = function(tab) {
    browserAction.showDefault(tab);
};

page.setAllowIframes = async function(tab, args = []) {
    const [ allowIframes, site ] = args;

    // Only set when main windows' URL is used
    if (trimURL(tab?.url) === trimURL(site) && tab?.id) {
        page.tabs[tab.id].allowIframes = allowIframes;
    }
};

page.isIframeAllowed = async function(tab, args = []) {
    const [ url, hostname ] = args;
    const baseDomain = await page.getBaseDomainFromUrl(hostname, url);

    // Allow if exception has been set from Site Preferences
    if (page.tabs[tab.id]?.allowIframes) {
        return true;
    }

    // Allow iframe if the base domain is included in iframes' and tab's hostname
    const tabUrl = new URL(tab?.url);
    return hostname.endsWith(baseDomain) && tabUrl.hostname?.endsWith(baseDomain);
};

/**
 * Gets the top level domain from URL.
 * @param {string} domain   Current iframe's hostname
 * @param {string} url      Current iframe's full URL
 * @returns {string}        TLD e.g. https://another.example.co.uk -> co.uk
 */
page.getTopLevelDomainFromUrl = async function(domain, url) {
    // A simple check for IPv4 address. TLD cannot be numeric, and if hostname is just numbers, it's probably an IPv4.
    // TODO: Handle IPv6 addresses. Is there some internal API for these?
    if (!isNaN(Number(domain?.replaceAll('.', '')))) {
        return domain;
    }

    // Only loop the amount of different domain parts found
    const numberOfDomainParts = domain?.split('.')?.length;
    for (let i = 0; i < numberOfDomainParts; ++i) {
        // Cut the first part from host
        const index = domain?.indexOf('.');
        if (index < 0) {
            continue;
        }

        // Check if dummy cookie's domain/TLD matches with public suffix list.
        // If setting the cookie fails, TLD has been found.
        try {
            domain = domain?.substring(index + 1);
            const reply = await browser.cookies.set({
                domain: domain,
                name: 'kpxc',
                sameSite: 'strict',
                url: url,
                value: ''
            });

            // Delete the temporary cookie immediately
            if (reply) {
                await browser.cookies.remove({
                    name: 'kpxc',
                    url: url
                });
            }
        } catch (e) {
            return domain;
        }
    }

    return domain;
};

/**
 * Gets the base domain of URL or hostname.
 * Up-to-date list can be found: https://publicsuffix.org/list/public_suffix_list.dat
 * @param {string} domain   Current iframe's hostname
 * @param {string} url      Current iframe's full URL
 * @returns {string}        The base domain, e.g. https://another.example.co.uk -> example.co.uk
 */
page.getBaseDomainFromUrl = async function(hostname, url) {
    const tld = await page.getTopLevelDomainFromUrl(hostname, url);
    if (tld.length === 0 || tld === hostname) {
        return hostname;
    }

    // Remove the top level domain part from the hostname, e.g. https://another.example.co.uk -> https://another.example
    const finalDomain = hostname.slice(0, hostname.lastIndexOf(tld) - 1);
    // Split the URL and select the last part, e.g. https://another.example -> example
    let baseDomain = finalDomain.split('.')?.at(-1);
    // Append the top level domain back to the URL, e.g. example -> example.co.uk
    baseDomain = baseDomain + '.' + tld;

    return baseDomain;
};

const createContextMenuItem = function({ action, args, ...options }) {
    return browser.contextMenus.create({
        contexts: menuContexts,
        id: action,
        ...options
    });
};


const logDebug = function(message, extra) {
    if (page.settings.debugLogging) {
        debugLogMessage(message, extra);
    }
};
