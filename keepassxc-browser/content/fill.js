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
    if (kpxc.credentials.length === 0) {
        logDebug('Error: Credential list is empty.');
        return;
    }

    if (kpxc.combinations.length > 0 && kpxc.settings.autoCompleteUsernames) {
        const combination = passOnly
            ? kpxc.combinations.find(c => c.password)
            : kpxc.combinations.find(c => c.username);
        if (!combination) {
            logDebug('Error: No combination found.');
            return;
        }

        const field = passOnly ? combination.password : combination.username;
        if (!field) {
            logDebug('Error: No input field found.');
            return;
        }

        // Set focus to the input field
        field.focus();

        if (kpxc.credentials.length > 1) {
            // More than one credential -> show autocomplete list
            kpxcUserAutocomplete.showList(field);
            return;
        } else {
            // Just one credential -> fill the first combination found
            await sendMessage('page_set_login_id', kpxc.credentials[0].uuid);
            kpxcFill.fillInCredentials(combination, kpxc.credentials[0].login, kpxc.credentials[0].uuid, passOnly);
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

    await sendMessage('page_set_login_id', kpxc.credentials[0].uuid);
    kpxcFill.fillInCredentials(combination, kpxc.credentials[0].login, kpxc.credentials[0].uuid, passOnly);
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
    sendMessage('popup_login', [ { text: `${kpxc.credentials[0].login} (${kpxc.credentials[0].name})`, uuid: kpxc.credentials[0].uuid } ]);
};

// Fill requested by selecting credentials from the popup
kpxcFill.fillFromPopup = async function(id, uuid) {
    if (!kpxc.credentials.length === 0 || !kpxc.credentials[id] || kpxc.combinations.length === 0) {
        logDebug('Error: Credential list is empty.');
        return;
    }

    await sendMessage('page_set_login_id', uuid);
    const selectedCredentials = kpxc.credentials.find(c => c.uuid === uuid);
    if (!selectedCredentials) {
        logError('Uuid not found: ', uuid);
        return;
    }

    // For Google password field we need to do some special handling. The password field is actually in the
    // second combination that was just detected after a username fill.
    let combination = kpxc.combinations[0];
    if (kpxcSites.popupExceptionFound(kpxc.combinations)) {
        combination = kpxc.combinations[1];
    }

    const foundCombination = kpxcFields.getCombinationFromAllInputs();
    kpxc.fillInCredentials(foundCombination, selectedCredentials.login, uuid);
    kpxcUserAutocomplete.closeList();
};

// Fill requested from TOTP icon
kpxcFill.fillFromTOTP = async function(target) {
    const el = target || document.activeElement;
    const credentialList = await kpxc.updateTOTPList();

    if (credentialList && credentialList.length === 0) {
        kpxcUI.createNotification('warning', tr('credentialsNoTOTPFound'));
        return;
    }

    if (credentialList && credentialList.length === 1) {
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

    if (user.totp && user.totp.length > 0) {
        // Retrieve a new TOTP value
        const totp = await sendMessage('get_totp', [ user.uuid, user.totp ]);
        if (!totp) {
            kpxcUI.createNotification('warning', tr('credentialsNoTOTPFound'));
            return;
        }

        kpxcFill.setTOTPValue(el, totp);
    } else if (user.stringFields && user.stringFields.length > 0) {
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
    if (kpxc.combinations.length === 0) {
        logDebug('Error: Credential list is empty.');
        return;
    }

    for (const comb of kpxc.combinations) {
        if (comb.totpInputs && comb.totpInputs.length === 6) {
            kpxcFill.fillSegmentedTotp(elem, val, comb.totpInputs);
            return;
        }
    }

    kpxc.setValue(elem, val);
};

// Fill TOTP in parts
kpxcFill.fillSegmentedTotp = function(elem, val, totpInputs) {
    if (!totpInputs.includes(elem)) {
        return;
    }

    for (let i = 0; i < 6; ++i) {
        kpxc.setValue(totpInputs[i], val[i]);
    }
};

// Fill requested from username icon
kpxcFill.fillFromUsernameIcon = async function(combination) {
    await kpxc.receiveCredentialsIfNecessary();
    if (kpxc.credentials.length === 0) {
        logDebug('Error: Credential list is empty.');
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
    if (!usernameValue) {
        // With single password field the combination.password is used instead
        usernameValue = combination.username ? combination.username.value : combination.password.value;
    }

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
    if (selectedCredentials.stringFields && selectedCredentials.stringFields.length > 0) {
        kpxcFill.fillInStringFields(combination.fields, selectedCredentials.stringFields);
    }

    // Close autocomplete menu after fill
    kpxcUserAutocomplete.closeList();

    // Reset ManualFill
    await sendMessage('page_set_manual_fill', ManualFill.NONE);

    // Auto-submit
    const autoSubmitIgnoredForSite = await kpxc.siteIgnored(IGNORE_AUTOSUBMIT);
    if (kpxc.settings.autoSubmit && !skipAutoSubmit && !autoSubmitIgnoredForSite) {
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

// Fills StringFields defined in Custom Fields
kpxcFill.fillInStringFields = function(fields, stringFields) {
    const filledInFields = [];
    if (fields && stringFields && fields.length > 0 && stringFields.length > 0) {
        for (let i = 0; i < fields.length; i++) {
            if (i >= stringFields.length) {
                continue;
            }

            const stringFieldValue = Object.values(stringFields[i]);
            const currentField = fields[i];

            if (currentField && stringFieldValue[0]) {
                kpxc.setValue(currentField, stringFieldValue[0]);
                filledInFields.push(currentField);
            }
        }
    }
};
