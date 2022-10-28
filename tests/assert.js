'use strict';

function kpxcAssert(func, expected, card, testName) {
    if (func === expected) {
        createResult(card, true, `Test passed: ${testName}`);
        return;
    }

    createResult(card, false, `Test failed: ${testName}. Result is: ${func}`);
}

function assertRegex(func, expected, card, testName) {
    if ((func === null && expected === false)
        || (func && (func.length > 0) === expected)) {
        createResult(card, true, `Test passed: ${testName}`);
        return;
    }

    createResult(card, false, `Test failed: ${testName}. Result is: ${func}`);
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

    const isAccepted = kpxcTOTPIcons.isAcceptedTOTPField(input);
    const isValid = kpxcTOTPIcons.isValid(input);

    document.body.removeChild(input);
    kpxcAssert(isAccepted && isValid, expectedResult, Tests.TOTP_FIELDS, testName);
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
