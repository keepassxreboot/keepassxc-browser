'use strict';

/**
 * @Object kpxcFill
 * The class for filling credentials.
 */
const kpxcFill = {};

// Fill selected attribute from the context menu
kpxcFill.fillAttributeToActiveElementWith = async function(attr) {
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
kpxcFill.fillInFromActiveElement = async function(passOnly = false) {
    const elem = document.activeElement;

    await kpxc.receiveCredentialsIfNecessary();
    if (kpxc.credentials.length === 0) {
        logDebug(`Error: Credential list is empty for: ${document.location.origin}`);
        kpxcUI.createNotification('error', `${tr('credentialsNoLoginsFound')} ${document.location.origin}`);
        return;
    }

    if (kpxc.combinations.length > 0) {
        if (await kpxcFill.fillFromCombination(elem, passOnly)) {
            // Combination found and filled
            return;
        }
    }

    // No previous combinations detected. Create a new one from active element
    const combination = await kpxc.createCombination(elem, passOnly);

    await sendMessage('page_set_login_id', kpxc.credentials[0].uuid);
    kpxcFill.fillInCredentials(combination, kpxc.credentials[0].login, kpxc.credentials[0].uuid, passOnly);
};

// Fill from combination, if found
kpxcFill.fillFromCombination = async function(elem, passOnly) {
    const combination = passOnly
        ? kpxc.combinations.find(c => c.password === elem) ?? kpxc.combinations.find(c => c.password)
        : kpxc.combinations.find(c => c.username === elem) ?? kpxc.combinations.find(c => c.username);
    if (!combination) {
        logDebug('Error: No username/password field combination found.');
        return false;
    }

    const field = passOnly ? combination.password : combination.username;
    if (!field) {
        logDebug('Error: No input field found.');
        return false;
    }

    // Set focus to the input field
    field.focus();

    if (kpxc.credentials.length > 1 && kpxc.settings.autoCompleteUsernames) {
        // More than one credential -> show autocomplete list
        kpxcUserAutocomplete.showList(field);
    } else {
        // Just one credential -> fill the first combination found
        await sendMessage('page_set_login_id', kpxc.credentials[0].uuid);
        kpxcFill.fillInCredentials(combination, kpxc.credentials[0].login, kpxc.credentials[0].uuid, passOnly);
    }

    return true;
};

// Fill requested by Auto-Fill
kpxcFill.fillFromAutofill = async function() {
    if (kpxc.credentials.length !== 1 || kpxc.combinations.length === 0) {
        logDebug('Error: Credential list is empty or contains more than one entry.');
        return;
    }

    const index = kpxc.combinations.length - 1;
    await sendMessage('page_set_login_id', kpxc.credentials[0].uuid);
    kpxcFill.fillInCredentials(kpxc.combinations[index], kpxc.credentials[0].login, kpxc.credentials[0].uuid);

    // Generate popup-list of usernames + descriptions
    sendMessage('popup_login', [
        { text: `${kpxc.credentials[0].login} (${kpxc.credentials[0].name})`, uuid: kpxc.credentials[0].uuid },
    ]);
};

// Fill requested by selecting credentials from the popup
kpxcFill.fillFromPopup = async function(id, uuid) {
    if (kpxc.credentials.length === 0 || !kpxc.credentials[id] || kpxc.combinations.length === 0) {
        logDebug('Error: Credential list is empty.');
        return;
    }

    await sendMessage('page_set_login_id', uuid);
    const selectedCredentials = kpxc.credentials.find(c => c.uuid === uuid);
    if (!selectedCredentials) {
        logError('Uuid not found: ', uuid);
        return;
    }

    const foundCombination = kpxcFields.getCombinationFromAllInputs();
    kpxcFill.fillInCredentials(foundCombination, selectedCredentials.login, uuid);
    kpxcUserAutocomplete.closeList();
};

// Fill requested from TOTP icon
kpxcFill.fillFromTOTP = async function(target) {
    const el = target || document.activeElement;
    const credentialList = await kpxc.updateTOTPList();

    if (!credentialList || credentialList?.length === 0) {
        kpxcUI.createNotification('warning', tr('credentialsNoTOTPFound'));
        return;
    }

    if (credentialList?.length === 1) {
        kpxcFill.fillTOTPFromUuid(el, credentialList[0].uuid);
        return;
    }

    kpxcTOTPAutocomplete.showList(el, true);
};

// Fill TOTP with matching uuid
kpxcFill.fillTOTPFromUuid = async function(el, uuid) {
    if (!el || !uuid) {
        logDebug('Error: Element or uuid is empty');
        return;
    }

    const user = kpxc.credentials.find(c => c.uuid === uuid);
    if (!user) {
        logDebug('Error: No entry found with uuid: ' + uuid);
        return;
    }

    if (user.totp?.length > 0) {
        // Retrieve a new TOTP value
        const totp = await sendMessage('get_totp', [ user.uuid, user.totp ]);
        if (!totp) {
            kpxcUI.createNotification('warning', tr('credentialsNoTOTPFound'));
            return;
        }

        kpxcFill.setTOTPValue(el, totp);
    } else if (user.stringFields?.length > 0) {
        const stringFields = user.stringFields;
        for (const s of stringFields) {
            const val = s['KPH: {TOTP}'];
            if (val) {
                kpxcFill.setTOTPValue(el, val);
            }
        }
    }
};

// Set normal or segmented TOTP value
kpxcFill.setTOTPValue = function(elem, val) {
    if (kpxc.credentials.length === 0) {
        logDebug('Error: Credential list is empty.');
        return;
    }

    for (const comb of kpxc.combinations) {
        if (comb.totpInputs?.length > 0) {
            kpxcFill.fillSegmentedTotp(elem, val, comb.totpInputs);
            return;
        }
    }

    kpxc.setValue(elem, val);
};

// Fill TOTP in parts
kpxcFill.fillSegmentedTotp = function(elem, val, totpInputs) {
    if (!totpInputs.includes(elem) || val.length < totpInputs.length) {
        return;
    }

    for (let i = 0; i < totpInputs.length; ++i) {
        kpxc.setValue(totpInputs[i], val[i]);
    }
};

// Fill requested from username icon
kpxcFill.fillFromUsernameIcon = async function(combination) {
    await kpxc.receiveCredentialsIfNecessary();
    if (kpxc.credentials.length === 0) {
        logDebug(`Error: Credential list is empty for: ${document.location.origin}`);
        kpxcUI.createNotification('error', `${tr('credentialsNoLoginsFound')} ${document.location.origin}`);
        return;
    } else if (kpxc.credentials.length > 1 && kpxc.settings.autoCompleteUsernames) {
        kpxcUserAutocomplete.showList(combination.username || combination.password);
        return;
    }

    await sendMessage('page_set_login_id', kpxc.credentials[0].uuid);
    kpxcFill.fillInCredentials(combination, kpxc.credentials[0].login, kpxc.credentials[0].uuid);
};

/**
 * The main function for filling any credentials
 * @param {Array} combination Combination to be used
 * @param {String} predefinedUsername Predefined username. If set, there's no need to find it from combinations
 * @param {Boolean} passOnly If only password is filled
 * @param {String} uuid Identifier for the entry. There can be identical usernames with different password
 */
kpxcFill.fillInCredentials = async function(combination, predefinedUsername, uuid, passOnly = false) {
    if (kpxc.credentials.length === 0) {
        kpxcUI.createNotification('error', tr('credentialsNoLoginsFound'));
        return;
    }

    if (!combination) {
        logDebug('Error: Empty login combination.');
        return;
    }

    // Use predefined username as default
    let usernameValue = predefinedUsername;

    // With single password field the combination.password is used instead
    usernameValue ??= combination.username ? combination.username.value : combination.password.value;

    // Find the correct credentials
    const selectedCredentials = kpxc.credentials.find(c => c.uuid === uuid);
    if (!selectedCredentials) {
        logError('Uuid not found: ' + uuid);
        return;
    }

    // Handle auto-submit
    let skipAutoSubmit = false;
    if (selectedCredentials.skipAutoSubmit !== undefined) {
        skipAutoSubmit = selectedCredentials.skipAutoSubmit === 'true';
    }

    // Fill password
    if (combination.password && matchesWithNodeName(combination.password, 'INPUT')) {
        // Show a notification if password length exceeds the length defined in input
        if (combination.password.maxLength
            && combination.password.maxLength > 0
            && selectedCredentials.password.length > combination.password.maxLength) {
            kpxcUI.createNotification('warning', tr('errorMessagePaswordLengthExceeded'));
        }

        // Prevent filling password to plain text input field
        if (passOnly && !passwordFillIsAllowed(combination.password)) {
            kpxcUI.createNotification('error', tr('fieldsPasswordFillNotAccepted'));
            return;
        }

        kpxc.setValueWithChange(combination.password, selectedCredentials.password);
        await kpxc.setPasswordFilled(true);
    }

    // Fill username
    if (combination.username && usernameValue &&
        (!combination.username.value || combination.username.value !== usernameValue)) {
        if (!passOnly) {
            kpxc.setValueWithChange(combination.username, usernameValue);
        }
    }

    // Fill StringFields
    if (selectedCredentials.stringFields?.length > 0) {
        kpxcFill.fillInStringFields(combination.fields, selectedCredentials.stringFields);
    }

    // Fill TOTP
    if (kpxc.settings.autoFillSingleTotp && kpxc.entryHasTotp(selectedCredentials)) {
        const totpCombination = combination?.totp || kpxc.combinations?.find(c => c.totp);
        if (totpCombination?.totp) {
            kpxcFill.fillTOTPFromUuid(totpCombination.totp, selectedCredentials.uuid);
        }
    }

    // Close autocomplete menu after fill
    kpxcUserAutocomplete.closeList();

    // Reset ManualFill
    await sendMessage('page_set_manual_fill', ManualFill.NONE);

    await kpxcFill.performAutoSubmit(combination, skipAutoSubmit);
};

// Fills StringFields defined in Custom Fields
kpxcFill.fillInStringFields = function(fields, stringFields) {
    const filledInFields = [];
    if (fields && stringFields && fields?.length > 0 && stringFields?.length > 0) {
        for (let i = 0; i < fields.length; i++) {
            if (i >= stringFields.length) {
                continue;
            }

            const stringFieldValue = Object.values(stringFields[i]);
            const currentField = fields[i];

            if (currentField && stringFieldValue[0]) {
                kpxc.setValue(currentField, stringFieldValue[0], true);
                filledInFields.push(currentField);
            }
        }
    }
};

// Performs Auto-Submit. If filling single credentials is enabled, a 5 second timeout will be needed for fill
kpxcFill.performAutoSubmit = async function(combination, skipAutoSubmit) {
    if (!kpxc.settings.autoSubmit) {
        return;
    }

    const isAutoSubmitPerformed = await sendMessage('page_get_autosubmit_performed');
    if (isAutoSubmitPerformed && kpxc.settings.autoFillSingleEntry) {
        return;
    }

    const autoSubmitIgnoredForSite = await kpxc.siteIgnored(IGNORE_AUTOSUBMIT);
    if (!skipAutoSubmit && !autoSubmitIgnoredForSite) {
        await sendMessage('page_set_autosubmit_performed');

        const submitButton = kpxcForm.getFormSubmitButton(combination.form);
        if (submitButton !== undefined) {
            submitButton.click();
        } else if (combination.form) {
            combination.form.submit();
        }
    } else {
        (combination.username || combination.password).focus();
    }
};

// Check if password fill is done to a plain text field
const passwordFillIsAllowed = function(elem) {
    const elementIsPasswordField =
        kpxc.combinations?.some(c => c.password === elem || c?.passwordInputs.some(p => p === elem));

    // Allow if Custom Login fields are used
    if (kpxcFields.isCustomLoginFieldsUsed() && elementIsPasswordField) {
        return true;
    }

    return elem?.getLowerCaseAttribute('type') === 'password';
};
