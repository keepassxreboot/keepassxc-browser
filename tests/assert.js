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

async function assertInputFields(localFile, expectedFieldCount, actionElementId) {
    return new Promise((resolve) => {
        const iframe = document.getElementById('testFile');
        iframe.src = localFile;

        const iframeLoaded = function() {
            const frameContent = iframe.contentWindow.document.getElementsByTagName('body')[0];

            // Load prototypes to iframe. This doesn't work automatically from ui.js
            iframe.contentWindow.Element.prototype.getLowerCaseAttribute = function(attr) {
                return this.getAttribute(attr) ? this.getAttribute(attr).toLowerCase() : undefined;
            };

            // An user interaction is required before testing
            if (actionElementId) {
                const actionElement = frameContent.querySelector(actionElementId);
                if (actionElement) {
                    actionElement.click();
                }
            }

            const inputs = kpxcObserverHelper.getInputs(frameContent);
            kpxcAssert(inputs.length, expectedFieldCount, Tests.INPUT_FIELDS, `getInputs() for ${localFile} with ${expectedFieldCount} fields`);
            iframe.removeEventListener('load', iframeLoaded);
            resolve();
        };

        // Wait for iframe to load
        iframe.addEventListener('load', iframeLoaded);
    });
}

async function assertPasswordChangeFields(localFile, expectedNewPassword) {
    return new Promise((resolve) => {
        const iframe = document.getElementById('testFile');
        iframe.src = localFile;

        const iframeLoaded = function() {
            const frameContent = iframe.contentWindow.document.getElementsByTagName('body')[0];

            // Load prototypes to iframe. This doesn't work automatically from ui.js
            iframe.contentWindow.Element.prototype.getLowerCaseAttribute = function(attr) {
                return this.getAttribute(attr) ? this.getAttribute(attr).toLowerCase() : undefined;
            };

            const inputs = kpxcObserverHelper.getInputs(frameContent, true);
            const newPassword = kpxcForm.getNewPassword(inputs);
            kpxcAssert(newPassword, expectedNewPassword, Tests.PASSWORD_CHANGE, `New password matches for ${localFile}`);
            iframe.removeEventListener('load', iframeLoaded);
            resolve();
        };

        // Wait for iframe to load
        iframe.addEventListener('load', iframeLoaded);
    });
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
