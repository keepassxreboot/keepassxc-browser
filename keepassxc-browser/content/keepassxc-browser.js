'use strict';

const _maximumInputs = 100;
const _maximumMutations = 200;

// Contains already called method names
const _called = {};
_called.automaticRedetectCompleted = false;
_called.clearLogins = false;
_called.retrieveCredentials = false;

// Wrapper
const sendMessage = async function(action, args) {
    return await browser.runtime.sendMessage({ action: action, args: args });
};

/**
 * @Object kpxcIcons
 * Icon handling.
 */
const kpxcIcons = {};
kpxcIcons.icons = [];
kpxcIcons.iconTypes = { USERNAME: 0, PASSWORD: 1, TOTP: 2 };

// Adds an icon to input field
kpxcIcons.addIcon = async function(field, iconType) {
    if (!field || iconType < 0 || iconType > 2) {
        return;
    }

    let iconSet = false;
    if (iconType === kpxcIcons.iconTypes.USERNAME && kpxcUsernameIcons.isValid(field)) {
        kpxcUsernameIcons.newIcon(field, kpxc.databaseState);
        iconSet = true;
    } else if (iconType === kpxcIcons.iconTypes.PASSWORD && kpxcPasswordIcons.isValid(field)) {
        kpxcPasswordIcons.newIcon(field, kpxc.databaseState);
        iconSet = true;
    } else if (iconType === kpxcIcons.iconTypes.TOTP && kpxcTOTPIcons.isValid(field)) {
        kpxcTOTPIcons.newIcon(field, kpxc.databaseState);
        iconSet = true;
    }

    if (iconSet) {
        kpxcIcons.icons.push({
            field: field,
            iconType: iconType
        });
    }
};

// Adds all necessary icons to a saved form
kpxcIcons.addIconsFromForm = async function(form) {
    const addUsernameIcons = async function(c) {
        if (kpxc.settings.showLoginFormIcon && await kpxc.passwordFilled() === false) {
            // Special case where everything else has been hidden, but a single password field is now displayed.
            // For example PayPal and Amazon is handled like this.
            if (c.username && !c.password && c.passwordInputs.length === 1) {
                kpxcIcons.addIcon(c.passwordInputs[0], kpxcIcons.iconTypes.USERNAME);
            }

            if (c.username && !c.username.readOnly) {
                kpxcIcons.addIcon(c.username, kpxcIcons.iconTypes.USERNAME);
            } else if (c.password && (!c.username || (c.username && c.username.readOnly))) {
                // Single password field
                kpxcIcons.addIcon(c.password, kpxcIcons.iconTypes.USERNAME);
            }
        }
    };

    const addPasswordIcons = async function(c) {
        // Show password icons also with forms without any username field
        if (kpxc.settings.usePasswordGeneratorIcons
            && ((c.username && c.password) || (!c.username && c.passwordInputs.length > 0))) {
            for (const input of c.passwordInputs) {
                kpxcIcons.addIcon(input, kpxcIcons.iconTypes.PASSWORD);
            }
        }
    };

    const addTOTPIcons = async function(c) {
        if (c.totp && kpxc.settings.showOTPIcon) {
            kpxcIcons.addIcon(c.totp, kpxcIcons.iconTypes.TOTP);
        }
    };

    await Promise.all([
        await addUsernameIcons(form),
        await addPasswordIcons(form),
        await addTOTPIcons(form)
    ]);
};

// Delete all icons that have been hidden from the page view
kpxcIcons.deleteHiddenIcons = function() {
    kpxcUsernameIcons.deleteHiddenIcons();
    kpxcPasswordIcons.deleteHiddenIcons();
    kpxcTOTPIcons.deleteHiddenIcons();
};

// Initializes all icons needed to be shown
kpxcIcons.initIcons = async function(combinations = []) {
    if (combinations.length === 0) {
        return;
    }

    for (const form of kpxcForm.savedForms) {
        await kpxcIcons.addIconsFromForm(form);
    }

    // Check for other combinations that are not in any form
    for (const c of combinations) {
        if (c.form) {
            continue;
        }

        await kpxcIcons.addIconsFromForm(c);
    }
};

kpxcIcons.hasIcon = function(field) {
    return !field ? false : kpxcIcons.icons.some(i => i.field === field);
};

// Sets the icons to corresponding database lock status
kpxcIcons.switchIcons = function() {
    kpxcUsernameIcons.switchIcon(kpxc.databaseState);
    kpxcPasswordIcons.switchIcon(kpxc.databaseState);
    kpxcTOTPIcons.switchIcon(kpxc.databaseState);
};


/**
 * @Object kpxcForm
 * Identifies form submits and password changes.
 */
const kpxcForm = {};
kpxcForm.formButtonQuery = 'button[type=button], button[type=submit], input[type=button], input[type=submit], button:not([type]), div[role=button]';
kpxcForm.savedForms = [];

// Returns true if form has been already saved
kpxcForm.formIdentified = function(form) {
    return kpxcForm.savedForms.some(f => f.form === form);
};

// Return input fields from our Object array
kpxcForm.getCredentialFieldsFromForm = function(form) {
    for (const savedForm of kpxcForm.savedForms) {
        if (savedForm.form === form) {
            return [ savedForm.username, savedForm.password, savedForm.passwordInputs, savedForm.totp ];
        }
    }

    return [];
};

// Get the form submit button instead if action URL is same as the page itself
kpxcForm.getFormSubmitButton = function(form) {
    if (!form.action || typeof form.action !== 'string') {
        return;
    }

    const action = kpxc.submitUrl || form.action;

    // Special handling for accounts.google.com. The submit button is outside the form.
    if (form.action.startsWith(kpxcSites.googleUrl)) {
        const findDiv = $('#identifierNext, #passwordNext');
        if (!findDiv) {
            return undefined;
        }

        const buttons = findDiv.getElementsByTagName('button');
        kpxcSites.savedForm = form;
        return buttons.length > 0 ? buttons[0] : undefined;
    }

    if (action.includes(document.location.origin + document.location.pathname)) {
        for (const i of form.elements) {
            if (i.type === 'submit') {
                return i;
            }
        }
    }

    // Try to find another button. Select the last one.
    // TODO: Possibly change this behavior to select the last one for only certain sites.
    const buttons = Array.from(form.querySelectorAll(kpxcForm.formButtonQuery));
    if (buttons.length > 0) {
        return buttons[buttons.length - 1];
    }

    // Try to find similar buttons outside the form which are added via 'form' property
    for (const e of form.elements) {
        if ((e.nodeName === 'BUTTON' && (e.type === 'button' || e.type === 'submit' || e.type === ''))
            || (e.nodeName === 'INPUT' && (e.type === 'button' || e.type === 'submit'))) {
            return e;
        }
    }

    return undefined;
};

// Retrieve new password from a form with three elements: Current, New, Repeat New
kpxcForm.getNewPassword = function(passwordInputs = []) {
    if (passwordInputs.length < 2) {
        return '';
    }

    // Just two password fields, current and new
    if (passwordInputs.length === 2 && passwordInputs[0] !== passwordInputs[1]) {
        return passwordInputs[1].value;
    }

    // Choose the last three password fields. The first ones are almost always for something else
    const current = passwordInputs[passwordInputs.length - 3].value;
    const newPass = passwordInputs[passwordInputs.length - 2].value;
    const repeatNew = passwordInputs[passwordInputs.length - 1].value;

    if ((newPass === repeatNew && current !== newPass && current !== repeatNew)
        || (current === newPass && repeatNew !== newPass && repeatNew !== current)) {
        return newPass;
    }

    return '';
};

// Initializes form and attaches the submit button to our own callback
kpxcForm.init = function(form, credentialFields) {
    if (!form.action || typeof form.action !== 'string') {
        return;
    }

    if (!kpxcForm.formIdentified(form) && (credentialFields.password || credentialFields.username)
        || form.action.startsWith(kpxcSites.googlePasswordFormUrl)) {
        kpxcForm.saveForm(form, credentialFields);
        form.addEventListener('submit', kpxcForm.onSubmit);

        const submitButton = kpxcForm.getFormSubmitButton(form);
        if (submitButton !== undefined) {
            submitButton.addEventListener('click', kpxcForm.onSubmit);
        }
    }
};

// Triggers when form is submitted. Shows the credential banner
kpxcForm.onSubmit = async function(e) {
    if (!e.isTrusted) {
        return;
    }

    const searchForm = f => {
        if (f.nodeName === 'FORM') {
            return f;
        }
    };

    // Traverse parents if the form is not found.
    let form = this.nodeName === 'FORM' ? this : kpxcFields.traverseParents(this, searchForm, searchForm, () => null);

    // Check for extra forms from sites.js
    if (!form) {
        form = kpxcSites.savedForm;
    }

    if (!form) {
        return;
    }

    const [ usernameField, passwordField, passwordInputs ] = kpxcForm.getCredentialFieldsFromForm(form);
    let usernameValue = '';
    let passwordValue = '';

    if (usernameField) {
        usernameValue = usernameField.value || usernameField.placeholder;
    } else if (kpxc.credentials.length === 1) {
        // Single entry found for the page, use the username of it instead of an empty one
        usernameValue = kpxc.credentials[0].login;
    }

    // Check if the form has three password fields -> a possible password change form
    if (passwordInputs && passwordInputs.length >= 2) {
        passwordValue = kpxcForm.getNewPassword(passwordInputs);
    } else if (passwordField) {
        // Use the combination password field instead
        passwordValue = passwordField.value;
    }

    // Return if credentials are already found
    if (kpxc.credentials.some(c => c.login === usernameValue && c.password === passwordValue)) {
        return;
    }

    await kpxc.setPasswordFilled(true);

    const url = trimURL(kpxc.settings.saveDomainOnlyNewCreds ? window.top.location.origin : window.top.location.href);
    await sendMessage('page_set_submitted', [ true, usernameValue, passwordValue, url, kpxc.credentials ]);

    // Show the banner if the page does not reload
    kpxc.rememberCredentials(usernameValue, passwordValue);
};

// Save form to Object array
kpxcForm.saveForm = function(form, combination) {
    kpxcForm.savedForms.push({
        form: form,
        username: combination.username,
        password: combination.password,
        totp: combination.totp,
        passwordInputs: Array.from(form.elements).filter(e => e.nodeName === 'INPUT' && e.type === 'password')
    });
};


/**
 * @Object kpxcFields
 * Provides methods for input field handling.
 */
const kpxcFields = {};

// Returns all username & password combinations detected from the inputs.
// After username field is detected, first password field found after that will be saved as a combination.
kpxcFields.getAllCombinations = async function(inputs) {
    const combinations = [];
    let usernameField = null;

    for (const input of inputs) {
        if (!input) {
            continue;
        }

        if (input.getLowerCaseAttribute('type') === 'password') {
            const combination = {
                username: (!usernameField || usernameField.size < 1) ? null : usernameField,
                password: input,
                passwordInputs: [ input ],
                form: input.form
            };

            combinations.push(combination);
            usernameField = null;
        } else if (kpxcTOTPIcons.isValid(input)) {
            // Dynamically added TOTP field
            const combination = {
                username: null,
                password: null,
                passwordInputs: [],
                totp: input,
                form: null
            };

            combinations.push(combination);
        } else {
            usernameField = input;
        }
    }

    if (kpxc.singleInputEnabledForPage && combinations.length === 0 && usernameField) {
        const combination = {
            username: usernameField,
            password: null,
            passwordInputs: [],
            form: usernameField.form
        };

        combinations.push(combination);
    }

    return combinations;
};

// Return all input fields on the page, but ignore previously detected
kpxcFields.getAllPageInputs = async function(previousInputs = []) {
    const fields = [];
    const inputs = kpxcObserverHelper.getInputs(document.body);

    for (const input of inputs) {
        // Ignore fields that are already detected
        if (previousInputs.some(e => e === input)) {
            continue;
        }

        if (kpxcFields.isVisible(input) && kpxcFields.isAutocompleteAppropriate(input)) {
            fields.push(input);
        }
    }

    kpxc.detectedFields = previousInputs.length + fields.length;

    // Show add username-only option for the site in popup
    if (!kpxc.singleInputEnabledForPage
        && ((fields.length === 1 && fields[0].getLowerCaseAttribute('type') !== 'password')
        || (previousInputs.length === 1 && previousInputs[0].getLowerCaseAttribute('type') !== 'password'))) {
        sendMessage('username_field_detected', true);
    } else {
        sendMessage('username_field_detected', false);
    }

    await kpxc.initCombinations(inputs);
    return fields;
};

/**
 * Returns the combination where input field is used
 * @param {HTMLElement} field Input field
 * @param {String} givenType 'username' or 'password'
 */
kpxcFields.getCombination = async function(field, givenType) {
    // If givenType is not set, return the combination that uses the selected field
    for (const combination of kpxc.combinations) {
        if (!givenType && Object.values(combination).find(c => c === field)) {
            return combination;
        } else if (givenType) {
            if (combination[givenType] === field) {
                return combination;
            }
        }
    }

    return undefined;
};

// Gets of generates an unique ID for the element
kpxcFields.getId = function(target) {
    if (target.classList.length > 0) {
        return `${target.nodeName} ${target.type} ${target.classList.value} ${target.name} ${target.placeholder}`;
    }

    if (target.id && target.id !== '') {
        return `${target.nodeName} ${target.type} ${kpxcFields.prepareId(target.id)} ${target.name} ${target.placeholder}`;
    }

    return `kpxc ${target.type} ${target.clientTop}${target.clientLeft}${target.clientWidth}${target.clientHeight}${target.offsetTop}${target.offsetLeft}`;
};

// Check for new password via autocomplete attribute
kpxcFields.isAutocompleteAppropriate = function(field) {
    const autocomplete = field.getLowerCaseAttribute('autocomplete');
    return autocomplete !== 'new-password';
};

// Checks if Custom Login Fields are used for the site
kpxcFields.isCustomLoginFieldsUsed = function() {
    const location = kpxc.getDocumentLocation();
    return kpxc.settings['defined-custom-fields'] && kpxc.settings['defined-custom-fields'][location];
};

// Returns true if form is a search form
kpxcFields.isSearchForm = function(form) {
    // Check form action
    const formAction = form.getLowerCaseAttribute('action');
    if (formAction && (formAction.includes('search') && !formAction.includes('research'))) {
        return true;
    }

    // Ignore form with search classes
    const formId = form.getLowerCaseAttribute('id');
    if (form.className && (form.className.includes('search')
        || (formId && formId.includes('search') && !formId.includes('research')))) {
        return true;
    }

    return false;
};

// Checks if input field is a search field. Attributes or form action containing 'search', or parent element holding
// role="search" will be identified as a search field.
kpxcFields.isSearchField = function(target) {
    // Check element attributes
    for (const attr of target.attributes) {
        if ((attr.value && (attr.value.toLowerCase().includes('search')) || attr.value === 'q')) {
            return true;
        }
    }

    // Check closest form
    const closestForm = kpxc.getForm(target);
    if (closestForm && kpxcFields.isSearchForm(closestForm)) {
        return true;
    }

    // Check parent elements for role='search'
    if (target.closest('[role~=\'search\']')) {
        return true;
    }

    return false;
};

// Returns true if element is visible on the page
kpxcFields.isVisible = function(elem) {
    // Check element position and size
    const rect = elem.getBoundingClientRect();
    if (rect.x < 0
        || rect.y < 0
        || rect.width < MIN_INPUT_FIELD_WIDTH_PX
        || rect.x > Math.max(document.body.scrollWidth, document.body.offsetWidth, document.documentElement.clientWidth)
        || rect.y > Math.max(document.body.scrollHeight, document.body.offsetHeight, document.documentElement.clientHeight)
        || rect.height < MIN_INPUT_FIELD_WIDTH_PX) {
        return false;
    }

    // Check CSS visibility
    const elemStyle = getComputedStyle(elem);
    if (elemStyle.visibility && (elemStyle.visibility === 'hidden' || elemStyle.visibility === 'collapse')
        || parseInt(elemStyle.width, 10) <= MIN_INPUT_FIELD_WIDTH_PX
        || parseInt(elemStyle.height, 10) <= MIN_INPUT_FIELD_WIDTH_PX) {
        return false;
    }

    // Check for parent opacity
    if (kpxcFields.traverseParents(elem, f => f.style.opacity === '0')) {
        return false;
    }

    return true;
};

kpxcFields.prepareId = function(id) {
    return (id + '').replace(kpxcFields.rcssescape, kpxcFields.fcssescape);
};

/**
 * Returns the first parent element satifying the {@code predicate} mapped by {@code resultFn} or else {@code defaultVal}.
 * @param {HTMLElement} element     The start element (excluded, starting with the parents)
 * @param {function} predicate      Matcher for the element to find, type (HTMLElement) => boolean
 * @param {function} resultFn       Callback function of type (HTMLElement) => {*} called for the first matching element
 * @param {fun} defaultValFn        Fallback return value supplier, if no element matching the predicate can be found
 */
kpxcFields.traverseParents = function(element, predicate, resultFn = () => true, defaultValFn = () => false) {
    for (let f = element.parentElement; f !== null; f = f.parentElement) {
        if (predicate(f)) {
            return resultFn(f);
        }
    }

    return defaultValFn();
};

// Use Custom Fields instead of detected combinations
kpxcFields.useCustomLoginFields = async function() {
    const location = kpxc.getDocumentLocation();
    const creds = kpxc.settings['defined-custom-fields'][location];
    if (!creds.username && !creds.password && !creds.totp && creds.fields.length === 0) {
        return;
    }

    // Finds the input field based on the stored ID
    const findInputField = async function(inputFields, id) {
        if (id) {
            const input = inputFields.find(e => kpxcFields.getId(e) === id);
            if (input) {
                return input;
            }
        }

        return null;
    };

    // Get all input fields from the page without any extra filters
    const inputFields = [];
    document.body.querySelectorAll('input, select, textarea').forEach(e => {
        if (e.type !== 'hidden' && !e.disabled) {
            inputFields.push(e);
        }
    });

    const [ username, password, totp ] = await Promise.all([
        await findInputField(inputFields, creds.username),
        await findInputField(inputFields, creds.password),
        await findInputField(inputFields, creds.totp)
    ]);

    // Handle StringFields
    const stringFields = [];
    for (const sf of creds.fields) {
        const field = await findInputField(inputFields, sf);
        if (field) {
            stringFields.push(field);
        }
    }

    // Handle custom TOTP field
    if (totp) {
        totp.setAttribute('kpxc-defined', 'totp');
        kpxcTOTPIcons.newIcon(totp, kpxc.databaseState, true);
    }

    const combinations = [];
    combinations.push({
        username: username,
        password: password,
        passwordInputs: [ password ],
        totp: totp,
        fields: stringFields
    });

    return combinations;
};

// Copied from Sizzle.js
kpxcFields.rcssescape = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g;
kpxcFields.fcssescape = function(ch, asCodePoint) {
    if (asCodePoint) {
        // U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
        if (ch === '\0') {
            return '\uFFFD';
        }

        // Control characters and (dependent upon position) numbers get escaped as code points
        return ch.slice(0, -1) + '\\' + ch.charCodeAt(ch.length - 1).toString(16) + ' ';
    }

    // Other potentially-special ASCII characters get backslash-escaped
    return '\\' + ch;
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
    let site = trimURL(window.top.location.href);

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
    kpxcAutocomplete.elements = [];
    _called.retrieveCredentials = false;

    if (kpxc.settings.autoCompleteUsernames) {
        kpxcAutocomplete.closeList();
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
                await kpxc.fillInFromActiveElement(manualFill === ManualFill.PASSWORD);
                await sendMessage('page_set_manual_fill', ManualFill.NONE);
            }
        } else if (!response.connected) {
            kpxc.databaseState = DatabaseState.DISCONNECTED;
            kpxcIcons.switchIcons();
        }
    }
};

// Fill selected attribute from the context menu
kpxc.fillAttributeToActiveElementWith = async function(attr) {
    const el = document.activeElement;
    if (el.nodeName !== 'INPUT' || kpxc.credentials.length === 0) {
        return;
    }

    const value = Object.values(attr);
    if (!value || value.length === 0) {
        return;
    }

    kpxc.setValue(el, value[0]);
};

// Fill requested from the context menu. Active element is used for combination detection
kpxc.fillInFromActiveElement = async function(passOnly = false) {
    if (kpxc.credentials.length === 0) {
        return;
    }

    if (kpxc.combinations.length > 0 && kpxc.settings.autoCompleteUsernames) {
        const combination = passOnly
            ? kpxc.combinations.find(c => c.password)
            : kpxc.combinations.find(c => c.username);
        if (!combination) {
            return;
        }

        const field = passOnly ? combination.password : combination.username;
        if (!field) {
            return;
        }

        // set focus to the input field
        field.focus();

        if (kpxc.credentials.length > 1) {
            // More than one credential -> show autocomplete list
            kpxcAutocomplete.showList(field);
            return
        } else {
            // Just one credential -> fill the first combination found
            kpxc.fillInCredentials(combination, kpxc.credentials[0].login, kpxc.credentials[0].uuid, passOnly);
            return;
        }
    }

    // No previous combinations detected. Create a new one from active element
    const el = document.activeElement;
    let combination;
    if (kpxc.combinations.length === 0) {
        combination = await kpxc.createCombination(el);
    } else {
        combination = el.type === 'password'
                    ? await kpxcFields.getCombination(el, 'password')
                    : await kpxcFields.getCombination(el, 'username');
    }

    // Do not allow filling password to a non-password field
    if (passOnly && combination && !combination.password) {
        kpxcUI.createNotification('warning', tr('fieldsNoPasswordField'));
        return;
    }

    await sendMessage('page_set_login_id', 0);
    kpxc.fillInCredentials(combination, kpxc.credentials[0].login, kpxc.credentials[0].uuid, passOnly);
};

// Fill requested by Auto-Fill
kpxc.fillFromAutofill = async function() {
    if (kpxc.credentials.length !== 1 || kpxc.combinations.length === 0) {
        return;
    }

    const index = kpxc.combinations.length - 1;
    await sendMessage('page_set_login_id', 0);
    kpxc.fillInCredentials(kpxc.combinations[index], kpxc.credentials[0].login, kpxc.credentials[0].uuid);

    // Generate popup-list of usernames + descriptions
    sendMessage('popup_login', [ { text: `${kpxc.credentials[0].login} (${kpxc.credentials[0].name})`, uuid: kpxc.credentials[0].uuid } ]);
};

// Fill requested by selecting credentials from the popup
kpxc.fillFromPopup = async function(id, uuid) {
    if (!kpxc.credentials.length === 0 || !kpxc.credentials[id] || kpxc.combinations.length === 0) {
        return;
    }

    await sendMessage('page_set_login_id', id);
    kpxc.fillInCredentials(kpxc.combinations[0], kpxc.credentials[id].login, uuid);
    kpxcAutocomplete.closeList();
};

// Fill requested from TOTP icon
kpxc.fillFromTOTP = async function(target) {
    const el = target || document.activeElement;
    let index = await sendMessage('page_get_login_id');

    // Use the first credential available if not set
    if (index === undefined) {
        index = 0;
    }

    if (index >= 0 && kpxc.credentials[index]) {
        // Check the value from StringFields
        if (kpxc.credentials[index].totp && kpxc.credentials[index].totp.length > 0) {
            // Retrieve a new TOTP value
            const totp = await sendMessage('get_totp', [ kpxc.credentials[index].uuid, kpxc.credentials[index].totp ]);
            if (!totp) {
                kpxcUI.createNotification('warning', tr('credentialsNoTOTPFound'));
                return;
            }

            kpxc.setValue(el, totp);
        } else if (kpxc.credentials[index].stringFields && kpxc.credentials[index].stringFields.length > 0) {
            const stringFields = kpxc.credentials[index].stringFields;
            for (const s of stringFields) {
                const val = s['KPH: {TOTP}'];
                if (val) {
                    kpxc.setValue(el, val);
                }
            }
        }
    }
};

// Fill requested from username icon
kpxc.fillFromUsernameIcon = async function(combination) {
    await kpxc.receiveCredentialsIfNecessary();
    if (kpxc.credentials.length === 0) {
        return;
    } else if (kpxc.credentials.length > 1 && kpxc.settings.autoCompleteUsernames) {
        kpxcAutocomplete.showList(combination.username || combination.password);
        return;
    }

    await sendMessage('page_set_login_id', 0);
    kpxc.fillInCredentials(combination, kpxc.credentials[0].login, kpxc.credentials[0].uuid);
};

/**
 * The main function for filling any credentials
 * @param {Array} combination Combination to be used
 * @param {String} predefinedUsername Predefined username. If set, there's no need to find it from combinations
 * @param {Boolean} passOnly If only password is filled
 * @param {String} uuid Identifier for the entry. There can be identical usernames with different password
 */
kpxc.fillInCredentials = async function(combination, predefinedUsername, uuid, passOnly = false) {
    if (kpxc.credentials.length === 0) {
        kpxcUI.createNotification('error', tr('credentialsNoLoginsFound'));
        return;
    }

    if (!combination || (!combination.username && !combination.password)) {
        return;
    }

    // Use predefined username as default
    let usernameValue = predefinedUsername;
    if (!usernameValue) {
        // With single password field the combination.password is used instead
        usernameValue = combination.username ? combination.username.value : combination.password.value;
    }

    // Find the correct credentials
    const selectedCredentials = kpxc.credentials.find(c => c.uuid === uuid);
    if (!selectedCredentials) {
        return;
    }

    // Handle auto-submit
    let skipAutoSubmit = false;
    if (selectedCredentials.skipAutoSubmit !== undefined) {
        skipAutoSubmit = selectedCredentials.skipAutoSubmit === 'true';
    }

    // Fill password
    if (combination.password) {
        kpxc.setValueWithChange(combination.password, selectedCredentials.password);
        await kpxc.setPasswordFilled(true);
    }

    // Fill username
    if (combination.username && (!combination.username.value || combination.username.value !== usernameValue)) {
        if (!passOnly) {
            kpxc.setValueWithChange(combination.username, usernameValue);
        }
    }

    // Fill StringFields
    if (selectedCredentials.stringFields.length > 0) {
        kpxc.fillInStringFields(combination.fields, selectedCredentials.stringFields);
    }

    // Close autocomplete menu after fill
    kpxcAutocomplete.closeList();

    // Reset ManualFill
    await sendMessage('page_set_manual_fill', ManualFill.NONE);

    // Auto-submit
    if (kpxc.settings.autoSubmit && !skipAutoSubmit) {
        const submitButton = kpxcForm.getFormSubmitButton(combination.form);
        if (submitButton !== undefined) {
            submitButton.click();
        } else {
            combination.form.submit();
        }
    }
};

// Fills StringFields defined in Custom Fields
kpxc.fillInStringFields = function(fields, stringFields) {
    const filledInFields = [];
    if (fields && stringFields && fields.length > 0 && stringFields.length > 0) {
        for (let i = 0; i < fields.length; i++) {
            const currentField = fields[i];
            const stringFieldValue = Object.values(stringFields[i]);

            if (currentField && stringFieldValue[0]) {
                kpxc.setValue(currentField, stringFieldValue[0]);
                filledInFields.push(currentField);
            }
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
        action = document.location.origin + document.location.pathname;
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
            kpxcAutocomplete.create(c.username, false, kpxc.settings.autoSubmit);
        } else if (!c.username && c.password) {
            // Single password field
            kpxcAutocomplete.create(c.password, false, kpxc.settings.autoSubmit);
        }
    }
};

// Looks for any username & password combinations from the detected input fields
kpxc.initCombinations = async function(inputs = []) {
    if (inputs.length === 0) {
        return [];
    }

    const combinations = kpxcFields.isCustomLoginFieldsUsed()
                       ? await kpxcFields.useCustomLoginFields()
                       : await kpxcFields.getAllCombinations(inputs);
    if (!combinations || combinations.length === 0) {
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

    return combinations;
};

// The main function for finding input fields
kpxc.initCredentialFields = async function() {
    await sendMessage('page_clear_logins', _called.clearLogins);
    _called.clearLogins = true;

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

// Intializes the login popup list for choosing credentials
kpxc.initLoginPopup = function() {
    if (kpxc.credentials.length === 0) {
        return;
    }

    const getLoginText = function(credential, withGroup) {
        const name = credential.name.length < MAX_AUTOCOMPLETE_NAME_LEN
                   ? credential.name
                   : credential.name.substr(0, MAX_AUTOCOMPLETE_NAME_LEN) + '…';
        const group = (withGroup && credential.group) ? `[${credential.group}] ` : '';
        const visibleLogin = (credential.login.length > 0) ? credential.login : tr('credentialsNoUsername');
        const text = `${group}${name} (${visibleLogin})`;

        if (credential.expired && credential.expired === 'true') {
            return `${text} [${tr('credentialExpired')}]`;
        }

        return text;
    };

    const getUniqueGroupCount = function(creds) {
        const groups = creds.map(c => c.group || '');
        const uniqueGroups = new Set(groups);
        return uniqueGroups.size;
    };

    // Add usernames + descriptions to autocomplete-list and popup-list
    const usernames = [];
    kpxcAutocomplete.elements = [];
    const showGroupNameInAutocomplete = kpxc.settings.showGroupNameInAutocomplete && (getUniqueGroupCount(kpxc.credentials) > 1);

    for (let i = 0; i < kpxc.credentials.length; i++) {
        const loginText = getLoginText(kpxc.credentials[i], showGroupNameInAutocomplete);
        usernames.push({ text: loginText, uuid: kpxc.credentials[i].uuid });

        kpxcAutocomplete.elements.push({
            label: loginText,
            value: kpxc.credentials[i].login,
            uuid: kpxc.credentials[i].uuid,
            loginId: i
        });
    }

    // Generate popup-list of usernames + descriptions
    sendMessage('popup_login', usernames);
};

kpxc.passwordFilled = async function() {
    return await sendMessage('password_get_filled');
};

// Prepares autocomplete and login popup ready for user interaction
kpxc.prepareCredentials = async function() {
    if (kpxc.credentials.length === 0) {
        return;
    }

    if (kpxc.settings.autoFillSingleEntry && kpxc.credentials.length === 1) {
        kpxc.fillFromAutofill();
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
 */
kpxc.rememberCredentials = async function(usernameValue, passwordValue, urlValue, oldCredentials) {
    const credentials = (oldCredentials !== undefined && oldCredentials.length > 0) ? oldCredentials : kpxc.credentials;
    if (passwordValue === '') {
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
            const index = await sendMessage('page_get_login_id');
            if (index >= 0) {
                usernameValue = credentialsList[index].login;
            }
        }
    }

    // Show the Credential Banner
    kpxcBanner.create({
        username: usernameValue,
        password: passwordValue,
        url: urlValue,
        usernameExists: usernameExists,
        list: credentialsList
    });

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
    const usernameValue = combination.username ? combination.username.value : '';
    const passwordValue = combination.password ? combination.password.value : '';

    const result = await kpxc.rememberCredentials(usernameValue, passwordValue);
    if (result === undefined) {
        kpxcUI.createNotification('error', tr('rememberNoPassword'));
        return;
    }

    if (!result) {
        kpxcUI.createNotification('warning', tr('rememberCredentialsExists'));
    }
};

// The basic function for retrieving credentials from KeePassXC
kpxc.retrieveCredentials = async function() {
    kpxc.url = document.location.href;
    kpxc.submitUrl = kpxc.getFormActionUrl(kpxc.combinations[0]);

    if (kpxc.settings.autoRetrieveCredentials && kpxc.url && kpxc.submitUrl) {
        await kpxc.retrieveCredentialsCallback(await sendMessage('retrieve_credentials', [ kpxc.url, kpxc.submitUrl ]));
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
    field.dispatchEvent(new Event('input', { 'bubbles': true }));
    field.dispatchEvent(new Event('change', { 'bubbles': true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: false, key: '', char: '' }));
    field.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: false, key: '', char: '' }));
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: false, key: '', char: '' }));
};

// Returns true if site is ignored
kpxc.siteIgnored = async function(condition) {
    if (kpxc.settings.sitePreferences) {
        let currentLocation;
        try {
            currentLocation = window.top.location.href;
        } catch (err) {
            // Cross-domain security error inspecting window.top.location.href.
            // This catches an error when an iframe is being accessed from another (sub)domain -> use the iframe URL instead.
            currentLocation = window.self.location.href;
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


/**
 * @Object kpxcObserverHelper
 * MutationObserver handler for dynamically added input fields.
 */
const kpxcObserverHelper = {};
kpxcObserverHelper.ignoredNodeNames = [ 'g', 'path', 'svg', 'A', 'HEAD', 'HTML', 'LABEL', 'LINK', 'SCRIPT', 'SPAN', 'VIDEO' ];

kpxcObserverHelper.ignoredNodeTypes = [
    Node.ATTRIBUTE_NODE,
    Node.TEXT_NODE,
    Node.CDATA_SECTION_NODE,
    Node.PROCESSING_INSTRUCTION_NODE,
    Node.COMMENT_NODE,
    Node.DOCUMENT_TYPE_NODE,
    Node.NOTATION_NODE
];

kpxcObserverHelper.inputTypes = [
    'text',
    'email',
    'password',
    'tel',
    'number',
    'username', // Note: Not a standard
    undefined, // Input field can be without any type. Include this and null to the list.
    null
];

// Define what element should be observed by the observer
// and what types of mutations trigger the callback
kpxcObserverHelper.observerConfig = {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
    attributeFilter: [ 'style', 'class' ]
};

// Stores mutation style to an cache array
// If there's a single style mutation, it's safe to calculate it
kpxcObserverHelper.cacheStyle = function(mut, styleMutations, mutationCount) {
    if (mut.attributeName !== 'style') {
        return;
    }

    // If the target is inside a form we are monitoring, calculate the CSS style for better compatibility.
    // getComputedStyle() is very slow, so we cannot do that for every style target.
    let style = mut.target.style;
    if (kpxcForm.formIdentified(mut.target.parentNode) || mutationCount === 1) {
        style = getComputedStyle(mut.target);
    }

    if (style.display || style.zIndex) {
        if (!styleMutations.some(m => m.target === mut.target)) {
            styleMutations.push({
                target: mut.target,
                display: style.display,
                zIndex: style.zIndex
            });
        } else {
            const currentStyle = styleMutations.find(m => m.target === mut.target);
            if (currentStyle
                && (currentStyle.display !== style.display
                || currentStyle.zIndex !== style.zIndex)) {
                currentStyle.display = style.display;
                currentStyle.zIndex = style.zIndex;
            }
        }
    }
};

// Gets input fields from the target
kpxcObserverHelper.getInputs = function(target, ignoreVisibility = false) {
    // Ignores target element if it's not an element node
    if (kpxcObserverHelper.ignoredNode(target)) {
        return [];
    }

    // Filter out any input fields with type 'hidden' right away
    const inputFields = [];
    Array.from(target.getElementsByTagName('input')).forEach(e => {
        if (e.type !== 'hidden' && !e.disabled && !kpxcObserverHelper.alreadyIdentified(e)) {
            inputFields.push(e);
        }
    });

    if (target.nodeName === 'INPUT') {
        inputFields.push(target);
    }

    // Append any input fields in Shadow DOM
    if (target.shadowRoot) {
        target.shadowSelectorAll('input').forEach(e => {
            if (e.type !== 'hidden' && !e.disabled && !kpxcObserverHelper.alreadyIdentified(e)) {
                inputFields.push(e);
            }
        });
    }

    if (inputFields.length === 0) {
        return [];
    }

    // Do not allow more visible inputs than _maximumInputs (default value: 100) -> return the first 100
    if (inputFields.length > _maximumInputs) {
        return inputFields.slice(0, _maximumInputs);
    }

    // Only include input fields that match with kpxcObserverHelper.inputTypes
    const inputs = [];
    for (const field of inputFields) {
        if ((!ignoreVisibility && !kpxcFields.isVisible(field))
            || kpxcFields.isSearchField(field)) {
            continue;
        }

        const type = field.getLowerCaseAttribute('type');
        if (kpxcObserverHelper.inputTypes.includes(type)) {
            inputs.push(field);
        }
    }

    return inputs;
};

// Checks if the input field has already identified at page load
kpxcObserverHelper.alreadyIdentified = function(target) {
    return kpxc.inputs.some(e => e === target);
};

// Adds elements to a monitor array. Identifies the input fields.
kpxcObserverHelper.handleObserverAdd = async function(target) {
    if (kpxcObserverHelper.ignoredElement(target)) {
        return;
    }

    // Sometimes the settings haven't been loaded before new input fields are detected
    if (Object.keys(kpxc.settings).length === 0) {
        kpxc.init();
        return;
    }

    const inputs = kpxcObserverHelper.getInputs(target);
    if (inputs.length === 0) {
        return;
    }

    await kpxc.initCombinations(inputs);
    await kpxcIcons.initIcons(kpxc.combinations);

    if (kpxc.databaseState === DatabaseState.UNLOCKED) {
        if (_called.retrieveCredentials === false) {
            await kpxc.retrieveCredentials();
            return;
        }

        kpxc.prepareCredentials();
    }
};

// Removes monitored elements
kpxcObserverHelper.handleObserverRemove = function(target) {
    if (kpxcObserverHelper.ignoredElement(target)) {
        return;
    }

    const inputs = kpxcObserverHelper.getInputs(target, true);
    if (inputs.length === 0) {
        return;
    }

    kpxcIcons.deleteHiddenIcons();
};

// Handles CSS transitionend event
kpxcObserverHelper.handleTransitionEnd = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcObserverHelper.handleObserverAdd(e.currentTarget);
};

// Returns true if element should be ignored
kpxcObserverHelper.ignoredElement = function(target) {
    if (kpxcObserverHelper.ignoredNode(target)) {
        return true;
    }

    // Ignore elements that do not have a className (including SVG)
    if (typeof target.className !== 'string') {
        return true;
    }

    return false;
};

// Ignores all nodes that doesn't contain elements
// Also ignore few Youtube-specific custom nodeNames
kpxcObserverHelper.ignoredNode = function(target) {
    if (!target
        || kpxcObserverHelper.ignoredNodeTypes.some(e => e === target.nodeType)
        || kpxcObserverHelper.ignoredNodeNames.some(e => e === target.nodeName)
        || target.nodeName.startsWith('YTMUSIC')
        || target.nodeName.startsWith('YT-')) {
        return true;
    }

    return false;
};

// Initializes MutationObserver
kpxcObserverHelper.initObserver = async function() {
    kpxc.observer = new MutationObserver(function(mutations, obs) {
        if (document.visibilityState === 'hidden' || kpxcUI.mouseDown) {
            return;
        }

        // Limit the maximum number of mutations
        if (mutations.length > _maximumMutations) {
            mutations = mutations.slice(0, _maximumMutations);
        }

        const styleMutations = [];
        for (const mut of mutations) {
            if (kpxcObserverHelper.ignoredNode(mut.target)) {
                continue;
            }

            // Cache style mutations. We only need the last style mutation of the target.
            kpxcObserverHelper.cacheStyle(mut, styleMutations, mutations.length);

            if (mut.type === 'childList') {
                if (mut.addedNodes.length > 0) {
                    kpxcObserverHelper.handleObserverAdd(mut.addedNodes[0]);
                } else if (mut.removedNodes.length > 0) {
                    kpxcObserverHelper.handleObserverRemove(mut.removedNodes[0]);
                }
            } else if (mut.type === 'attributes' && mut.attributeName === 'class') {
                // Only accept targets with forms
                const forms = mut.target.nodeName === 'FORM' ? mut.target : mut.target.getElementsByTagName('form');
                if (forms.length === 0 && !kpxcSites.exceptionFound(mut.target.classList)) {
                    continue;
                }

                // There's an issue here. We cannot know for sure if the class attribute if added or removed.
                kpxcObserverHelper.handleObserverAdd(mut.target);
            }
        }

        // Handle cached style mutations
        for (const styleMut of styleMutations) {
            if (styleMut.display !== 'none' && styleMut.display !== '') {
                kpxcObserverHelper.handleObserverAdd(styleMut.target);
            } else {
                kpxcObserverHelper.handleObserverRemove(styleMut.target);
            }
        }
    });

    if (document.body) {
        kpxc.observer.observe(document.body, kpxcObserverHelper.observerConfig);
    }
};

MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

/**
 * Content script initialization.
 */
const initContentScript = async function() {
    try {
        const settings = await sendMessage('load_settings');
        if (!settings) {
            console.log('Error: Cannot load extension settings');
            return;
        }

        kpxc.settings = settings;

        if (await kpxc.siteIgnored()) {
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
        console.log('initContentScript error: ', err);
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
            return;
        }

        if (req.action === 'activated_tab') {
            kpxc.triggerActivatedTab();
        } else if (req.action === 'add_username_only_option') {
            kpxc.addToSitePreferences();
        } else if (req.action === 'check_database_hash' && 'hash' in req) {
            kpxc.detectDatabaseChange(req);
        } else if (req.action === 'choose_credential_fields') {
            kpxcDefine.init();
        } else if (req.action === 'clear_credentials') {
            kpxc.clearAllFromPage();
        } else if (req.action === 'fill_user_pass_with_specific_login') {
            kpxc.fillFromPopup(req.id, req.uuid);
        } else if (req.action === 'fill_username_password') {
            sendMessage('page_set_manual_fill', ManualFill.BOTH);
            await kpxc.receiveCredentialsIfNecessary();
            kpxc.fillInFromActiveElement();
        } else if (req.action === 'fill_password') {
            sendMessage('page_set_manual_fill', ManualFill.PASSWORD);
            await kpxc.receiveCredentialsIfNecessary();
            kpxc.fillInFromActiveElement(true); // passOnly to true
        } else if (req.action === 'fill_totp') {
            await kpxc.receiveCredentialsIfNecessary();
            kpxc.fillFromTOTP();
        } else if (req.action === 'fill_attribute' && req.args) {
            await kpxc.receiveCredentialsIfNecessary();
            kpxc.fillAttributeToActiveElementWith(req.args);
        } else if (req.action === 'ignore_site') {
            kpxc.ignoreSite(req.args);
        } else if (req.action === 'redetect_fields') {
            const response = await sendMessage('load_settings');
            kpxc.settings = response;
            kpxc.inputs = [];
            kpxc.combinations = [];
            kpxc.initCredentialFields();
        } else if (req.action === 'remember_credentials') {
            kpxc.rememberCredentialsFromContextMenu();
        } else if (req.action === 'show_password_generator') {
            kpxcPasswordDialog.trigger();
        }
    }
});
