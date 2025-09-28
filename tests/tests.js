'use strict';

const Tests = {
    GENERAL: '#general-results',
    INPUT_FIELDS: '#input-field-results',
    TOTP_FIELDS: '#totp-field-results',
    SEARCH_FIELDS: '#search-field-results',
    PASSWORD_CHANGE: '#password-change-results',
};

function createResult(card, res, text) {
    const icon = kpxcUI.createElement('i', res ? 'fa fa-check' : 'fa fa-close', { id: text });
    const span = kpxcUI.createElement('span', '', '', text);
    const br = document.createElement('br');

    document.querySelector(card).appendMultiple(icon, span, br);
}

// Input field matching (keepassxc-browser.js)
async function testInputFields() {
    // Div ID, expected fields, action element ID (a button to be clicked)
    const testDivs = [
        [ 'basic1', 2 ], // Username/passwd fields
        [ 'basic2', 1 ], // Only username field
        [ 'basic3', 1 ], // Only password field
        [ 'basic4', 3 ], // Username/passwd/TOTP fields
        [ 'div1', 2, '#toggle1' ], // Fields are behind a button that must be pressed
        [ 'div2', 2, '#toggle2' ], // Fields are behind a button that must be pressed behind a JavaScript
        //[ 'div3', 2, '#toggle3' ], // Fields are behind a button that must be pressed
        //[ 'div4', 2, '#toggle4' ], // Fields are behind a button that must be pressed
        [ 'hiddenFields1', 0 ], // Two hidden fields
        //[ 'hiddenFields2', 1 ], // Two hidden fields with one visible
    ];

    for (const div of testDivs) {
        await assertInputFields(div[0], div[1], div[2]);
    }
}

// Search fields (kpxcFields
async function testSearchFields() {
    const searchFields = [
        [ '', { id: 'otp_field', name: 'otp', type: 'text', maxLength: '8' }, 'Generic 2FA field', false ],
        [ '', { placeholder: 'search', type: 'text', id: 'username' }, 'Placeholder only', true ],
        [ '', { ariaLabel: 'search', type: 'text', id: 'username' }, 'aria-label only', true ],

    ];

    for (const field of searchFields) {
        assertSearchField(field[0], field[1], field[2], field[3]);
    }

    assertSearchForm({ id: 'username', type: 'text', }, 'Generic input field under search form', true);
}

// TOTP fields (kpxcTOTPIcons)
async function testTotpFields() {
    const totpFields = [
        [ '', { id: 'otp_field', name: 'otp', type: 'text', maxLength: '8' }, 'Generic 2FA field', true ],
        [ '', { id: '2fa', type: 'text', maxLength: '6' }, 'Generic 2FA field', true ],
        [ '', { id: '2fa', type: 'text', maxLength: '4' }, 'Ignore if field maxLength too small', false ],
        [ '', { id: '2fa', type: 'text', maxLength: '12' }, 'Ignore if field maxLength too long', false ],
        [ '', { id: 'promocode', type: 'text', }, 'promocode id is not acceptable', false ],
        [ '', { id: 'Promotional Code', type: 'text', }, 'Promotional Code id is not acceptable', false ],
        [ '', { id: 'encode', type: 'text', }, 'encode id is not acceptable', false ],
        [ '', { id: 'encodedText', type: 'text', }, 'encodedText is not acceptable', false ],
        [ '', { id: 'decoder', type: 'text', }, 'decoder id is not acceptable', false ],
        [ '', { id: 'code', type: 'text', }, 'code id is accepted', true ],
        [ '', { id: '2fa', type: 'text', maxLength: '12', autocomplete: 'one-time-code' }, 'Accept if one-time-code', true ],
        [ '', { id: 'username', type: 'text', }, 'Ignore a generic input field', false ],
        [ '', { type: 'password', }, 'Ignore a password input field', false ],
        [ // Protonmail
            'TwoFA-input ng-empty ng-invalid ng-invalid-required ng-valid-minlength ng-valid-maxlength ng-touched',
            { autocapitalize: 'off', autocorrect: 'off', id: 'twoFactorCode', type: 'text', placeholder: 'Two-factor passcode', name: 'twoFactorCode' },
            'Protonmail 2FA',
            true
        ],
        [ // Nextcloud
            '',
            { minlength: '6', maxLength: '10', name: 'challenge', placeholder: 'Authentication code', type: 'tel', },
            'Nextcloud 2FA',
            true
        ],
        [ // GMail
            'whsOnd zHQkBf',
            { autocomplete: 'off', id: 'idvPin', tabindex: '0', name: 'idvPin', pattern: '[0-9 ]*', type: 'tel', spellcheck: 'false' },
            'GMail 2FA',
            true
        ],
        [ // Live.com
            'form-control',
            { autocomplete: 'off', id: 'idTxtBx_SAOTCC_OTC', maxLength: '8', tabindex: '0', name: 'otc', placeholder: 'Code', type: 'tel' },
            'Live.com 2FA',
            true
        ],
    ];

    for (const field of totpFields) {
        assertTOTPField(field[0], field[1], field[2], field[3]);
    }
}

// Password change
async function testPasswordChange() {
    // Div ID, expected new password
    const localDivs = [
        [ 'passwordChange1', 'newPassword' ], // Default order without form
        [ 'passwordChange2', 'newPassword' ], // Reversed order without form
        [ 'passwordChange3', 'newPassword' ], // Default order with form
        [ 'passwordChange4', 'newPassword' ], // Reversed order with form
        [ 'passwordChange5', 'newPassword' ], // Each field has own form
    ];

    for (const div of localDivs) {
        await assertPasswordChangeFields(div[0], div[1]);
    }
}

// Run tests
(async () => {
    await Promise.all([
        await testInputFields(),
        await testSearchFields(),
        await testTotpFields(),
        await testPasswordChange(),
    ]);
})();
