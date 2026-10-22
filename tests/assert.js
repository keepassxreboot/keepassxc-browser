'use strict';

function kpxcAssert(func, expected, card, testName) {
    if (func === expected) {
        createResult(card, true, `Test passed: ${testName}`);
        return;
    }

    createResult(card, false, `Test failed: ${testName}. Result is: ${func}`);
}

function assertRegex(res, expected, card, testName) {
    if ((res === null && expected === false)
        || (res && (res.length > 0) === expected)
        || (res === expected)) {
        createResult(card, true, `Test passed: ${testName}`);
        return;
    }

    createResult(card, false, `Test failed: ${testName}. Result is: ${res}`);
}

async function assertInputFields(localDiv, expectedFieldCount, actionElementId) {
    const div = document.getElementById(localDiv);
    div.style.display = 'block';

    // An user interaction is required before testing
    if (actionElementId) {
        const actionElement = div.querySelector(actionElementId);
        if (actionElement) {
            actionElement.click();
        }
    }

    const inputs = kpxcObserverHelper.getInputs(div);
    kpxcAssert(inputs.length, expectedFieldCount, Tests.INPUT_FIELDS, `getInputs() for ${localDiv} with ${expectedFieldCount} fields`);

    div.style.display = 'none';
}

async function assertPasswordChangeFields(localDiv, expectedNewPassword) {
    const div = document.getElementById(localDiv);
    div.style.display = 'block';

    const inputs = kpxcObserverHelper.getInputs(div, true);
    const newPassword = kpxcForm.getNewPassword(inputs);
    kpxcAssert(newPassword, expectedNewPassword, Tests.PASSWORD_CHANGE, `New password matches for ${localDiv}`);

    div.style.display = 'none';
}

async function assertTOTPField(classStr, properties, testName, expectedResult) {
    const input = kpxcUI.createElement('input', classStr, properties);
    document.body.appendChild(input);

    const isValid = kpxcTOTPIcons.isValid(input);

    document.body.removeChild(input);
    kpxcAssert(isValid, expectedResult, Tests.TOTP_FIELDS, testName);
}

// Heuristic matches are ignored only when a usable field with autocomplete="one-time-code" exists
async function assertTOTPWithOneTimeCodeField() {
    const createOtcField = () => {
        const field = kpxcUI.createElement('input', '', { type: 'text', name: 'token', autocomplete: 'one-time-code' });
        Object.assign(field.style, { position: 'fixed', top: '0px', left: '0px', width: '120px', height: '30px', zIndex: '9999' });
        return field;
    };

    const assertGuessedField = (testName, expectedResult, setup) => {
        const wrapper = document.createElement('div');
        const otcField = createOtcField();
        const guessedField = kpxcUI.createElement('input', '', { id: '2fa', type: 'text' });
        Object.assign(guessedField.style, { position: 'fixed', top: '40px', left: '0px', width: '120px', height: '30px' });
        wrapper.append(otcField, guessedField);
        document.body.appendChild(wrapper);

        setup(otcField, wrapper);
        const result = kpxcTOTPIcons.isValid(guessedField);
        const otcResult = kpxcTOTPIcons.isValid(otcField);

        wrapper.remove();
        kpxcAssert(otcResult, true, Tests.TOTP_FIELDS, `${testName}: one-time-code field is accepted`);
        kpxcAssert(result, expectedResult, Tests.TOTP_FIELDS, testName);
    };

    assertGuessedField('Guessed field ignored when one-time-code field exists', false, () => {});
    // A one-time-code field in another form must not suppress this form's guessed field
    assertGuessedField('Guessed field accepted when one-time-code field is in another form', true, (f, wrapper) => {
        const form = document.createElement('form');
        form.appendChild(f);
        wrapper.appendChild(form);
    });
    assertGuessedField('Guessed field accepted when one-time-code field is disabled', true, f => f.disabled = true);
    assertGuessedField('Guessed field accepted when one-time-code field is read-only', true, f => f.readOnly = true);
    assertGuessedField('Guessed field accepted when one-time-code field is invisible', true, f => f.style.opacity = '0');
    assertGuessedField('Guessed field accepted when one-time-code field is in a disabled fieldset', true, (f, wrapper) => {
        const fieldset = document.createElement('fieldset');
        fieldset.disabled = true;
        fieldset.appendChild(f);
        wrapper.appendChild(fieldset);
    });
}

// With a usable one-time-code field on the page, detection must select exactly that field and give it an icon,
// regardless of its size, value or maxLength, and must not select the guessed field.
async function assertOneTimeCodeSelectedAndIconAdded() {
    const place = (field, top) => Object.assign(field.style, {
        position: 'fixed', top: `${top}px`, left: '0px', width: '120px', height: '30px', zIndex: '9999'
    });

    const otcField = kpxcUI.createElement('input', '', {
        type: 'text', name: 'verification', autocomplete: 'one-time-code', size: '40', maxLength: '12', value: '123'
    });
    const guessedField = kpxcUI.createElement('input', '', { id: '2fa', type: 'text', maxLength: '6' });
    place(otcField, 0);
    place(guessedField, 40);

    const wrapper = document.createElement('div');
    wrapper.append(otcField, guessedField);
    document.body.appendChild(wrapper);

    const iconCount = kpxcTOTPIcons.icons.length;
    const inputs = kpxcObserverHelper.getInputs(wrapper, true);
    const combinations = await kpxcFields.getAllCombinations(inputs);
    const totpFields = combinations.filter(c => c.totp).map(c => c.totp);

    for (const c of combinations.filter(c => c.totp)) {
        await kpxcIcons.addIcon(c.totp, kpxcIcons.iconTypes.TOTP);
    }

    const iconFields = kpxcTOTPIcons.icons.slice(iconCount).map(i => i.inputField);
    kpxcTOTPIcons.icons.slice(iconCount).forEach(i => i.icon?.remove());
    kpxcTOTPIcons.icons.length = iconCount;
    kpxcIcons.icons = kpxcIcons.icons.filter(i => i.field !== otcField && i.field !== guessedField);
    wrapper.remove();

    kpxcAssert(totpFields.length === 1 && totpFields[0] === otcField, true, Tests.TOTP_FIELDS,
        'Only the one-time-code field is selected as TOTP field');
    kpxcAssert(iconFields.length === 1 && iconFields[0] === otcField, true, Tests.TOTP_FIELDS,
        'Icon is added only to the one-time-code field');
}

async function assertSearchField(classStr, properties, testName, expectedResult) {
    const input = kpxcUI.createElement('input', classStr, properties);
    document.body.appendChild(input);

    const isSearchfield = kpxcFields.isSearchField(input);

    document.body.removeChild(input);
    kpxcAssert(isSearchfield, expectedResult, Tests.SEARCH_FIELDS, testName);
}

async function assertSearchForm(properties, testName, expectedResult) {
    const form = kpxcUI.createElement('form', '', { action: 'search' });
    const input = kpxcUI.createElement('input', '', properties);
    form.appendChild(input);
    document.body.appendChild(form);

    const isSearchfield = kpxcFields.isSearchField(input);

    document.body.removeChild(form);
    kpxcAssert(isSearchfield, expectedResult, Tests.SEARCH_FIELDS, testName);
}
