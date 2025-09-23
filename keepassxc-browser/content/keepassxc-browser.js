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
kpxc.improvedFieldDetectionEnabledForPage = false;
kpxc.inputs = [];
kpxc.settings = {};
kpxc.singleInputEnabledForPage = false;
kpxc.submitUrl = null;
kpxc.url = null;

// Add page to Site Preferences with a selected option enabled. Set from the popup.
kpxc.addToSitePreferences = async function(optionName, addWildcard = false) {
    // Returns a predefined URL for certain sites
    let site;
    try {
        site = trimURL(window.top.location.href);
    } catch (err) {
        logDebug('Adding to Site Preferences denied from iframe.');
        return;
    }

    // Check if the site already exists -> update the current settings
    let siteExists = false;
    for (const existingSite of kpxc.settings['sitePreferences']) {
        if (existingSite.url === site) {
            existingSite.ignore = IGNORE_NOTHING;
            existingSite[optionName] = true;
            siteExists = true;
        }
    }

    if (!siteExists) {
        // Add wildcard to the URL
        if (addWildcard) {
            site = site.slice(0, site.lastIndexOf('/') + 1) + '*';
        }

        kpxc.settings['sitePreferences'].push({
            url: site,
            ignore: IGNORE_NOTHING,
            [optionName]: true
        });
    }

    await sendMessage('save_settings', kpxc.settings);

    if (optionName === SitePreferences.ALLOW_IFRAMES) {
        await sendMessage('page_set_allow_iframes', [ true, site ]);
        await sendMessage('iframe_detected', false);
    } else if (optionName === SitePreferences.USERNAME_ONLY) {
        await sendMessage('username_field_detected', false);
    }
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

    // Clear logins from background and switch back to default popup
    sendMessage('page_clear_logins');
    sendMessage('get_status', [ true, false, true ]); // This is an internal function call, forceShowDefault
};

// Creates a new combination manually from active element
kpxc.createCombination = async function(activeElement, passOnly) {
    const combination = {
        username: null,
        password: null,
        passwordInputs: [],
        form: null
    };

    if (!activeElement) {
        return combination;
    }

    combination.form = activeElement.form;

    if (passOnly || activeElement.getLowerCaseAttribute('type') === 'password') {
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
        if (response.hash.new !== '') {
            _called.retrieveCredentials = false;
            const settings = await sendMessage('load_settings');
            kpxc.settings = settings;
            kpxc.databaseState = DatabaseState.UNLOCKED;

            await kpxc.initCredentialFields();
            kpxcIcons.switchIcons();

            // If user has requested a manual fill through context menu the actual credential filling
            // is handled here when the opened database has been regognized. It's not a pretty hack.
            const manualFill = await sendMessage('page_get_manual_fill');
            if (manualFill !== ManualFill.NONE && kpxc.combinations.length > 0) {
                await kpxcFill.fillInFromActiveElement(manualFill === ManualFill.PASSWORD);
                await sendMessage('page_set_manual_fill', ManualFill.NONE);
            }
        } else if (!response.connected) {
            kpxc.databaseState = DatabaseState.DISCONNECTED;
            kpxcIcons.switchIcons();
        }
    }
};

kpxc.entryHasTotp = function(entry) {
    return entry.totp || (entry.stringFields && entry.stringFields.some(s => s['KPH: {TOTP}']));
};

// Get location URL by domain or full URL
kpxc.getDocumentLocation = function() {
    return kpxc.settings.saveDomainOnly ? document.location.origin : document.location.href;
};

kpxc.getUniqueGroupCount = function(creds) {
    const groups = creds.map(c => c.group || '');
    const uniqueGroups = new Set(groups);
    return uniqueGroups.size;
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
    if (combination.form?.length > 0) {
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
    // Used for overlay security detection
    kpxcFields.discoverOverlays();

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

    const showGroupNameInAutocomplete = kpxc.showGroupNameInAutocomplete();

    for (const c of kpxc.combinations) {
        if (c.username) {
            kpxcUserAutocomplete.create(
                c.username,
                false,
                kpxc.settings.autoSubmit,
                kpxc.settings.useCompactMode,
                showGroupNameInAutocomplete,
                kpxc.settings.afterFillSorting,
            );
        } else if (!c.username && c.password) {
            // Single password field
            kpxcUserAutocomplete.create(
                c.password,
                false,
                kpxc.settings.autoSubmit,
                kpxc.settings.useCompactMode,
                showGroupNameInAutocomplete,
                kpxc.settings.afterFillSorting,
            );
        }

        if (c.totp) {
            kpxcTOTPAutocomplete.create(
                c.totp,
                false,
                kpxc.settings.autoSubmit,
                kpxc.settings.useCompactMode,
                showGroupNameInAutocomplete,
                kpxc.settings.afterFillSortingTotp,
            );
        }
    }
};

// Looks for any username & password combinations from the detected input fields
kpxc.initCombinations = async function(inputs = []) {
    const isCustomLoginFieldsUsed = kpxcFields.isCustomLoginFieldsUsed();
    if (inputs.length === 0 && !isCustomLoginFieldsUsed) {
        return [];
    }

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
        if (field) {
            if (c.form) {
                // Initialize form-submit for remembering credentials
                kpxcForm.initForm(c.form, c);
            } else {
                // Try to search a submit button
                kpxcForm.initSubmitButtonFromPage();
            }
        }

        // Don't allow duplicates
        if (!kpxc.combinations.some(f =>
            f.username === c.username && f.password === c.password && f.totp === c.totp && f.form === c.form
        )) {
            kpxc.combinations.push(c);
        }
    }

    // Identify a custom password change form
    kpxcForm.initCustomForm(combinations);

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
    if (formInputs.length === 0 && pageInputs.length === 0 && !kpxcFields.isCustomLoginFieldsUsed()) {
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
            group: credential.group || '',
            visibleLogin: visibleLogin,
            login: credential.login,
            loginId: loginId,
            uuid: credential.uuid,
            text: text
        };
    };

    // Sorting with or without group name included
    const sortLoginItemBy = function(a, b, name, withGroup = false) {
        const firstGroup = a.group?.toLowerCase();
        const secondGroup = b.group?.toLowerCase();
        const first = a[name]?.toLowerCase();
        const second = b[name]?.toLowerCase();

        return withGroup
            ? firstGroup.localeCompare(secondGroup) || first.localeCompare(second)
            : first.localeCompare(second);
    };

    const showGroupNameInAutocomplete = kpxc.showGroupNameInAutocomplete();

    // Initialize login items
    const loginItems = [];
    for (const [ i, login ] of kpxc.credentials.entries()) {
        const loginItem = getLoginItem(login, showGroupNameInAutocomplete, i);

        // Ignore a duplicate entry if the password is empty, but there's already a similar entry with a password.
        // An usual use case with TOTP in a separate database.
        const similarEntryFound = kpxc.credentials.some(c => c.password !== '' && c.login === loginItem.login);
        if (login.password === '' && similarEntryFound) {
            continue;
        }

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
            group: showGroupNameInAutocomplete ? l.group : undefined,
            title: l.title,
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

    if (kpxc.settings.autoFillRelevantCredential) {
        const pageUuid = await sendMessage('page_get_login_id', false);
        if (pageUuid) {
            const relevantCredential = kpxc.credentials.find(c => c.uuid === pageUuid);
            const combination = kpxc.combinations?.at(-1);
            if (relevantCredential && combination) {
                kpxcFill.fillInCredentials(combination, relevantCredential.login, relevantCredential.uuid);
            }
        }
    }
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

    const showGroupNameInAutocomplete = kpxc.showGroupNameInAutocomplete();

    const credentialsList = [];
    for (const c of credentials) {
        credentialsList.push({
            login: showGroupNameInAutocomplete ? `[${c.group}] ${c.login}` : c.login,
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
    if (kpxc.databaseState === DatabaseState.LOCKED) {
        kpxcUI.createNotification('error', tr('rememberErrorDatabaseClosed'));
        return;
    }

    const el = document.activeElement;
    if (!matchesWithNodeName(el, 'INPUT')) {
        return;
    }

    const combination = await kpxcFields.getCombination(el);
    if (!combination) {
        logDebug('Error: No combination found.');
        return;
    }

    const usernameValue = combination.username?.value ?? '';
    const passwordValue = combination.password?.value ?? '';

    const result = await kpxc.rememberCredentials(usernameValue, passwordValue, undefined, undefined,
        kpxc.settings.showLoginNotifications);
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
    if (!await isIframeAllowed()) {
        return;
    }

    kpxc.url = document.location.href;
    kpxc.submitUrl = kpxc.getFormActionUrl(kpxc.combinations[0]);

    if (kpxc.settings.autoRetrieveCredentials && kpxc.url && kpxc.submitUrl) {
        await kpxc.retrieveCredentialsCallback(
            await sendMessage('retrieve_credentials', [ kpxc.url, kpxc.submitUrl, force ]),
        );
    }
};

// Handles credentials from 'retrieve_credentials' response
kpxc.retrieveCredentialsCallback = async function(credentials) {
    _called.retrieveCredentials = true;
    if (credentials?.length > 0) {
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
    if (creds?.submitted) {
        await sendMessage('page_clear_submitted');
        kpxc.rememberCredentials(creds.username, creds.password, creds.url, creds.oldCredentials);
    }
};

// If credentials are not received, request them again
kpxc.receiveCredentialsIfNecessary = async function() {
    if (kpxc.credentials.length === 0) {
        if (!await isIframeAllowed()) {
            return [];
        }

        if (!kpxc.url) {
            kpxc.url = document.location.href;
        }

        // Sets triggerUnlock to true
        const credentials = await sendMessage('retrieve_credentials', [ kpxc.url, kpxc.submitUrl, true ]);
        if (credentials.length === 0) {
            logDebug('Error: No credentials found.');
            return [];
        }

        // If the database was locked, this is scope never met.
        // In these cases the response is met at kpxc.detectDatabaseChange
        await sendMessage('page_set_manual_fill', ManualFill.NONE);
        await kpxc.retrieveCredentialsCallback(credentials);

        kpxcIcons.switchIcons();
        return credentials;
    }

    return kpxc.credentials;
};

kpxc.setPasswordFilled = async function(state) {
    await sendMessage('password_set_filled', state);
};

// Special handling for setting value to select and checkbox elements
kpxc.setValue = function(field, value, forced = false) {
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
    } else if (field.getLowerCaseAttribute('type') === 'checkbox' && value?.toLowerCase() === 'true') {
        field.checked = true;
    }

    // Make sure the input is not wrapped inside another element (custom INPUT element)
    if (field?.nodeName !== 'INPUT' && field?.nodeName?.includes('INPUT')) {
        const childInput = field?.querySelector('input');
        const fieldsFromShadowDOM = kpxcObserverHelper.findInputsFromShadowDOM(field);
        field = childInput ?? fieldsFromShadowDOM[0];
    }


    kpxc.setValueWithChange(field, value, forced);
};

// Sets a new value to input field and triggers necessary events
kpxc.setValueWithChange = function(field, value, forced = false) {
    if (!field || (field?.readOnly && !forced)) {
        return;
    }

    const dispatchLegacyEvent = function(elem, eventName) {
        const legacyEvent = elem.ownerDocument.createEvent('Event');
        legacyEvent.initEvent(eventName, true, false);
        elem.dispatchEvent(legacyEvent);
    };

    field.focus();
    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: false }));
    field.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: false }));
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: false }));
    field.dispatchEvent(new Event('input', { bubbles: true, cancelable: false }));
    field.dispatchEvent(new Event('change', { bubbles: true, cancelable: false }));
    field.value = value;

    // Some pages will not accept the value change without dispatching events directly to the document
    dispatchLegacyEvent(field, 'input');
    dispatchLegacyEvent(field, 'change');
};

kpxc.showGroupNameInAutocomplete = function() {
    return !kpxc.settings.useCompactMode
        || (kpxc.settings.showGroupNameInAutocomplete && kpxc.getUniqueGroupCount(kpxc.credentials) > 1);
};

// Returns true if site is ignored, and checks for predefined sites
kpxc.siteIgnored = async function(condition) {
    if (kpxc.settings.sitePreferences) {
        let currentLocation;
        try {
            currentLocation = window.top.location.href;
        } catch (err) {
            // Cross-domain security error inspecting window.top.location.href.
            // This catches an error when an iframe is being accessed from another (sub)domain
            // -> use the iframe URL instead.
            currentLocation = window.self.location.href;
        }

        const currentSetting = condition || IGNORE_FULL;
        for (const site of kpxc.settings.sitePreferences) {
            if (siteMatch(site.url, currentLocation) || site.url === currentLocation) {
                if (site.ignore === currentSetting) {
                    return true;
                }

                // Refresh current settings for the site
                kpxc.singleInputEnabledForPage = site.usernameOnly;
                kpxc.improvedFieldDetectionEnabledForPage = site.improvedFieldDetection;
                await sendMessage('page_set_allow_iframes', [ site.allowIframes, currentLocation ]);
            }
        }

        // Check for predefined sites
        if (kpxc.settings.usePredefinedSites) {
            kpxc.usePredefinedSites(currentLocation);
        }
    }

    return false;
};

// Updates database status and icons when tab is activated again
kpxc.triggerActivatedTab = async function() {
    await kpxc.updateDatabaseState();

    if (kpxc.databaseState === DatabaseState.UNLOCKED && kpxc.credentials.length === 0) {
        await kpxc.retrieveCredentials();
    } else if (kpxc.credentials.length > 0) {
        kpxc.initLoginPopup();
    }

    kpxcIcons.switchIcons();
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
        const credentialList = kpxc.credentials.filter(c => kpxc.entryHasTotp(c)
            && (c.login === username || (!username && c.password === password)));

        // Filter TOTP Autocomplete Menu with matching 2FA credentials
        kpxcTOTPAutocomplete.elements = kpxcUserAutocomplete.elements.filter(e => credentialList.some(u => u.uuid === e.uuid));
        return credentialList;
    }

    return [];
};

// Enable certain settings based on predefined sites list
kpxc.usePredefinedSites = function(currentLocation) {
    // Single input field
    for (const url of PREDEFINED_SITELIST) {
        if (siteMatch(url, currentLocation) || url === currentLocation) {
            kpxc.singleInputEnabledForPage = true;
        }
    }

    // Improved input field detection
    for (const url of IMPROVED_DETECTION_PREDEFINED_SITELIST) {
        if (siteMatch(url, currentLocation) || url === currentLocation) {
            kpxc.improvedFieldDetectionEnabledForPage = true;
        }
    }
};

/**
 * Content script initialization.
 */
const initContentScript = async function() {
    try { 
        if (document?.documentElement?.ownerDocument?.contentType !== 'text/html'
            && document?.documentElement?.ownerDocument?.contentType !== 'application/xhtml+xml'
        ) {
            return;
        }

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

        kpxcIcons.switchIcons();
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
        } else if (req.action === 'add_allow_iframes_option') {
            kpxc.addToSitePreferences(SitePreferences.ALLOW_IFRAMES);
        } else if (req.action === 'add_username_only_option') {
            kpxc.addToSitePreferences(SitePreferences.USERNAME_ONLY, true);
        } else if (req.action === 'check_database_hash' && 'hash' in req) {
            kpxc.detectDatabaseChange(req);
        } else if (req.action === 'choose_credential_fields') {
            kpxcCustomLoginFieldsBanner.create();
        } else if (req.action === 'clear_credentials') {
            kpxc.clearAllFromPage();
        } else if (req.action === 'fill_user_pass_with_specific_login') {
            await kpxc.reconnect();
            kpxcFill.fillFromPopup(req.id, req.uuid);
        } else if (req.action === 'fill_username_password') {
            await kpxc.reconnect();
            sendMessage('page_set_manual_fill', ManualFill.BOTH);
            await kpxc.receiveCredentialsIfNecessary();
            kpxcFill.fillInFromActiveElement();
        } else if (req.action === 'fill_password') {
            await kpxc.reconnect();
            sendMessage('page_set_manual_fill', ManualFill.PASSWORD);
            await kpxc.receiveCredentialsIfNecessary();
            kpxcFill.fillInFromActiveElement(true); // passOnly to true
        } else if (req.action === 'fill_totp') {
            await kpxc.reconnect();
            await kpxc.receiveCredentialsIfNecessary();
            kpxcFill.fillFromTOTP();
        } else if (req.action === 'fill_attribute' && req.args) {
            await kpxc.receiveCredentialsIfNecessary();
            kpxcFill.fillAttributeToActiveElementWith(req.args);
        } else if (req.action === 'frame_message') {
            if (req.args?.[0] === 'frame_request_to_frames' && window.self !== window.top) {
                kpxcCustomLoginFieldsBanner.handleParentWindowMessage(req.args);
            } else if (req.args?.[0] === 'frame_request_to_parent' && window.self === window.top) {
                kpxcCustomLoginFieldsBanner.handleTopWindowMessage(req.args);
            }
        } else if (req.action === 'ignore_site') {
            kpxc.ignoreSite(req.args);
        } else if (req.action === 'is_site_ignored') {
            return await kpxc.siteIgnored();
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
            kpxcPasswordGenerator.showPasswordGenerator();
        } else if (req.action === 'request_autotype') {
            // All frames can perform this. Ignore iframes that are not allowed.
            if (await isIframeAllowed()) {
                sendMessage('request_autotype', [ window.location.hostname ]);
            }
        }
    }
});

// Automatically reconnect to KeePassXC
// returns true if connected afterwards
kpxc.reconnect = async function() {
    // Try to reconnect if KeePassXC is not currently connected
    const connected = await sendMessage('is_connected');
    if (!connected) {
        const reconnectResponse = await sendMessage('reconnect');
        if (!reconnectResponse.keePassXCAvailable) {
            kpxcUI.createNotification('error', tr('errorNotConnected'));
            return false;
        }
    }
    return true;
};

const isIframeAllowed = async function() {
    sendMessage('iframe_detected', false);

    // Don't allow sandboxed iframes
    if (self.origin === null || self.origin === 'null') {
        logDebug('Error: Sandboxed iframes are not allowed');
        return false;
    }

    try {
        // Check for Cross-domain security error when inspecting window.top.location.href
        const currentLocation = window.top.location.href;
        return true;
    } catch (err) {
        // Inspect iframe using TLD and the tab's original URL
        const allowed = await sendMessage('is_iframe_allowed', [ window.location.href, window.location.hostname ]);
        if (allowed) {
            return true;
        }

        logDebug(`Error: Credential request ignored from another domain: ${window.self.location.host}`);
        sendMessage('iframe_detected', true);
        return false;
    }
};
