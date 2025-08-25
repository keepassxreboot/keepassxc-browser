'use strict';

/**
 * @Object kpxcForm
 * Identifies form submits and password changes.
 */
const kpxcForm = {};
kpxcForm.formButtonQuery = 'button[type=button], button[type=submit], input[type=button], input[type=submit], button:not([type]), div[role=button]';
kpxcForm.savedCustomInputs = [];
kpxcForm.savedForms = [];
kpxcForm.submitTriggered = false;

// Activate the Credential Banner if credentials are found from form submit
kpxcForm.activateCredentialBanner = async function(usernameValue, passwordInputs, passwordField) {
    let passwordValue = '';
    // Check if the form has three password fields -> a possible password change form
    if (passwordInputs && passwordInputs.length >= 2) {
        passwordValue = kpxcForm.getNewPassword(passwordInputs);
    } else if (passwordField) {
        // Use the combination password field instead
        passwordValue = passwordField.value;
    }

    // Return if credentials are already found
    if (kpxc.credentials.some(c => c.login === usernameValue && c.password === passwordValue)) {
        kpxcForm.submitTriggered = false;
        return;
    }

    if (passwordField) {
        await kpxc.setPasswordFilled(true);
    }

    const url = trimURL(kpxc.settings.saveDomainOnlyNewCreds ? window.top.location.origin : window.top.location.href);
    await sendMessage('page_set_submitted', [ true, usernameValue, passwordValue, url, kpxc.credentials ]);

    // Show the banner if the page does not reload
    kpxc.rememberCredentials(usernameValue, passwordValue);
    kpxcForm.submitTriggered = false;
};

// Returns true if form has been already saved
kpxcForm.formIdentified = function(form) {
    return kpxcForm.savedForms.some(f => f.form === form);
};

// Return input fields from our Object array
kpxcForm.getCredentialFieldsFromForm = function(form) {
    for (const savedForm of kpxcForm.savedForms) {
        if (savedForm.form === form) {
            // If savedForm has no values, query the form instead
            return [
                savedForm.username || form?.querySelector('input[type=text]'),
                savedForm.password || form?.querySelector('input[type=password]'),
                savedForm.passwordInputs,
                savedForm.totp ];
        }
    }

    return [];
};

// Get the form submit button instead if action URL is same as the page itself
kpxcForm.getFormSubmitButton = function(form) {
    if (!form || !form.action || typeof form.action !== 'string') {
        return;
    }

    const action = kpxc.submitUrl || form.action;

    // Check if the site needs a special handling for retrieving the form submit button
    const exceptionButton = kpxcSites.formSubmitButtonExceptionFound(form);
    if (exceptionButton) {
        return exceptionButton;
    }

    if (action.includes(document.location.origin + document.location.pathname)) {
        for (const i of form.elements) {
            if (i.type === 'submit') {
                return i;
            }
        }
    }

    // Try to find another button. Select the last one.
    // If any formaction overriding the default action is set, ignore those buttons.
    const buttons = Array.from(form.querySelectorAll(kpxcForm.formButtonQuery)).filter(
        b => !b.getAttribute('formAction')
    );
    if (buttons.length > 0) {
        return buttons.at(-1);
    }

    // Try to find similar buttons outside the form which are added via 'form' property
    for (const e of form.elements) {
        if ((matchesWithNodeName(e, 'BUTTON') && (e.type === 'button' || e.type === 'submit' || e.type === ''))
            || (matchesWithNodeName(e, 'INPUT') && (e.type === 'button' || e.type === 'submit'))) {
            return e;
        }
    }

    logDebug('No form submit button found.');
    return undefined;
};

// Retrieve new password from a form with three elements: Current, New, Repeat New
kpxcForm.getNewPassword = function(passwordInputs = []) {
    if (passwordInputs.length < 2) {
        logDebug('Error: Not enough input fields to detect possible new password.');
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

    logDebug('Error: No valid new password found.');
    return '';
};

// Returns the username value from an input field or selected login
kpxcForm.getUsernameValue = async function(usernameField) {
    if (usernameField) {
        return usernameField.value || usernameField.placeholder;
    } else if (kpxc.credentials.length === 1) {
        // Single entry found for the page, use the username of it instead of an empty one
        return kpxc.credentials[0].login;
    } else {
        // Multiple entries found for the page, try to find out which one might have been used
        const pageUuid = await sendMessage('page_get_login_id');
        if (pageUuid) {
            const credential = kpxc.credentials.find(c => c.uuid === pageUuid);
            if (credential) {
                return credential.login;
            }
        }
    }

    return '';
};

// Initializes form and attaches the submit button to our own callback
kpxcForm.initForm = function(form, credentialFields) {
    if (!form.action || typeof form.action !== 'string') {
        logDebug('Error: Form action is not found.');
        return;
    }

    if (!kpxcForm.formIdentified(form) && (credentialFields.password || credentialFields.username)
        || form.action.startsWith(kpxcSites.googlePasswordFormUrl)) {
        kpxcForm.saveForm(form, credentialFields);
        form.addEventListener('submit', kpxcForm.onSubmit);

        const submitButton = kpxcForm.getFormSubmitButton(form);
        if (submitButton) {
            submitButton.addEventListener('click', kpxcForm.onSubmit);
        }

        kpxcUI.pageObserver.observe(form, OBSERVER_OPTIONS);
    }
};

// Initialize a "form" where three different password input fields are in a combination
kpxcForm.initCustomForm = function(combinations) {
    if (combinations?.length >= 2 && combinations?.every(c => !c?.form && !c.username && c.password)) {
        kpxcForm.savedCustomInputs = [];
        const submitButton = kpxcSites.formSubmitButtonExceptionFound();
        if (submitButton) {
            kpxcForm.savedCustomInputs = combinations?.map(c => c.password);
            submitButton.addEventListener('click', kpxcForm.onCustomFormSubmit);
        }
    }
};

// Identifies a submit button from the page outside any form
kpxcForm.initSubmitButtonFromPage = function() {
    let submitButton = kpxcSites.formSubmitButtonExceptionFound();    
    submitButton ??= $('button[type=submit], button.login');
    if (submitButton) {
        submitButton.addEventListener('click', kpxcForm.onSubmit);
    }
};

// Triggers when a custom form has been identified with a specific form submit button
kpxcForm.onCustomFormSubmit = async function(e) {
    if (!e.isTrusted || kpxcForm.savedCustomInputs?.length === 0) {
        return;
    }

    kpxcForm.submitTriggered = true;

    const usernameValue = await kpxcForm.getUsernameValue();
    await kpxcForm.activateCredentialBanner(usernameValue, kpxcForm.savedCustomInputs);
};

// Triggers when form is submitted. Shows the credential banner
kpxcForm.onSubmit = async function(e) {
    if (!e.isTrusted) {
        return;
    }

    // Prevent multiple simultaneous submits
    if (kpxcForm.submitTriggered) {
        return;
    }

    kpxcForm.submitTriggered = true;

    const searchForm = f => {
        if (matchesWithNodeName(f, 'FORM')) {
            return f;
        }
    };

    // Traverse parents if the form is not found.
    let form = matchesWithNodeName(this, 'FORM')
        ? this
        : kpxcFields.traverseParents(this, searchForm, searchForm, () => null);

    // Check for extra forms from sites.js
    if (!form) {
        form = kpxcSites.savedForm;
    }

    // Still not found? Try using the first one from kpxcForm.savedForms
    if (!form && kpxcForm.savedForms.length > 0) {
        form = kpxcForm.savedForms[0].form;
    }

    // Try choosing inputs from the last combination detected.
    // Needed if initSubmitButtonFromPage() has been used.
    let usernameField;
    let passwordField;
    let passwordInputs = [];
    if (!form && kpxc.combinations.length > 0) {
        usernameField = kpxc.combinations.at(-1)?.username;
        passwordField = kpxc.combinations.at(-1)?.password;
        passwordInputs = kpxc.combinations.at(-1)?.passwordInputs;
    } else {
        [ usernameField, passwordField, passwordInputs ] = kpxcForm.getCredentialFieldsFromForm(form);
    }

    if (!form && !usernameField && !passwordField) {
        logDebug('Error: No form found for submit detection.');
        kpxcForm.submitTriggered = false;
        return;
    }

    // Use the first text field in the form if only username input is missing
    const usernameValue = await kpxcForm.getUsernameValue(!usernameField && passwordField
        ? form?.querySelector('input[type=text]')
        : usernameField);
    await kpxcForm.activateCredentialBanner(usernameValue, passwordInputs, passwordField);
};

// Save form to Object array
kpxcForm.saveForm = function(form, combination) {
    kpxcForm.savedForms.push({
        form: form,
        username: combination.username,
        password: combination.password,
        totp: combination.totp,
        totpInputs: Array.from(form.elements).filter(
            e => matchesWithNodeName(e, 'INPUT') && kpxcTOTPIcons.isValid(e),
        ),
        passwordInputs: Array.from(form.elements).filter(
            e => matchesWithNodeName(e, 'INPUT') && e.type === 'password',
        )
    });
};
