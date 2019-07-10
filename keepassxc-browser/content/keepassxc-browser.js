'use strict';

// contains already called method names
var _called = {};
_called.retrieveCredentials = false;
_called.clearLogins = false;
_called.manualFillRequested = 'none';
let _singleInputEnabledForPage = false;
const _maximumInputs = 100;

// Count of detected form fields on the page
var _detectedFields = 0;

// Element id's containing input fields detected by MutationObserver
var _observerIds = [];

// Document URL
let _documentURL = document.location.href;

// These are executed in each frame
browser.runtime.onMessage.addListener(function(req, sender) {
    if ('action' in req) {
        if (req.action === 'fill_user_pass_with_specific_login') {
            if (kpxc.credentials[req.id]) {
                let combination = null;
                if (kpxc.u) {
                    kpxc.setValueWithChange(kpxc.u, kpxc.credentials[req.id].login);
                    combination = kpxcFields.getCombination('username', kpxc.u);
                    browser.runtime.sendMessage({
                        action: 'page_set_login_id', args: [ req.id ]
                    });
                    kpxc.u.focus();
                }
                if (kpxc.p) {
                    kpxc.setValueWithChange(kpxc.p, kpxc.credentials[req.id].password);
                    browser.runtime.sendMessage({
                        action: 'page_set_login_id', args: [ req.id ]
                    });
                    combination = kpxcFields.getCombination('password', kpxc.p);
                }

                let list = [];
                if (kpxc.fillInStringFields(combination.fields, kpxc.credentials[req.id].stringFields, list)) {
                    kpxcForm.destroy(false, { 'password': list.list[0], 'username': list.list[1] });
                }
            }
        } else if (req.action === 'fill_username_password') {
            _called.manualFillRequested = 'both';
            kpxc.receiveCredentialsIfNecessary().then((response) => {
                kpxc.fillInFromActiveElement(false);
            });
        } else if (req.action === 'fill_password') {
            _called.manualFillRequested = 'pass';
            kpxc.receiveCredentialsIfNecessary().then((response) => {
                kpxc.fillInFromActiveElement(false, true); // passOnly to true
            });
        } else if (req.action === 'fill_totp') {
            kpxc.receiveCredentialsIfNecessary().then((response) => {
                kpxc.fillInFromActiveElementTOTPOnly(false);
            });
        } else if (req.action === 'clear_credentials') {
            kpxcEvents.clearCredentials();
            return Promise.resolve();
        } else if (req.action === 'activated_tab') {
            kpxcEvents.triggerActivatedTab();
            return Promise.resolve();
        } else if (req.action === 'ignore_site') {
            kpxc.ignoreSite(req.args);
        } else if (req.action === 'check_database_hash' && 'hash' in req) {
            kpxc.detectDatabaseChange(req.hash);
        } else if (req.action === 'activate_password_generator') {
            kpxc.initPasswordGenerator(kpxcFields.getAllFields());
        } else if (req.action === 'remember_credentials') {
            kpxc.contextMenuRememberCredentials();
        } else if (req.action === 'choose_credential_fields') {
            kpxcDefine.init();
        } else if (req.action === 'redetect_fields') {
            browser.runtime.sendMessage({
                action: 'load_settings'
            }).then((response) => {
                kpxc.settings = response;
                kpxc.initCredentialFields(true);
            });
        } else if (req.action === 'show_password_generator') {
            kpxcPassword.trigger();
        }
    }
});

function _f(fieldId) {
    const inputs = document.querySelectorAll(`input[data-kpxc-id='${fieldId}']`);
    return inputs.length > 0 ? inputs[0] : null;
}

function _fs(fieldId) {
    const inputs = document.querySelectorAll(`input[data-kpxc-id='${fieldId}'], select[data-kpxc-id='${fieldId}']`);
    return inputs.length > 0 ? inputs[0] : null;
}


var kpxcForm = {};

kpxcForm.init = function(form, credentialFields) {
    if (!form.getAttribute('kpxcForm-initialized') && (credentialFields.password || credentialFields.username)) {
        form.setAttribute('kpxcForm-initialized', true);
        kpxcForm.setInputFields(form, credentialFields);
        form.addEventListener('submit', kpxcForm.onSubmit);

        const submitButton = kpxc.getSubmitButton(form);
        if (submitButton !== undefined) {
            submitButton.addEventListener('click', kpxcForm.onSubmit);
        }
    }
};

kpxcForm.destroy = function(form, credentialFields) {
    if (form === false && credentialFields) {
        const field = _f(credentialFields.password) || _f(credentialFields.username);
        if (field) {
            form = field.closest('form');
        }
    }

    if (form && form.length > 0) {
        form.removeEventListener('submit', kpxcForm.onSubmit);
    }
};

kpxcForm.setInputFields = function(form, credentialFields) {
    form.setAttribute('kpxcUsername', credentialFields.username);
    form.setAttribute('kpxcPassword', credentialFields.password);
};

kpxcForm.onSubmit = function() {
    const form = this.nodeName === 'FORM' ? this : this.form;
    const usernameId = form.getAttribute('kpxcUsername');
    const passwordId = form.getAttribute('kpxcPassword');

    let usernameValue = '';
    let passwordValue = '';

    const usernameField = _f(usernameId);
    const passwordField = _f(passwordId);

    if (usernameField) {
        usernameValue = usernameField.value || usernameField.placeholder;
    }
    if (passwordField) {
        passwordValue = passwordField.value;
    }

    kpxc.rememberCredentials(usernameValue, passwordValue);
};


var kpxcFields = {};

kpxcFields.inputQueryPattern = 'input[type=\'text\'], input[type=\'email\'], input[type=\'password\'], input[type=\'tel\'], input[type=\'number\'], input[type=\'username\'], input:not([type])';

// copied from Sizzle.js
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

// Unique number as new IDs for input fields
kpxcFields.uniqueNumber = 342845638;
// Objects with combination of username + password fields
kpxcFields.combinations = [];

kpxcFields.setUniqueId = function(field) {
    if (field && !field.getAttribute('data-kpxc-id')) {
        // Use ID of field if it is unique
        const fieldId = field.getAttribute('id');
        if (fieldId) {
            const foundIds = document.querySelectorAll('input#' + kpxcFields.prepareId(fieldId));
            if (foundIds.length === 1) {
                field.setAttribute('data-kpxc-id', fieldId);
                return;
            }
        }

        // Create own ID if no ID is set for this field
        kpxcFields.uniqueNumber += 1;
        field.setAttribute('data-kpxc-id', 'kpxcpw' + String(kpxcFields.uniqueNumber));
    }
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

kpxcFields.getOverflowHidden = function(field) {
    return kpxcFields.traverseParents(field, f => f.style.overflow === 'hidden');
};

// Checks if input field is a search field. Attributes or form action containing 'search', or parent element holding
// role="search" will be identified as a search field.
kpxcFields.isSearchField = function(target) {
    const attributes = target.attributes;

    // Check element attributes
    for (const attr of attributes) {
        if ((attr.value && (attr.value.toLowerCase().includes('search')) || attr.value === 'q')) {
            return true;
        }
    }

    // Check closest form
    const closestForm = target.closest('form');
    if (closestForm) {
        // Check form action
        const formAction = closestForm.getAttribute('action');
        if (formAction && (formAction.toLowerCase().includes('search') &&
            !formAction.toLowerCase().includes('research'))) {
            return true;
        }

        // Check form class and id
        const closestFormId = closestForm.getAttribute('id');
        const closestFormClass = closestForm.className;
        if (closestFormClass && (closestForm.className.toLowerCase().includes('search') ||
            (closestFormId && closestFormId.toLowerCase().includes('search') && !closestFormId.toLowerCase().includes('research')))) {
            return true;
        }
    }

    // Check parent elements for role="search"
    const roleFunc = f => f.getAttribute('role');
    const roleValue = kpxcFields.traverseParents(target, roleFunc, roleFunc, () => null);
    if (roleValue && roleValue === 'search') {
        return true;
    }

    return false;
};

kpxcFields.isVisible = function(field) {
    const rect = field.getBoundingClientRect();

    // Check CSS visibility
    const fieldStyle = getComputedStyle(field);
    if (fieldStyle.visibility && (fieldStyle.visibility === 'hidden' || fieldStyle.visibility === 'collapse')) {
        return false;
    }

    // Check element position and size
    if (rect.x < 0 || rect.y < 0 || rect.width < 8 || rect.height < 8) {
        return false;
    }

    return true;
};

kpxcFields.getAllFields = function() {
    const fields = [];
    const inputs = kpxcObserverHelper.getInputs(document);
    for (const i of inputs) {
        if (kpxcFields.isVisible(i) && !kpxcFields.isSearchField(i)) {
            kpxcFields.setUniqueId(i);
            fields.push(i);
        }
    }

    _detectedFields = fields.length;
    return fields;
};

kpxcFields.prepareVisibleFieldsWithID = function(pattern) {
    const patterns = document.querySelectorAll(pattern);
    for (const i of patterns) {
        if (kpxcFields.isVisible(i) && i.style.visibility !== 'hidden' && i.style.visibility !== 'collapsed') {
            kpxcFields.setUniqueId(i);
        }
    }
};

kpxcFields.getAllCombinations = function(inputs) {
    const fields = [];
    let uField = null;

    for (const i of inputs) {
        if (i) {
            if (i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                const uId = (!uField || uField.length < 1) ? null : uField.getAttribute('data-kpxc-id');

                const combination = {
                    username: uId,
                    password: i.getAttribute('data-kpxc-id')
                };
                fields.push(combination);

                // Reset selected username field
                uField = null;
            } else {
                // Username field
                uField = i;
            }
        }
    }

    if (_singleInputEnabledForPage && fields.length === 0 && uField) {
        const combination = {
            username: uField.getAttribute('data-kpxc-id'),
            password: null
        };
        fields.push(combination);
    }

    return fields;
};

kpxcFields.getCombination = function(givenType, fieldId) {
    if (kpxcFields.combinations.length === 0) {
        if (kpxcFields.useDefinedCredentialFields()) {
            return kpxcFields.combinations[0];
        }
    }
    // Use defined credential fields (already loaded into combinations)
    const location = kpxc.getDocumentLocation();
    if (kpxc.settings['defined-custom-fields'] && kpxc.settings['defined-custom-fields'][location]) {
        return kpxcFields.combinations[0];
    }

    for (const c of kpxcFields.combinations) {
        if (c[givenType] === fieldId) {
            return c;
        }
    }

    // Find new combination
    let combination = {
        username: null,
        password: null
    };

    let newCombi = false;
    if (givenType === 'username') {
        const passwordField = kpxcFields.getPasswordField(fieldId, true);
        let passwordId = null;
        if (passwordField) {
            passwordId = kpxcFields.prepareId(passwordField.getAttribute('data-kpxc-id'));
        }
        combination = {
            username: fieldId,
            password: passwordId
        };
        newCombi = true;
    } else if (givenType === 'password') {
        const usernameField = kpxcFields.getUsernameField(fieldId, true);
        let usernameId = null;
        if (usernameField) {
            usernameId = kpxcFields.prepareId(usernameField.getAttribute('data-kpxc-id'));
        }
        combination = {
            username: usernameId,
            password: fieldId
        };
        newCombi = true;
    }

    if (combination.username || combination.password) {
        kpxcFields.combinations.push(combination);
    }

    if (combination.username) {
        if (kpxc.credentials.length > 0) {
            kpxc.preparePageForMultipleCredentials(kpxc.credentials);
        }
    }

    if (newCombi) {
        combination.isNew = true;
    }
    return combination;
};

/**
* Return the username field or null if it not exists
*/
kpxcFields.getUsernameField = function(passwordId, checkDisabled) {
    const passwordField = _f(passwordId);
    if (!passwordField) {
        return null;
    }

    const form = passwordField.closest('form');
    let usernameField = null;

    // Search all inputs on this one form
    if (form) {
        const inputs = form.querySelectorAll(kpxcFields.inputQueryPattern);
        for (const i of inputs) {
            kpxcFields.setUniqueId(i);
            if (i.getAttribute('data-kpxc-id') === passwordId) {
                return false; // Break
            }

            if (i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                return true; // Continue
            }

            usernameField = i;
        }
    } else {
        // Search all inputs on page
        const inputs = kpxcFields.getAllFields();
        kpxc.initPasswordGenerator(inputs);
        for (const i of inputs) {
            if (i.getAttribute('data-kpxc-id') === passwordId) {
                break;
            }

            if (i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                continue;
            }

            usernameField = i;
        }
    }

    if (usernameField && !checkDisabled) {
        const usernameId = usernameField.getAttribute('data-kpxc-id');
        // Check if usernameField is already used by another combination
        for (const c of kpxcFields.combinations) {
            if (c.username === usernameId) {
                usernameField = null;
                break;
            }
        }
    }

    kpxcFields.setUniqueId(usernameField);
    return usernameField;
};

/**
* Return the password field or null if it not exists
*/
kpxcFields.getPasswordField = function(usernameId, checkDisabled) {
    const usernameField = _f(usernameId);
    if (!usernameField) {
        return null;
    }

    const form = usernameField.closest('form');
    let passwordField = null;

    // Search all inputs on this one form
    if (form) {
        const inputs = form.querySelectorAll('input[type=\'password\']');
        if (inputs.length > 0) {
            passwordField = inputs[0];
        }
        if (passwordField && passwordField.length < 1) {
            passwordField = null;
        }

        if (kpxc.settings.usePasswordGenerator) {
            kpxcPassword.init();
            kpxcPassword.initField(passwordField);
        }
    } else {
        // Search all inputs on page
        const inputs = kpxcFields.getAllFields();
        kpxc.initPasswordGenerator(inputs);

        let active = false;
        for (const i of inputs) {
            if (i.getAttribute('data-kpxc-id') === usernameId) {
                active = true;
            }
            if (active && i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                passwordField = i;
                break;
            }
        }
    }

    if (passwordField && !checkDisabled) {
        const passwordId = passwordField.getAttribute('data-kpxc-id');
        // Check if passwordField is already used by another combination
        for (const c of kpxcFields.combinations) {
            if (c.password === passwordId) {
                passwordField = null;
                break;
            }
        }
    }

    kpxcFields.setUniqueId(passwordField);
    return passwordField;
};

kpxcFields.prepareCombinations = function(combinations) {
    for (const c of combinations) {
        const pwField = _f(c.password);
        // Needed for auto-complete: don't overwrite manually filled-in password field
        if (pwField && !pwField.getAttribute('kpxcFields-onChange')) {
            pwField.setAttribute('kpxcFields-onChange', true);
            pwField.addEventListener('change', function() {
                this.setAttribute('unchanged', false);
            });
        }

        // Initialize form-submit for remembering credentials
        const fieldId = c.password || c.username;
        const field = _f(fieldId);
        if (field) {
            const form = field.closest('form');
            if (form && form.length > 0) {
                kpxcForm.init(form, c);
            }
        }
    }
};

kpxcFields.useDefinedCredentialFields = function() {
    const location = kpxc.getDocumentLocation();
    if (kpxc.settings['defined-custom-fields'] && kpxc.settings['defined-custom-fields'][location]) {
        const creds = kpxc.settings['defined-custom-fields'][location];

        let found = _f(creds.username) || _f(creds.password);
        for (const i of creds.fields) {
            if (_fs(i)) {
                found = true;
                break;
            }
        }

        if (found) {
            const fields = {
                username: creds.username,
                password: creds.password,
                fields: creds.fields
            };
            kpxcFields.combinations = [];
            kpxcFields.combinations.push(fields);

            return true;
        }
    }

    return false;
};

var kpxcObserverHelper = {};
kpxcObserverHelper.inputTypes = [
    'text',
    'email',
    'password',
    'tel',
    'number',
    'username', // Note: Not a standard
    null // Input field can be without any type. Include these to the list.
];

// Ignores all nodes that doesn't contain elements
kpxcObserverHelper.ignoredNode = function(target) {
    if (target.nodeType === Node.ATTRIBUTE_NODE ||
        target.nodeType === Node.TEXT_NODE ||
        target.nodeType === Node.CDATA_SECTION_NODE ||
        target.nodeType === Node.PROCESSING_INSTRUCTION_NODE ||
        target.nodeType === Node.COMMENT_NODE ||
        target.nodeType === Node.DOCUMENT_TYPE_NODE ||
        target.nodeType === Node.NOTATION_NODE) {
        return true;
    }
    return false;
};

kpxcObserverHelper.getInputs = function(target) {
    // Ignores target element if it's not an element node
    if (kpxcObserverHelper.ignoredNode(target)) {
        return [];
    }

    // Filter out any input fields with type 'hidden' right away
    const inputFields = [];
    Array.from(target.getElementsByTagName('input')).forEach((e) => {
        if (e.type !== 'hidden') {
            inputFields.push(e);
        }
    });

    // Do not allow more visible inputs than _maximumInputs (default value: 100)
    if (inputFields.length === 0 || inputFields.length > _maximumInputs) {
        return [];
    }

    // Only include input fields that match with kpxcObserverHelper.inputTypes
    const inputs = [];
    for (const i of inputFields) {
        let type = i.getAttribute('type');
        if (type) {
            type = type.toLowerCase();
        }

        if (kpxcObserverHelper.inputTypes.includes(type)) {
            inputs.push(i);
        }
    }
    return inputs;
};

kpxcObserverHelper.getId = function(target) {
    return target.classList.length === 0 ? target.id : target.classList;
};

kpxcObserverHelper.ignoredElement = function(target) {
    // Ignore elements that do not have a className (including SVG)
    if (typeof target.className !== 'string') {
        return true;
    }

    // Ignore KeePassXC-Browser classes
    if (target.className && target.className !== undefined &&
        (target.className.includes('kpxc') || target.className.includes('ui-helper'))) {
        return true;
    }

    return false;
};

kpxcObserverHelper.handleObserverAdd = function(target) {
    if (kpxcObserverHelper.ignoredElement(target)) {
        return;
    }

    const inputs = kpxcObserverHelper.getInputs(target);
    if (inputs.length === 0) {
        return;
    }

    const neededLength = _detectedFields === 1 ? 0 : 1;
    const id = kpxcObserverHelper.getId(target);
    if (inputs.length > neededLength && !_observerIds.includes(id)) {
        // Save target element id for preventing multiple calls to initCredentialsFields()
        _observerIds.push(id);

        // Sometimes the settings haven't been loaded before new input fields are detected
        if (Object.keys(kpxc.settings).length === 0) {
            kpxc.init();
        } else {
            kpxc.initCredentialFields(true);
        }
    }
};

kpxcObserverHelper.handleObserverRemove = function(target) {
    if (kpxcObserverHelper.ignoredElement(target)) {
        return;
    }

    const inputs = kpxcObserverHelper.getInputs(target);
    if (inputs.length === 0) {
        return;
    }

    // Remove target element id from the list
    const id = kpxcObserverHelper.getId(target);
    if (_observerIds.includes(id)) {
        const index = _observerIds.indexOf(id);
        if (index >= 0) {
            _observerIds.splice(index, 1);
        }
    }
};

kpxcObserverHelper.detectURLChange = function() {
    if (_documentURL !== document.location.href) {
        _documentURL = document.location.href;
        kpxcEvents.clearCredentials();
        kpxc.initCredentialFields(true);
    }
};

MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

// Detects DOM changes in the document
const observer = new MutationObserver(function(mutations, obs) {
    if (document.visibilityState === 'hidden') {
        return;
    }

    for (const mut of mutations) {
        // Skip text nodes
        if (mut.target.nodeType === Node.TEXT_NODE) {
            continue;
        }

        // Check document URL change and detect new fields
        kpxcObserverHelper.detectURLChange();

        // Handle attributes only if CSS display is modified
        if (mut.type === 'attributes') {
            const newValue = mut.target.getAttribute(mut.attributeName);
            if (newValue && (newValue.includes('display') || newValue.includes('z-index'))) {
                if (mut.target.style.display !== 'none') {
                    kpxcObserverHelper.handleObserverAdd(mut.target);
                } else {
                    kpxcObserverHelper.handleObserverRemove(mut.target);
                }
            }
        } else if (mut.type === 'childList') {
            kpxcObserverHelper.handleObserverAdd((mut.addedNodes.length > 0) ? mut.addedNodes[0] : mut.target);
            kpxcObserverHelper.handleObserverRemove((mut.removedNodes.length > 0) ? mut.removedNodes[0] : mut.target);
        }
    }
});

// define what element should be observed by the observer
// and what types of mutations trigger the callback
observer.observe(document, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
    attributeFilter: [ 'style' ]
});

var kpxc = {};
kpxc.settings = {};
kpxc.u = null;
kpxc.p = null;
kpxc.url = null;
kpxc.submitUrl = null;
kpxc.credentials = [];

const initcb = function() {
    browser.runtime.sendMessage({
        action: 'load_settings'
    }).then((response) => {
        kpxc.settings = response;
        kpxc.initCredentialFields();
    });
};

if (document.readyState === 'complete' || (document.readyState !== 'loading' && !document.documentElement.doScroll)) {
    initcb();
} else {
    document.addEventListener('DOMContentLoaded', initcb);
}

kpxc.init = function() {
    initcb();
};

// Clears all from the content and background scripts, including autocomplete
kpxc.clearAllFromPage = function() {
    kpxcEvents.clearCredentials();

    browser.runtime.sendMessage({
        action: 'page_clear_logins'
    });

    // Switch back to default popup
    browser.runtime.sendMessage({
        action: 'get_status',
        args: [ true ] // Set polling to true, this is an internal function call
    });
};

// Switch credentials if database is changed or closed
kpxc.detectDatabaseChange = function(response) {
    kpxc.clearAllFromPage();
    if (document.visibilityState !== 'hidden') {
        if (response.new !== '' && response.new !== response.old) {
            _called.retrieveCredentials = false;
            browser.runtime.sendMessage({
                action: 'load_settings'
            }).then((settings) => {
                kpxc.settings = settings;
                kpxc.initCredentialFields(true);

                // If user has requested a manual fill through context menu the actual credential filling
                // is handled here when the opened database has been regognized. It's not a pretty hack.
                if (_called.manualFillRequested && _called.manualFillRequested !== 'none') {
                    kpxc.fillInFromActiveElement(false, _called.manualFillRequested === 'pass');
                    _called.manualFillRequested = 'none';
                }
            });
        }
    }
};

kpxc.initCredentialFields = function(forceCall) {
    if (_called.initCredentialFields && !forceCall) {
        return;
    }
    _called.initCredentialFields = true;

    browser.runtime.sendMessage({ 'action': 'page_clear_logins', args: [ _called.clearLogins ] }).then(() => {
        _called.clearLogins = true;

        // Check site preferences
        kpxc.initializeSitePreferences();
        if (kpxc.settings.sitePreferences) {
            for (const site of kpxc.settings.sitePreferences) {
                try {
                    if (siteMatch(site.url, window.top.location.href) || site.url === window.top.location.href) {
                        if (site.ignore === IGNORE_FULL) {
                            return;
                        }

                        _singleInputEnabledForPage = site.usernameOnly;
                    }
                } catch (err) {
                    return;
                }
            }
        }

        const inputs = kpxcFields.getAllFields();
        if (inputs.length === 0) {
            return;
        }

        kpxcFields.prepareVisibleFieldsWithID('select');
        kpxc.initPasswordGenerator(inputs);

        if (!kpxcFields.useDefinedCredentialFields()) {
            // Get all combinations of username + password fields
            kpxcFields.combinations = kpxcFields.getAllCombinations(inputs);
        }
        kpxcFields.prepareCombinations(kpxcFields.combinations);

        if (kpxcFields.combinations.length === 0 && inputs.length === 0) {
            browser.runtime.sendMessage({
                action: 'show_default_browseraction'
            });
            return;
        }

        kpxc.url = document.location.origin;
        kpxc.submitUrl = kpxc.getFormActionUrl(kpxcFields.combinations[0]);

        // Get submitUrl for a single input
        if (!kpxc.submitUrl && kpxcFields.combinations.length === 1 && inputs.length === 1) {
            kpxc.submitUrl = kpxc.getFormActionUrlFromSingleInput(inputs[0]);
        }

        if (kpxc.settings.autoRetrieveCredentials && _called.retrieveCredentials === false && (kpxc.url && kpxc.submitUrl)) {
            browser.runtime.sendMessage({
                action: 'retrieve_credentials',
                args: [ kpxc.url, kpxc.submitUrl ]
            }).then(kpxc.retrieveCredentialsCallback).catch((e) => {
                console.log(e);
            });
        } else if (_singleInputEnabledForPage) {
            kpxc.preparePageForMultipleCredentials(kpxc.credentials);
        }
    });
};

kpxc.initPasswordGenerator = function(inputs) {
    if (kpxc.settings.usePasswordGenerator) {
        kpxcPassword.init();

        for (let i = 0; i < inputs.length; i++) {
            if (inputs[i] && inputs[i].getAttribute('type') && inputs[i].getAttribute('type').toLowerCase() === 'password') {
                kpxcPassword.initField(inputs[i], inputs, i);
            }
        }
    }
};

kpxc.receiveCredentialsIfNecessary = function() {
    return new Promise((resolve, reject) => {
        if (kpxc.credentials.length === 0 && _called.retrieveCredentials === false) {
            browser.runtime.sendMessage({
                action: 'retrieve_credentials',
                args: [ kpxc.url, kpxc.submitUrl, false, true ] // Sets triggerUnlock to true
            }).then((credentials) => {
                // If the database was locked, this is scope never met. In these cases the response is met at kpxc.detectDatabaseChange
                _called.manualFillRequested = 'none';
                kpxc.retrieveCredentialsCallback(credentials, false);
                resolve(credentials);
            });
        } else {
            resolve(kpxc.credentials);
        }
    });
};

kpxc.retrieveCredentialsCallback = function(credentials, dontAutoFillIn) {
    if (kpxcFields.combinations.length > 0) {
        kpxc.u = _f(kpxcFields.combinations[0].username);
        kpxc.p = _f(kpxcFields.combinations[0].password);
    }

    if (credentials && credentials.length > 0) {
        kpxc.credentials = credentials;
        kpxc.prepareFieldsForCredentials(!Boolean(dontAutoFillIn));
        _called.retrieveCredentials = true;
    }
};

kpxc.prepareFieldsForCredentials = function(autoFillInForSingle) {
    // Only one login for this site
    if (autoFillInForSingle && kpxc.settings.autoFillSingleEntry && kpxc.credentials.length === 1) {
        let combination = null;
        if (!kpxc.p && !kpxc.u && kpxcFields.combinations.length > 0) {
            kpxc.u = _f(kpxcFields.combinations[0].username);
            kpxc.p = _f(kpxcFields.combinations[0].password);
            combination = kpxcFields.combinations[0];
        }
        if (kpxc.u) {
            kpxc.setValueWithChange(kpxc.u, kpxc.credentials[0].login);
            combination = kpxcFields.getCombination('username', kpxc.u);
        }
        if (kpxc.p) {
            kpxc.setValueWithChange(kpxc.p, kpxc.credentials[0].password);
            combination = kpxcFields.getCombination('password', kpxc.p);
        }

        if (combination) {
            let list = [];
            if (kpxc.fillInStringFields(combination.fields, kpxc.credentials[0].stringFields, list)) {
                kpxcForm.destroy(false, { 'password': list.list[0], 'username': list.list[1] });
            }
        }

        // Generate popup-list of usernames + descriptions
        browser.runtime.sendMessage({
            action: 'popup_login',
            args: [ [ `${kpxc.credentials[0].login} (${kpxc.credentials[0].name})` ] ]
        });
    } else if (kpxc.credentials.length > 1 || (kpxc.credentials.length > 0 && (!kpxc.settings.autoFillSingleEntry || !autoFillInForSingle))) {
        kpxc.preparePageForMultipleCredentials(kpxc.credentials);
    }
};

kpxc.preparePageForMultipleCredentials = function(credentials) {
    function getLoginText(credential) {
        const visibleLogin = (credential.login.length > 0) ? credential.login : tr('credentialsNoUsername');
        if (credential.expired && credential.expired === 'true') {
            return `${visibleLogin} (${credential.name}) [${tr('credentialExpired')}]`;
        }
        return `${visibleLogin} (${credential.name})`;
    }

    // Add usernames + descriptions to autocomplete-list and popup-list
    const usernames = [];
    kpxcAutocomplete.elements = [];
    for (let i = 0; i < credentials.length; i++) {
        const loginText = getLoginText(credentials[i]);
        usernames.push(loginText);

        const item = {
            label: loginText,
            value: credentials[i].login,
            loginId: i
        };
        kpxcAutocomplete.elements.push(item);
    }

    // Generate popup-list of usernames + descriptions
    browser.runtime.sendMessage({
        action: 'popup_login',
        args: [ usernames ]
    });

    // Initialize autocomplete for username fields
    if (kpxc.settings.autoCompleteUsernames) {
        for (const i of kpxcFields.combinations) {
            // Both username and password fields are visible
            if (_detectedFields >= 2) {
                if (_f(i.username)) {
                    kpxcAutocomplete.create(_f(i.username), false, kpxc.settings.autoSubmit);
                }
            } else if (_detectedFields === 1) {
                if (_f(i.username)) {
                    kpxcAutocomplete.create(_f(i.username), false, kpxc.settings.autoSubmit);
                }
                if (_f(i.password)) {
                    kpxcAutocomplete.create(_f(i.password), false, kpxc.settings.autoSubmit);
                }
            }
        }
    }
};

kpxc.getFormActionUrl = function(combination) {
    if (!combination) {
        return null;
    }

    const field = _f(combination.password) || _f(combination.username);
    if (field === null) {
        return null;
    }

    const form = field.closest('form');
    let action = null;

    if (form && form.length > 0) {
        action = form[0].action;
    }

    if (typeof(action) !== 'string' || action === '') {
        action = document.location.origin + document.location.pathname;
    }

    return action;
};

kpxc.getFormActionUrlFromSingleInput = function(field) {
    if (!field) {
        return null;
    }

    let action = field.formAction;

    if (typeof(action) !== 'string' || action === '') {
        action = document.location.origin + document.location.pathname;
    }

    return action;
};

// Get the form submit button instead if action URL is same as the page itself
kpxc.getSubmitButton = function(form) {
    const action = kpxc.submitUrl || form.action;
    if (action.includes(document.location.origin + document.location.pathname)) {
        for (const i of form.elements) {
            if (i.type === 'submit') {
                return i;
            }
        }
    }

    // Try to find another button. Select the first one.
    const buttons = Array.from(form.querySelectorAll('button[type=\'button\'], input[type=\'button\'], button:not([type])'));
    if (buttons.length > 0) {
        return buttons[0];
    }

    return undefined;
};

kpxc.fillInCredentials = function(combination, onlyPassword, suppressWarnings) {
    const action = kpxc.getFormActionUrl(combination);
    const u = _f(combination.username);
    const p = _f(combination.password);

    if (combination.isNew) {
        // Initialize form-submit for remembering credentials
        const fieldId = combination.password || combination.username;
        const field = _f(fieldId);
        if (field) {
            const form2 = field.closest('form');
            if (form2 && form2.length > 0) {
                kpxcForm.init(form2, combination);
            }
        }
    }

    if (u) {
        kpxc.u = u;
    }
    if (p) {
        kpxc.p = p;
    }

    if (kpxc.url === document.location.origin && kpxc.submitUrl === action && kpxc.credentials.length > 0) {
        kpxc.fillIn(combination, onlyPassword, suppressWarnings);
    } else {
        kpxc.url = document.location.origin;
        kpxc.submitUrl = action;

        browser.runtime.sendMessage({
            action: 'retrieve_credentials',
            args: [ kpxc.url, kpxc.submitUrl, false, true ]
        }).then((credentials) => {
            kpxc.retrieveCredentialsCallback(credentials, true);
            kpxc.fillIn(combination, onlyPassword, suppressWarnings);
        });
    }
};

kpxc.fillInFromActiveElement = function(suppressWarnings, passOnly = false) {
    const el = document.activeElement;
    if (el.tagName.toLowerCase() !== 'input') {
        if (kpxcFields.combinations.length > 0) {
            kpxc.fillInCredentials(kpxcFields.combinations[0], passOnly, suppressWarnings);

            // Focus to the input field
            const field = _f(passOnly ? kpxcFields.combinations[0].password : kpxcFields.combinations[0].username);
            if (field) {
                field.focus();
            }
        }
        return;
    }

    kpxcFields.setUniqueId(el);
    const fieldId = kpxcFields.prepareId(el.getAttribute('data-kpxc-id'));
    let combination = null;
    if (el.getAttribute('type') === 'password') {
        combination = kpxcFields.getCombination('password', fieldId);
    } else {
        combination = kpxcFields.getCombination('username', fieldId);
    }

    if (passOnly) {
        if (!_f(combination.password)) {
            const message = tr('fieldsNoPasswordField');
            browser.runtime.sendMessage({
                action: 'show_notification',
                args: [ message ]
            });
            return;
        }
    }

    delete combination.loginId;

    kpxc.fillInCredentials(combination, passOnly, suppressWarnings);
};

kpxc.fillInFromActiveElementTOTPOnly = function() {
    const el = document.activeElement;
    kpxcFields.setUniqueId(el);
    const fieldId = kpxcFields.prepareId(el.getAttribute('data-kpxc-id'));

    browser.runtime.sendMessage({
        action: 'page_get_login_id'
    }).then((pos) => {
        if (pos >= 0 && kpxc.credentials[pos]) {
            // Check the value from stringFields (to be removed)
            const currentField = _fs(fieldId);
            if (kpxc.credentials[pos].stringFields && kpxc.credentials[pos].stringFields.length > 0) {
                const stringFields = kpxc.credentials[pos].stringFields;
                for (const s of stringFields) {
                    const val = s['KPH: {TOTP}'];
                    if (val) {
                        kpxc.setValue(currentField, val);
                    }
                }
            } else if (kpxc.credentials[pos].totp && kpxc.credentials[pos].totp.length > 0) {
                kpxc.setValue(currentField, kpxc.credentials[pos].totp);
            }
        }
    });
};

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
    } else {
        kpxc.setValueWithChange(field, value);
    }
};

kpxc.fillInStringFields = function(fields, stringFields, filledInFields) {
    let filledIn = false;

    filledInFields.list = [];
    if (fields && stringFields && fields.length > 0 && stringFields.length > 0) {
        for (let i = 0; i < fields.length; i++) {
            const currentField = _fs(fields[i]);
            const stringFieldValue = Object.values(stringFields[i]);
            if (currentField && stringFieldValue[0]) {
                kpxc.setValue(currentField, stringFieldValue[0]);
                filledInFields.list.push(fields[i]);
                filledIn = true;
            }
        }
    }

    return filledIn;
};

kpxc.setValueWithChange = function(field, value) {
    if (kpxc.settings.respectMaxLength === true) {
        const attributeMaxlength = field.getAttribute('maxlength');
        if (attributeMaxlength && !isNaN(attributeMaxlength) && attributeMaxlength > 0) {
            value = value.substr(0, attributeMaxlength);
        }
    }

    field.value = value;
    field.dispatchEvent(new Event('input', { 'bubbles': true }));
    field.dispatchEvent(new Event('change', { 'bubbles': true }));
};

kpxc.fillIn = function(combination, onlyPassword, suppressWarnings) {
    // No credentials available
    if (kpxc.credentials.length === 0 && !suppressWarnings) {
        const message = tr('credentialsNoLoginsFound');
        browser.runtime.sendMessage({
            action: 'show_notification',
            args: [ message ]
        });
        return;
    }

    const uField = _f(combination.username);
    const pField = _f(combination.password);

    // Exactly one pair of credentials available
    if (kpxc.credentials.length === 1) {
        let filledIn = false;
        if (uField && (!onlyPassword || _singleInputEnabledForPage)) {
            kpxc.setValueWithChange(uField, kpxc.credentials[0].login);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [ 0 ]
            });
            filledIn = true;
        }
        if (pField) {
            pField.setAttribute('type', 'password');
            kpxc.setValueWithChange(pField, kpxc.credentials[0].password);
            pField.setAttribute('unchanged', true);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [ 0 ]
            });
            filledIn = true;
        }

        let list = [];
        if (kpxc.fillInStringFields(combination.fields, kpxc.credentials[0].stringFields, list)) {
            kpxcForm.destroy(false, { 'password': list.list[0], 'username': list.list[1] });
            filledIn = true;
        }

        if (!filledIn) {
            if (!suppressWarnings) {
                const message = tr('fieldsFill');
                browser.runtime.sendMessage({
                    action: 'show_notification',
                    args: [ message ]
                });
            }
            return;
        }
    } else if (combination.loginId !== undefined && kpxc.credentials[combination.loginId]) {
        // Specific login ID given
        let filledIn = false;
        if (uField && (!onlyPassword || _singleInputEnabledForPage)) {
            kpxc.setValueWithChange(uField, kpxc.credentials[combination.loginId].login);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [ combination.loginId ]
            });
            filledIn = true;
        }

        if (pField) {
            kpxc.setValueWithChange(pField, kpxc.credentials[combination.loginId].password);
            pField.setAttribute('unchanged', true);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [ combination.loginId ]
            });
            filledIn = true;
        }

        let list = [];
        if (kpxc.fillInStringFields(combination.fields, kpxc.credentials[combination.loginId].stringFields, list)) {
            kpxcForm.destroy(false, { 'password': list.list[0], 'username': list.list[1] });
            filledIn = true;
        }

        if (!filledIn) {
            if (!suppressWarnings) {
                const message = tr('fieldsFill');
                browser.runtime.sendMessage({
                    action: 'show_notification',
                    args: [ message ]
                });
            }
            return;
        }
    } else { // Multiple credentials available
        // Check if only one password for given username exists
        let countPasswords = 0;

        if (uField) {
            let valPassword = '';
            let valUsername = '';
            let valStringFields = [];
            const valQueryUsername = uField.value.toLowerCase();

            // Find passwords to given username (even those with empty username)
            for (const c of kpxc.credentials) {
                if (c.login.toLowerCase() === valQueryUsername) {
                    countPasswords += 1;
                    valPassword = c.password;
                    valUsername = c.login;
                    valStringFields = c.stringFields;
                }
            }

            // For the correct notification message: 0 = no logins, X > 1 = too many logins
            if (countPasswords === 0) {
                countPasswords = kpxc.credentials.length;
            }

            // Only one mapping username found
            if (countPasswords === 1) {
                if (!onlyPassword) {
                    kpxc.setValueWithChange(uField, valUsername);
                }

                if (pField) {
                    kpxc.setValueWithChange(pField, valPassword);
                    pField.setAttribute('unchanged', true);
                }

                let list = [];
                if (kpxc.fillInStringFields(combination.fields, valStringFields, list)) {
                    kpxcForm.destroy(false, { 'password': list.list[0], 'username': list.list[1] });
                }
            }

            // User has to select correct credentials by himself
            if (countPasswords > 1) {
                if (!suppressWarnings) {
                    const target = onlyPassword ? pField : uField;
                    if (kpxcAutocomplete.started) {
                        kpxcAutocomplete.showList(target);
                    } else {
                        kpxcAutocomplete.create(target, true, kpxc.settings.autoSubmit);
                    }
                    target.focus();
                }
                return;
            } else if (countPasswords < 1) {
                if (!suppressWarnings) {
                    const message = tr('credentialsNoUsernameFound');
                    browser.runtime.sendMessage({
                        action: 'show_notification',
                        args: [ message ]
                    });
                }
                return;
            }
        } else {
            if (!suppressWarnings) {
                const target = onlyPassword ? pField : uField;
                if (kpxcAutocomplete.started) {
                    kpxcAutocomplete.showList(target);
                } else {
                    kpxcAutocomplete.create(target, true, kpxc.settings.autoSubmit);
                }
                target.focus();
                return;
            }
        }
    }

    // Auto-submit
    if (kpxc.settings.autoSubmit) {
        const form = kpxc.u.form || kpxc.p.form;
        const submitButton = kpxc.getSubmitButton(form);
        if (submitButton !== undefined) {
            submitButton.click();
        } else {
            form.submit();
        }
    }
};

kpxc.contextMenuRememberCredentials = function() {
    const el = document.activeElement;
    if (el.tagName.toLowerCase() !== 'input') {
        return;
    }

    kpxcFields.setUniqueId(el);
    const fieldId = kpxcFields.prepareId(el.getAttribute('data-kpxc-id'));
    let combination = null;
    if (el.getAttribute('type') === 'password') {
        combination = kpxcFields.getCombination('password', fieldId);
    } else {
        combination = kpxcFields.getCombination('username', fieldId);
    }

    let usernameValue = '';
    let passwordValue = '';

    const usernameField = _f(combination.username);
    const passwordField = _f(combination.password);

    if (usernameField) {
        usernameValue = usernameField.value;
    }
    if (passwordField) {
        passwordValue = passwordField.value;
    }

    if (!kpxc.rememberCredentials(usernameValue, passwordValue)) {
        const message = tr('rememberNothingChanged');
        browser.runtime.sendMessage({
            action: 'show_notification',
            args: [ message ]
        });
    }
};

kpxc.rememberCredentials = function(usernameValue, passwordValue) {
    // No password given or field cleaned by a site-running script
    // --> no password to save
    if (passwordValue === '') {
        return false;
    }

    let usernameExists = false;
    let nothingChanged = false;

    for (const c of kpxc.credentials) {
        if (c.login === usernameValue && c.password === passwordValue) {
            nothingChanged = true;
            break;
        }

        if (c.login === usernameValue) {
            usernameExists = true;
        }
    }

    if (!nothingChanged) {
        if (!usernameExists) {
            for (const c of kpxc.credentials) {
                if (c.login === usernameValue) {
                    usernameExists = true;
                    break;
                }
            }
        }
        const credentialsList = [];
        for (const c of kpxc.credentials) {
            credentialsList.push({
                login: c.login,
                name: c.name,
                uuid: c.uuid
            });
        }

        let url = this.action;
        if (!url) {
            url = kpxc.getDocumentLocation();
            if (url.indexOf('?') > 0) {
                url = url.substring(0, url.indexOf('?'));
                if (url.length < document.location.origin.length) {
                    url = document.location.origin;
                }
            }
        }

        browser.runtime.sendMessage({
            action: 'set_remember_credentials',
            args: [ usernameValue, passwordValue, url, usernameExists, credentialsList ]
        });

        return true;
    }

    return false;
};

kpxc.ignoreSite = function(sites) {
    if (!sites || sites.length === 0) {
        return;
    }

    let site = sites[0];
    kpxc.initializeSitePreferences();

    if (slashNeededForUrl(site)) {
        site += '/';
    }

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

    browser.runtime.sendMessage({
        action: 'save_settings',
        args: [ kpxc.settings ]
    });
};

// Delete previously created Object if it exists. It will be replaced by an Array
kpxc.initializeSitePreferences = function() {
    if (kpxc.settings['sitePreferences'] !== undefined && kpxc.settings['sitePreferences'].constructor === Object) {
        delete kpxc.settings['sitePreferences'];
    }

    if (!kpxc.settings['sitePreferences']) {
        kpxc.settings['sitePreferences'] = [];
    }
};

kpxc.getDocumentLocation = function() {
    return kpxc.settings.saveDomainOnly ? document.location.origin : document.location.href;
};


var kpxcEvents = {};

kpxcEvents.clearCredentials = function() {
    kpxc.credentials = [];
    kpxcAutocomplete.elements = [];
    _called.retrieveCredentials = false;

    if (kpxc.settings.autoCompleteUsernames) {
        for (const c of kpxcFields.combinations) {
            const uField = _f(c.username);
            if (uField) {
                if (uField.classList.contains('ui-autocomplete-input')) {
                    uField.autocomplete('destroy');
                }
            }
        }
    }
};

kpxcEvents.triggerActivatedTab = function() {
    // Doesn't run a second time because of _called.initCredentialFields set to true
    kpxc.init();

    // initCredentialFields calls also "retrieve_credentials", to prevent it
    // check of init() was already called
    if (_called.initCredentialFields && (kpxc.url && kpxc.submitUrl) && kpxc.settings.autoRetrieveCredentials) {
        browser.runtime.sendMessage({
            action: 'retrieve_credentials',
            args: [ kpxc.url, kpxc.submitUrl ]
        }).then(kpxc.retrieveCredentialsCallback).catch((e) => {
            console.log(e);
        });
    }
};
