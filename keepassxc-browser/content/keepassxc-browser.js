'use strict';

// Contains already called method names
const _called = {};
_called.automaticRedetectCompleted = false;
_called.retrieveCredentials = false;

// Wrapper
const sendMessage = async function(action, args) {
    return await browser.runtime.sendMessage({ action: action, args: args });
};


/**
 * @Object kpxc
 * The main content script object.
 */
const kpxc = {};
kpxc.combinations = [];
kpxc.credentials = [];
kpxc.databaseState = DatabaseState.DISCONNECTED;
kpxc.detectedFields = 0;
kpxc.inputs = [];
kpxc.settings = {};
kpxc.singleInputEnabledForPage = false;
kpxc.submitUrl = null;
kpxc.url = null;

// Add page to Site Preferences with Username-only detection enabled. Set from the popup
kpxc.addToSitePreferences = async function() {
    // Returns a predefined URL for certain sites
    let site = trimURL(window.top.location.href).toLowerCase();

    // Check if the site already exists -> update the current settings
    let siteExists = false;
    for (const existingSite of kpxc.settings['sitePreferences']) {
        if (existingSite.url === site) {
            existingSite.ignore = IGNORE_NOTHING;
            existingSite.usernameOnly = true;
            siteExists = true;
        }
    }

    if (!siteExists) {
        // Add wildcard to the URL
        site = site.slice(0, site.lastIndexOf('/') + 1) + '*';

        kpxc.settings['sitePreferences'].push({
            url: site,
            ignore: IGNORE_NOTHING,
            usernameOnly: true
        });
    }

    await sendMessage('save_settings', kpxc.settings);
    sendMessage('username_field_detected', false);
};

// Clears all from the content and background scripts, including autocomplete
kpxc.clearAllFromPage = function() {
    kpxc.credentials = [];
    kpxc.inputs = [];
    kpxcUserAutocomplete.clear();
    _called.retrieveCredentials = false;

    if (kpxc.settings.autoCompleteUsernames) {
        kpxcUserAutocomplete.closeList();
    }

    // Switch back to default popup
    sendMessage('get_status', [ true ]); // This is an internal function call
};

// Creates a new combination manually from active element
kpxc.createCombination = async function(activeElement) {
    const combination = {
        username: null,
        password: null,
        passwordInputs: [],
        form: activeElement.form
    };

    if (activeElement.getLowerCaseAttribute('type') === 'password') {
        combination.password = activeElement;
    } else {
        combination.username = activeElement;
    }

    return combination;
};

// Switch credentials if database is changed or closed
kpxc.detectDatabaseChange = async function(response) {
    kpxc.databaseState = DatabaseState.LOCKED;
    kpxc.clearAllFromPage();
    kpxcIcons.switchIcons();

    if (document.visibilityState !== 'hidden') {
        if (response.hash.new !== '' && response.hash.new !== response.hash.old) {
            _called.retrieveCredentials = false;
            const settings = await sendMessage('load_settings');
            kpxc.settings = settings;
            kpxc.databaseState = DatabaseState.UNLOCKED;

            await kpxc.initCredentialFields();
            kpxcIcons.switchIcons();

            // If user has requested a manual fill through context menu the actual credential filling
            // is handled here when the opened database has been regognized. It's not a pretty hack.
            const manualFill = await sendMessage('page_get_manual_fill');
            if (manualFill !== ManualFill.NONE) {
                await kpxcFill.fillInFromActiveElement(manualFill === ManualFill.PASSWORD);
                await sendMessage('page_set_manual_fill', ManualFill.NONE);
            }
        } else if (!response.connected) {
            kpxc.databaseState = DatabaseState.DISCONNECTED;
            kpxcIcons.switchIcons();
        }
    }
};

// Get location URL by domain or full URL
kpxc.getDocumentLocation = function() {
    return kpxc.settings.saveDomainOnly ? document.location.origin : document.location.href;
};

// Returns the form that includes the inputField
kpxc.getForm = function(inputField) {
    if (inputField.form) {
        return inputField.form;
    }

    for (const f of document.forms) {
        for (const e of f.elements) {
            if (e === inputField) {
                return f;
            }
        }
    }
};

// Returns form action URL or document origin if it's not found
kpxc.getFormActionUrl = function(combination) {
    if (!combination || (combination.username === null && combination.password === null)) {
        return null;
    }

    let action = null;
    if (combination.form && combination.form.length > 0) {
        action = combination.form.action;
    }

    if (typeof(action) !== 'string' || action === '') {
        // Firefox can report location.origin as 'null' with localHost files
        const origin = document.location.origin === 'null' ? 'file://' : document.location.origin;
        action = origin + document.location.pathname;
    }

    return action;
};

// Get site URL in a proper form
kpxc.getSite = function(sites) {
    if (!sites || sites.length === 0) {
        return '';
    }

    let site = trimURL(sites[0]);
    if (slashNeededForUrl(site)) {
        site += '/';
    }

    return site;
};

// Identifies all forms in the page
kpxc.identifyFormInputs = async function() {
    const forms = [];
    const documentForms = document.forms; // Cache the value just in case

    for (const form of documentForms) {
        if (!kpxcFields.isVisible(form)) {
            continue;
        }

        if (kpxcFields.isSearchForm(form)) {
            continue;
        }

        forms.push(form);
    }

    // Identify input fields in the saved forms
    const inputs = [];
    for (const form of forms) {
        const formInputs = kpxcObserverHelper.getInputs(form);
        for (const f of formInputs) {
            inputs.push(f);
        }
    }

    await kpxc.initCombinations(inputs);
    return inputs;
};

// Ignore a certain site
kpxc.ignoreSite = async function(sites) {
    const site = kpxc.getSite(sites);

    // Check if the site already exists
    let siteExists = false;
    for (const existingSite of kpxc.settings['sitePreferences']) {
        if (existingSite.url === site) {
            existingSite.ignore = IGNORE_NORMAL;
            siteExists = true;
        }
    }

    if (!siteExists) {
        kpxc.settings['sitePreferences'].push({
            url: site,
            ignore: IGNORE_NORMAL,
            usernameOnly: false
        });
    }

    await sendMessage('save_settings', kpxc.settings);
};

// Initialize autocomplete for username fields
kpxc.initAutocomplete = function() {
    if (!kpxc.settings.autoCompleteUsernames) {
        return;
    }

    for (const c of kpxc.combinations) {
        if (c.username) {
            kpxcUserAutocomplete.create(c.username, false, kpxc.settings.autoSubmit);
        } else if (!c.username && c.password) {
            // Single password field
            kpxcUserAutocomplete.create(c.password, false, kpxc.settings.autoSubmit);
        }

        if (c.totp) {
            kpxcTOTPAutocomplete.create(c.totp, false, kpxc.settings.autoSubmit);
        }
    }
};

// Looks for any username & password combinations from the detected input fields
kpxc.initCombinations = async function(inputs = []) {
    if (inputs.length === 0) {
        return [];
    }

    const isCustomLoginFieldsUsed = kpxcFields.isCustomLoginFieldsUsed();
    const combinations = isCustomLoginFieldsUsed
                       ? await kpxcFields.useCustomLoginFields()
                       : await kpxcFields.getAllCombinations(inputs);
    if (!combinations || combinations.length === 0) {
        if (isCustomLoginFieldsUsed) {
            kpxcUI.createNotification('warning', tr('optionsCustomFieldsNotFound'));
        }

        return [];
    }

    for (const c of combinations) {
        // If no username field is found, handle the single password field as such
        const field = c.username || c.password;
        if (field && c.form) {
            // Initialize form-submit for remembering credentials
            kpxcForm.init(c.form, c);
        }

        // Don't allow duplicates
        if (!kpxc.combinations.some(f => f.username === c.username && f.password === c.password && f.totp === c.totp && f.form === c.form)) {
            kpxc.combinations.push(c);
        }
    }

    // Update the fields in Custom Login Fields banner if it's open
    if (kpxcCustomLoginFieldsBanner.created) {
        kpxcCustomLoginFieldsBanner.updateFieldSelections();
    }

    logDebug('Login field combinations identified:', combinations);
    return combinations;
};

// The main function for finding input fields
kpxc.initCredentialFields = async function() {
    // Identify all forms in the page
    const formInputs = await kpxc.identifyFormInputs();

    // Search all remaining inputs from the page, ignore the previous input fields
    const pageInputs = await kpxcFields.getAllPageInputs(formInputs);
    if (formInputs.length === 0 && pageInputs.length === 0) {
        // Run 'redetect_credentials' manually if no fields are found after a page load
        setTimeout(async function() {
            if (_called.automaticRedetectCompleted) {
                return;
            }

            if (kpxc.inputs.length === 0 || kpxc.combinations.length === 0) {
                kpxc.initCredentialFields();
            }
            _called.automaticRedetectCompleted = true;
        }, 2000);

        return;
    }

    // Combine inputs
    kpxc.inputs = [ ...formInputs, ...pageInputs ];

    // Combinations are already saved when identifying fields
    if (kpxc.combinations.length === 0) {
        sendMessage('show_default_browseraction');
        return;
    }

    await kpxcIcons.initIcons(kpxc.combinations);

    if (kpxc.databaseState === DatabaseState.UNLOCKED) {
        await kpxc.retrieveCredentials();
    }
};

// Intializes the login lists for popup and Autocomplete Menu
kpxc.initLoginPopup = function() {
    if (kpxc.credentials.length === 0) {
        return;
    }

    // Returns a login item with additional information for sorting
    const getLoginItem = function(credential, withGroup, loginId) {
        const title = credential.name.length < MAX_AUTOCOMPLETE_NAME_LEN
                   ? credential.name
                   : credential.name.substr(0, MAX_AUTOCOMPLETE_NAME_LEN) + '…';
        const group = (withGroup && credential.group) ? `[${credential.group}] ` : '';
        const visibleLogin = (credential.login.length > 0) ? credential.login : tr('credentialsNoUsername');
        let text = `${group}${title} (${visibleLogin})`;

        if (credential.expired && credential.expired === 'true') {
            text = `${text} [${tr('credentialExpired')}]`;
        }

        return {
            title: title,
            group: group,
            visibleLogin: visibleLogin,
            login: credential.login,
            loginId: loginId,
            uuid: credential.uuid,
            text: text
        };
    };

    // Sorting with or without group name included
    const sortLoginItemBy = function(a, b, name, withGroup = false) {
        const firstGroup = a.group.toLowerCase();
        const secondGroup = b.group.toLowerCase();
        const first = a[name].toLowerCase();
        const second = b[name].toLowerCase();

        return withGroup
            ? firstGroup.localeCompare(secondGroup) || first.localeCompare(second)
            : first.localeCompare(second);
    };

    const getUniqueGroupCount = function(creds) {
        const groups = creds.map(c => c.group || '');
        const uniqueGroups = new Set(groups);
        return uniqueGroups.size;
    };

    const showGroupNameInAutocomplete = kpxc.settings.showGroupNameInAutocomplete && (getUniqueGroupCount(kpxc.credentials) > 1);

    // Initialize login items
    const loginItems = [];
    for (let i = 0; i < kpxc.credentials.length; i++) {
        const loginItem = getLoginItem(kpxc.credentials[i], showGroupNameInAutocomplete, i);
        loginItems.push(loginItem);
    }

    // Sort login items
    if (kpxc.settings.credentialSorting === SORT_BY_TITLE) {
        loginItems.sort((a, b) => sortLoginItemBy(a, b, 'title'));
    } else if (kpxc.settings.credentialSorting === SORT_BY_USERNAME) {
        loginItems.sort((a, b) => sortLoginItemBy(a, b, 'visibleLogin'));
    } else if (kpxc.settings.credentialSorting === SORT_BY_GROUP_AND_TITLE) {
        loginItems.sort((a, b) => sortLoginItemBy(a, b, 'title', true));
    } else if (kpxc.settings.credentialSorting === SORT_BY_GROUP_AND_USERNAME) {
        loginItems.sort((a, b) => sortLoginItemBy(a, b, 'visibleLogin', true));
    }

    const popupLoginItems = [];
    kpxcUserAutocomplete.clear();

    // Initialize Popup Login and Autocomplete Menu items
    for (const l of loginItems) {
        popupLoginItems.push({ text: l.text, uuid: l.uuid });

        kpxcUserAutocomplete.elements.push({
            label: l.text,
            value: l.login,
            uuid: l.uuid,
            loginId: l.loginId
        });
    }

    // Activate Popup Login list of usernames + descriptions
    sendMessage('popup_login', popupLoginItems);
};

kpxc.passwordFilled = async function() {
    return await sendMessage('password_get_filled');
};

/**
 * Handle passwordFilled() with possible exceptions, e.g. Protonmail's mailbox password
 * where we actually need two passwords for a successful login.
 * If an exception is found, act like password is not yet filled.
 * @param {Object} currentForm  Current saved form. @see kpxcForm.saveForm
 * @returns {boolean}           True if password has been already filled
 */
kpxc.passwordFilledWithExceptions = async function(currentForm) {
    if (currentForm.password && kpxcSites.exceptionFound(currentForm.password.id)) {
        return false;
    }

    return await sendMessage('password_get_filled');
};

// Prepares autocomplete and login popup ready for user interaction
kpxc.prepareCredentials = async function() {
    if (kpxc.credentials.length === 0) {
        logDebug('Error: No combination found.');
        return;
    }

    if (kpxc.settings.autoFillSingleEntry && kpxc.credentials.length === 1) {
        kpxcFill.fillFromAutofill();
        return;
    }

    kpxc.initLoginPopup();
    kpxc.initAutocomplete();
};

/**
 * Gets the credential list and shows the update banner
 * @param {string} usernameValue    Submitted username
 * @param {string} passwordValue    Submitted password
 * @param {string} urlValue         URL of the page where password change was detected
 * @param {Array} oldCredentials    Credentials saved from the password change page, if available
 * @param {boolean} useBanner       If banner is disabled, save directly
 */
kpxc.rememberCredentials = async function(usernameValue, passwordValue, urlValue, oldCredentials, useBanner = true) {
    const credentials = (oldCredentials !== undefined && oldCredentials.length > 0) ? oldCredentials : kpxc.credentials;
    if (passwordValue === '') {
        logDebug('Error: Empty password.');
        return undefined;
    }

    let usernameExists = false;
    for (const c of credentials) {
        if (c.login === usernameValue && c.password === passwordValue) {
            return false;
        }

        if (c.login === usernameValue) {
            usernameExists = true;
            break;
        }
    }

    const credentialsList = [];
    for (const c of credentials) {
        credentialsList.push({
            login: c.login,
            name: c.name,
            uuid: c.uuid
        });
    }

    const getUrl = function() {
        let url = trimURL(kpxc.settings.saveDomainOnlyNewCreds ? document.location.origin : document.location.href);
        if (url.length < document.location.origin.length) {
            url = document.location.origin;
        }

        return url;
    };

    urlValue = urlValue || getUrl();

    // Set usernameValue to the first one in the list, or the selected entry
    if (usernameValue === '') {
        if (credentialsList.length === 1) {
            usernameValue = credentialsList[0].login;
        } else if (credentialsList.length > 1) {
            const uuid = await sendMessage('page_get_login_id');
            if (uuid) {
                const credsFromUuid = credentialsList.find(c => c.uuid === uuid);
                if (credsFromUuid) {
                    usernameValue = credsFromUuid.login;
                }
            }
        }
    }

    const saveCredentials = {
        username: usernameValue,
        password: passwordValue,
        url: urlValue,
        usernameExists: usernameExists,
        list: credentialsList
    };

    if (useBanner) {
        kpxcBanner.create(saveCredentials);
    } else {
        kpxcBanner.credentials = saveCredentials;
        kpxcBanner.saveNewCredentials(saveCredentials);
    }

    return true;
};

// Save credentials triggered fron the context menu
kpxc.rememberCredentialsFromContextMenu = async function() {
    const el = document.activeElement;
    if (el.nodeName !== 'INPUT') {
        return;
    }

    const type = el.getAttribute('type');
    const combination = await kpxcFields.getCombination(el, (type === 'password' ? type : 'username'));
    if (!combination) {
        logDebug('Error: No combination found.');
        return;
    }

    const usernameValue = combination.username ? combination.username.value : '';
    const passwordValue = combination.password ? combination.password.value : '';

    const result = await kpxc.rememberCredentials(usernameValue, passwordValue, undefined, undefined, kpxc.settings.showLoginNotifications);
    if (result === undefined) {
        kpxcUI.createNotification('error', tr('rememberNoPassword'));
        return;
    }

    if (!result) {
        kpxcUI.createNotification('warning', tr('rememberCredentialsExists'));
    }
};

// The basic function for retrieving credentials from KeePassXC.
// Credential Banner can force the retrieval for reloading new/modified credentials.
kpxc.retrieveCredentials = async function(force = false) {
    kpxc.url = document.location.href;
    kpxc.submitUrl = kpxc.getFormActionUrl(kpxc.combinations[0]);

    if (kpxc.settings.autoRetrieveCredentials && kpxc.url && kpxc.submitUrl) {
        await kpxc.retrieveCredentialsCallback(await sendMessage('retrieve_credentials', [ kpxc.url, kpxc.submitUrl, force ]));
    }
};

// Handles credentials from 'retrieve_credentials' response
kpxc.retrieveCredentialsCallback = async function(credentials) {
    _called.retrieveCredentials = true;
    if (credentials && credentials.length > 0) {
        kpxc.credentials = credentials;
        await kpxc.prepareCredentials();
    }

    // Update fill_attribute context menu if String Fields are available
    const stringFieldsFound = credentials.some(e => e.stringFields && e.stringFields.length > 0);
    if (stringFieldsFound) {
        await sendMessage('update_context_menu', credentials);
    }

    // Retrieve submitted credentials if available
    const creds = await sendMessage('page_get_submitted');
    if (creds && creds.submitted) {
        await sendMessage('page_clear_submitted');
        kpxc.rememberCredentials(creds.username, creds.password, creds.url, creds.oldCredentials);
    }
};

// If credentials are not received, request them again
kpxc.receiveCredentialsIfNecessary = async function() {
    if (kpxc.credentials.length === 0 && !_called.retrieveCredentials) {
        if (!kpxc.url) {
            kpxc.url = document.location.href;
        }

        // Sets triggerUnlock to true
        const credentials = await sendMessage('retrieve_credentials', [ kpxc.url, kpxc.submitUrl, true ]);
        if (credentials.length === 0) {
            logDebug('Error: No credentials found.');
            return [];
        }

        // If the database was locked, this is scope never met. In these cases the response is met at kpxc.detectDatabaseChange
        await sendMessage('page_set_manual_fill', ManualFill.NONE);
        await kpxc.retrieveCredentialsCallback(credentials);
        return credentials;
    }

    return kpxc.credentials;
};

kpxc.setPasswordFilled = async function(state) {
    await sendMessage('password_set_filled', state);
};

// Special handling for settings value to select element
kpxc.setValue = function(field, value) {
    if (field.matches('select')) {
        value = value.toLowerCase().trim();
        const options = field.querySelectorAll('option');

        for (const o of options) {
            if (o.textContent.toLowerCase().trim() === value) {
                kpxc.setValueWithChange(field, o.value);
                return false;
            }
        }

        return;
    }

    kpxc.setValueWithChange(field, value);
};

// Sets a new value to input field and triggers necessary events
kpxc.setValueWithChange = function(field, value) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: false, key: '', char: '' }));
    field.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: false, key: '', char: '' }));
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: false, key: '', char: '' }));
};

// Returns true if site is ignored
kpxc.siteIgnored = async function(condition) {
    if (kpxc.settings.sitePreferences) {
        let currentLocation;
        try {
            currentLocation = window.top.location.href.toLowerCase();
        } catch (err) {
            // Cross-domain security error inspecting window.top.location.href.
            // This catches an error when an iframe is being accessed from another (sub)domain -> use the iframe URL instead.
            currentLocation = window.self.location.href.toLowerCase();
        }

        const currentSetting = condition || IGNORE_FULL;
        for (const site of kpxc.settings.sitePreferences) {
            if (siteMatch(site.url, currentLocation) || site.url === currentLocation) {
                if (site.ignore === currentSetting) {
                    return true;
                }

                kpxc.singleInputEnabledForPage = site.usernameOnly;
            }
        }

        // Check for predefined sites
        if (kpxc.settings.usePredefinedSites) {
            for (const url of PREDEFINED_SITELIST) {
                if (siteMatch(url, currentLocation) || url === currentLocation) {
                    kpxc.singleInputEnabledForPage = true;
                }
            }
        }
    }

    return false;
};

// Updates database status and icons when tab is activated again
kpxc.triggerActivatedTab = async function() {
    await kpxc.updateDatabaseState();
    kpxcIcons.switchIcons();

    if (kpxc.databaseState === DatabaseState.UNLOCKED && kpxc.credentials.length === 0) {
        await kpxc.retrieveCredentials();
    } else if (kpxc.credentials.length > 0) {
        kpxc.initLoginPopup();
    }
};

// Updates the database state to the content script
kpxc.updateDatabaseState = async function() {
    const res = await sendMessage('get_status', [ true ]);

    if (!res.keePassXCAvailable) {
        kpxc.databaseState = DatabaseState.DISCONNECTED;
        return;
    }

    kpxc.databaseState = res.databaseClosed ? DatabaseState.LOCKED : DatabaseState.UNLOCKED;
};

// Updates the TOTP Autocomplete Menu
kpxc.updateTOTPList = async function() {
    let uuid = await sendMessage('page_get_login_id');
    if (uuid === undefined || kpxc.credentials.length === 0) {
        // Credential haven't been selected
        logDebug('Error: No credentials selected for TOTP.');
        return;
    }

    // Use the first credential available if not set
    if (uuid === '') {
        uuid = kpxc.credentials[0].uuid;
    }

    const credentials = kpxc.credentials.find(c => c.uuid === uuid);
    if (credentials) {
        const username = credentials.login;
        const password = credentials.password;

        // If no username is set, compare with a password
        const credentialList = kpxc.credentials.filter(c => (c.totp || (c.stringFields && c.stringFields.some(s => s['KPH: {TOTP}'])))
            && (c.login === username || (!username && c.password === password)));

        // Filter TOTP Autocomplete Menu with matching 2FA credentials
        kpxcTOTPAutocomplete.elements = kpxcUserAutocomplete.elements.filter(e => credentialList.some(u => u.uuid === e.uuid));
        return credentialList;
    }

    return [];
};


/**
 * Content script initialization.
 */
const initContentScript = async function() {
    try {
        const settings = await sendMessage('load_settings');
        if (!settings) {
            logError('Error: Cannot load extension settings');
            return;
        }

        kpxc.settings = settings;

        if (await kpxc.siteIgnored()) {
            logDebug('This site is ignored in Site Preferences.');
            return;
        }

        await kpxc.updateDatabaseState();
        await kpxc.initCredentialFields();

        if (kpxc.settings.useObserver) {
            await kpxcObserverHelper.initObserver();
        }

        // Retrieve submitted credentials if available.
        const [ creds, redirectCount ] = await Promise.all([
            await sendMessage('page_get_submitted'),
            await sendMessage('page_get_redirect_count')
        ]);

        if (creds && creds.submitted) {
            // If username field is not set, wait for credentials in kpxc.retrieveCredentialsCallback.
            if (!creds.username) {
                return;
            }

            if (redirectCount >= kpxc.settings.redirectAllowance) {
                await sendMessage('page_clear_submitted');
            }

            kpxc.rememberCredentials(creds.username, creds.password, creds.url, creds.oldCredentials);
        }
    } catch (err) {
        logError('initContentScript error: ' + err);
    }
};

if (document.readyState === 'complete' || (document.readyState !== 'loading' && !document.documentElement.doScroll)) {
    initContentScript();
} else {
    document.addEventListener('DOMContentLoaded', initContentScript);
}

// These are executed in each frame
browser.runtime.onMessage.addListener(async function(req, sender) {
    if ('action' in req) {
        // Don't allow any actions if the site is ignored
        if (await kpxc.siteIgnored()) {
            logDebug('This site is ignored in Site Preferences.');
            return;
        }

        if (req.action === 'activated_tab') {
            kpxc.triggerActivatedTab();
        } else if (req.action === 'add_username_only_option') {
            kpxc.addToSitePreferences();
        } else if (req.action === 'check_database_hash' && 'hash' in req) {
            kpxc.detectDatabaseChange(req);
        } else if (req.action === 'choose_credential_fields') {
            kpxcCustomLoginFieldsBanner.create();
        } else if (req.action === 'clear_credentials') {
            kpxc.clearAllFromPage();
        } else if (req.action === 'fill_user_pass_with_specific_login') {
            kpxcFill.fillFromPopup(req.id, req.uuid);
        } else if (req.action === 'fill_username_password') {
            sendMessage('page_set_manual_fill', ManualFill.BOTH);
            await kpxc.receiveCredentialsIfNecessary();
            kpxcFill.fillInFromActiveElement();
        } else if (req.action === 'fill_password') {
            sendMessage('page_set_manual_fill', ManualFill.PASSWORD);
            await kpxc.receiveCredentialsIfNecessary();
            kpxcFill.fillInFromActiveElement(true); // passOnly to true
        } else if (req.action === 'fill_totp') {
            await kpxc.receiveCredentialsIfNecessary();
            kpxcFill.fillFromTOTP();
        } else if (req.action === 'fill_attribute' && req.args) {
            await kpxc.receiveCredentialsIfNecessary();
            kpxcFill.fillAttributeToActiveElementWith(req.args);
        } else if (req.action === 'ignore_site') {
            kpxc.ignoreSite(req.args);
        } else if (req.action === 'redetect_fields') {
            const response = await sendMessage('load_settings');
            kpxc.settings = response;
            kpxc.inputs = [];
            kpxc.combinations = [];
            kpxc.initCredentialFields();
        } else if (req.action === 'reload_extension') {
            sendMessage('reconnect');
        } else if (req.action === 'save_credentials') {
            kpxc.rememberCredentialsFromContextMenu();
        } else if (req.action === 'retrive_credentials_forced') {
            await kpxc.retrieveCredentials(true);
        } else if (req.action === 'show_password_generator') {
            kpxcPasswordDialog.trigger();
        } else if (req.action === 'request_autotype') {
            sendMessage('request_autotype', [ window.location.hostname ]);
        }
    }
});
