'use strict';

const DEFAULT_SEGMENTED_TOTP_FIELDS = 6;
const MIN_SEGMENTED_TOTP_FIELDS = 4;
const MAX_SEGMENTED_FIELD_LENGTH = 100;

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

    // Allow single input if autocomplete="username" is present, or Username-Only Detection is enabled for the page
    const autoComplete = usernameField?.getLowerCaseAttribute('autocomplete');
    if (combinations.length === 0 && usernameField &&
        (kpxc.singleInputEnabledForPage || autoComplete?.includes('username') || autoComplete?.includes('email'))
    ) {
        const combination = {
            username: usernameField,
            password: null,
            passwordInputs: [],
            form: usernameField.form
        };

        combinations.push(combination);
    }

    // Check for segmented TOTP fields
    kpxcFields.handleSegmentedTOTPFields(inputs, combinations);

    return combinations;
};

// If there are multiple combinations, return the first one where input field can be found inside the document.
// Used with Custom Login Fields where selected input fields might not be visible on the page yet,
// and there's an extra combination for those. Only used from popup fill.
kpxcFields.getCombinationFromAllInputs = function() {
    const inputs = kpxcObserverHelper.getInputs(document.body);

    for (const combination of kpxc.combinations) {
        for (const value of Object.values(combination)) {
            if (Array.isArray(value)) {
                for (const v of value) {
                    if (inputs.some(i => i === v)) {
                        return combination;
                    }
                }
            } else {
                if (inputs.some(i => i === value)) {
                    return combination;
                }
            }
        }
    }

    return kpxc.combinations[0];
};

// Adds segmented TOTP fields to the combination if found
kpxcFields.getSegmentedTOTPFields = function(inputs, combinations) {
    if (!kpxc.settings.showOTPIcon) {
        return;
    }

    let exceptionFound = false;

    // Returns true if all 6 inputs are numeric, tel or text/number with maxLength of 1, or maxLength not defined.
    // If ignoreFieldCount is true, number of TOTP fields are allowed to differ from the default (6),
    // but 4 at minimum must exist.
    const areFieldsSegmentedTotp = function(totpInputs, ignoreFieldCount = false) {
        const fieldCountMatches = (ignoreFieldCount && totpInputs.length >= MIN_SEGMENTED_TOTP_FIELDS) ||
            totpInputs.length === DEFAULT_SEGMENTED_TOTP_FIELDS;

        const inputIsNumeric = (input) =>
            (input.inputMode === 'numeric' || input.inputMode === '') && input.pattern.includes('0-9');

        const inputIsText = (input) => input.offsetWidth < MAX_SEGMENTED_FIELD_LENGTH &&
            (input.type === 'text' || input.type === 'number') && (input.maxLength === 1 || input.maxLength === -1);

        return (
            fieldCountMatches &&
            totpInputs.every(input => inputIsNumeric(input) || inputIsText(input) || input.type === 'tel')
        );
    };

    const addTotpFieldsToCombination = function(inputFields, ignoreFieldCount = false) {
        const totpInputs = Array.from(inputFields).filter(
            (field) =>
                matchesWithNodeName(field, 'INPUT') &&
                [ 'hidden', 'password', 'submit' ].includes(field.type) === false &&
                field.offsetWidth < MAX_SEGMENTED_FIELD_LENGTH
        );

        if (areFieldsSegmentedTotp(totpInputs, ignoreFieldCount)) {
            const combination = {
                form: form,
                totpInputs: totpInputs,
                username: null,
                password: null,
                passwordInputs: []
            };

            combinations.push(combination);

            // Create an icon to the right side of the segmented fields
            kpxcTOTPIcons.newIcon(totpInputs.at(-1), kpxc.databaseState, true);
            kpxcIcons.icons.push({
                field: totpInputs.at(-1),
                iconType: kpxcIcons.iconTypes.TOTP,
                segmented: true
            });
        }
    };

    const formLengthMatches = function(currentForm) {
        if (!currentForm) {
            return false;
        }

        // Accept 6 inputs directly
        if (currentForm.length === DEFAULT_SEGMENTED_TOTP_FIELDS) {
            return true;
        }

        // 7 inputs with a button as the last one (e.g. PayPal uses this)
        if (
            currentForm.length === 7 &&
            (matchesWithNodeName(currentForm.lastChild, 'BUTTON') ||
                (matchesWithNodeName(currentForm.lastChild, 'INPUT') &&
                    currentForm.lastChild.type === 'button'))
        ) {
            return true;
        }

        // Accept any other site-specific exceptions
        if (kpxcSites.segmentedTotpExceptionFound(currentForm)) {
            exceptionFound = true;
            return true;
        }

        return false;
    };

    // Returns true of form's className, id or name points to a possible TOTP form
    const isSegmentedTotpForm = (form) =>
        acceptedOTPFields.some(
            field =>
                (form.className && form.className.includes(field)) ||
                (form.id && typeof form.id === 'string' && form.id.includes(field)) ||
                (form.name && typeof form.name === 'string' && form.name.includes(field))
        );

    // Use the form if it has segmented TOTP fields, otherwise try checking the input fields directly
    const form = inputs.length > 0 ? inputs[0].form : undefined;
    if (form && (formLengthMatches(form) || isSegmentedTotpForm(form))) {
        // Use the form's elements
        addTotpFieldsToCombination(form.elements, exceptionFound);
    } else if (areFieldsSegmentedTotp(inputs)) {
        // No form is found, but input fields are possibly segmented TOTP fields
        addTotpFieldsToCombination(inputs);
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
 * @param {String} givenType For example: 'username', 'password', 'totp', 'totpInputs'
 */
kpxcFields.getCombination = async function(field, givenType) {
    for (const combination of kpxc.combinations) {
        if (givenType) {
            // Strictly search a given type
            const c = combination[givenType];
            if (c && (c === field || (Array.isArray(c) && c.includes(field)))) {
                return combination;
            }
        } else if (Object.values(combination).find(c => c === field)) {
            return combination;
        }
    }

    return undefined;
};

// Sets and returns unique ID's for the element
kpxcFields.setId = function(target) {
    return [ kpxcFields.getIdFromXPath(target), kpxcFields.getIdFromProperties(target) ];
};

// Returns generated unique ID's for the element. If XPath ID fails, return the fallback one.
kpxcFields.getId = function(idArray, inputField) {
    if (!idArray) {
        return '';
    }

    // Legacy ID is used. Convert it to the new one if possible
    if (!Array.isArray(idArray) && idArray.length > 0) {
        if (idArray === kpxcFields.getLegacyId(inputField)) {
            idArray = kpxcFields.setId(inputField);
        }
    }

    const elementFromXPath = kpxcFields.getElementFromXPathId(idArray[0]);
    const fallbackId = kpxcFields.getIdFromProperties(inputField);

    return elementFromXPath || (fallbackId === idArray[1] ? inputField : '');
};

// Returns element XPath
kpxcFields.getIdFromXPath = function(target) {
    let xpath = '';
    let pos;
    let temp;

    while (target !== document.documentElement) {
        pos = 0;
        temp = target;
        while (temp) {
            if (temp.nodeType === 1 && temp.nodeName === target.nodeName) {
                pos += 1;
            }

            temp = temp.previousSibling;
        }

        xpath = `${target.nodeName.toLowerCase()}${(pos > 1 ? `[${pos}]/` : '/')}${xpath}`;
        target = target.parentNode;
    }

    xpath = `/${document.documentElement.nodeName.toLowerCase()}/${xpath}`;
    xpath = xpath.replace(/\/$/, '');
    return xpath;
};

// Generate uniqe ID from properties (new method)
kpxcFields.getIdFromProperties = function(target) {
    if (target.name) {
        return `${target.nodeName} ${target.type} ${target.name} ${target.placeholder}`;
    }

    if (target.classList?.length > 0) {
        return `${target.nodeName} ${target.type} ${target.classList.value} ${target.placeholder}`;
    }

    if (target.id && target.id !== '') {
        return `${target.nodeName} ${target.type} ${kpxcFields.prepareId(target.id)} ${target.placeholder}`;
    }

    return `kpxc ${target.type} ${target.clientTop}${target.clientLeft}${target.clientWidth}${target.clientHeight}${target.offsetTop}${target.offsetLeft}`;
};

// Legacy unique ID generation for converting
kpxcFields.getLegacyId = function(target) {
    if (target.classList?.length > 0) {
        return `${target.nodeName} ${target.type} ${target.classList.value} ${target.name} ${target.placeholder}`;
    }

    if (target.id && target?.id !== '') {
        return `${target.nodeName} ${target.type} ${kpxcFields.prepareId(target.id)} ${target.name} ${target.placeholder}`;
    }

    return `kpxc ${target.type} ${target.clientTop}${target.clientLeft}${target.clientWidth}${target.clientHeight}${target.offsetTop}${target.offsetLeft}`;
};

kpxcFields.getElementFromXPathId = function(xpath) {
    return (new XPathEvaluator()).evaluate(xpath, document.documentElement, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
};

// Checks if inputs or combinations contain segmented TOTP fields
kpxcFields.handleSegmentedTOTPFields = function(inputs, combinations) {
    // Check for multiple segmented TOTP fields when there are no inputs, or combination contains the segemented fields
    const segmentedFields = combinations.filter(c => c.totp);
    if (combinations.length === 0
        || segmentedFields.length === DEFAULT_SEGMENTED_TOTP_FIELDS
        || inputs?.length === DEFAULT_SEGMENTED_TOTP_FIELDS) {
        kpxcFields.getSegmentedTOTPFields(inputs, combinations);
    }

    // Remove previously detected segmented TOTP fields from the combination.
    // This prevents adding icons to each single field when segmented fields are used.
    if (segmentedFields.length === DEFAULT_SEGMENTED_TOTP_FIELDS) {
        const firstTotpField = combinations.findIndex(c => c.totp);
        if (firstTotpField >= 0) {
            combinations.splice(firstTotpField, DEFAULT_SEGMENTED_TOTP_FIELDS);
        }
    }

    return combinations;
};

// Check for new password via autocomplete attribute
kpxcFields.isAutocompleteAppropriate = function(field) {
    const autocomplete = field.getLowerCaseAttribute('autocomplete');
    return autocomplete !== 'new-password';
};

// Checks if Custom Login Fields are used for the site
kpxcFields.isCustomLoginFieldsUsed = function() {
    const location = kpxc.getDocumentLocation();
    return kpxc.settings['defined-custom-fields'] !== undefined && kpxc.settings['defined-custom-fields'][location] !== undefined;
};

// Returns true if form is a search form
kpxcFields.isSearchForm = function(form) {
    // Check form action
    const formAction = form.getLowerCaseAttribute('action');
    if (formAction?.includes('search') && !formAction?.includes('research')) {
        return true;
    }

    // Ignore form with search classes
    const formId = form.getLowerCaseAttribute('id');
    if (form.className?.includes('search') || (formId?.includes('search') && !formId?.includes('research'))) {
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
    const opacity = Number(elemStyle.opacity);
    if (elemStyle.visibility && (elemStyle.visibility === 'hidden' || elemStyle.visibility === 'collapse')
        || (opacity < MIN_OPACITY || opacity > MAX_OPACITY)
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
    const findInputField = async function(inputFields, idArray) {
        if (idArray) {
            const input = inputFields.find(e => e === kpxcFields.getId(idArray, e));
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
        kpxcTOTPIcons.newIcon(totp, kpxc.databaseState);
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
