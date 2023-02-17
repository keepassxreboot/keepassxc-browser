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

// General (global.js)
async function testGeneral() {
    const testCard = Tests.GENERAL;

    // General
    kpxcAssert(trimURL('https://test.com/path_to_somwhere?login=username'), 'https://test.com/path_to_somwhere', testCard, 'trimURL()');
    assertRegex(slashNeededForUrl('https://test.com'), true, testCard, 'slashNeededForUrl()');
    assertRegex(slashNeededForUrl('https://test.com/'), false, testCard, 'slashNeededForUrl()');

    // URL matching (URL in Site Preferences, page URL, expected result).
    // Consider using slighly different URL's for the tests cases.
    const matches = [
        [ 'https://example.com/*', 'https://example.com/login_page', true ],
        [ 'https://*.lexample.com/*', 'https://example.com/login_page', false ],
        [ 'https://example.com/*', 'https://example2.com/login_page', false ],
        [ 'https://example.com/*', 'https://subdomain.example.com/login_page', false ],
        [ 'https://example.com', 'https://subdomain.example.com/login_page', false ],
        [ 'https://*.example.com/*', 'https://example.com/login_page', true ],
        [ 'https://*.example.com/*', 'https://test.example.com/login_page', true ],
        [ 'https://test.example.com/*', 'https://subdomain.example.com/login_page', false ],
        [ 'https://test.example.com/page/*', 'https://test.example.com/page/login_page', true ],
        [ 'https://test.example.com/page/*', 'https://test.example.com/page/login_page?dontcare=aboutme', true ],
        [ 'https://test.example.com/page/another_page/*', 'https://test.example.com/page/login', false ],
        [ 'https://test.example.com/path/another/a/', 'https://test.example.com/path/another/a/', true ],
        [ 'https://test.example.com/path/another/a/', 'https://test.example.com/path/another/b/', false ],
        [ 'https://test.example.com/*/another/a/', 'https://test.example.com/path/another/a/', true ],
        [ 'https://test.example.com/path/*/a/', 'https://test.example.com/path/another/a/', true ],
        [ 'https://test.example.com/path2/*/a/', 'https://test.example.com/path/another/a/', false ],
        [ 'https://example.com:8448/', 'https://example.com/', false ],
        [ 'https://example.com:8448/', 'https://example.com:8448/', true ],
        [ 'https://example.com:8448/login/page', 'https://example.com/login/page', false ],
        [ 'https://example.com:8448/*', 'https://example.com:8448/login/page', true ],
        [ 'https://example.com/$/*', 'https://example.com/$/login_page', true ], // Special character in URL
        [ 'https://example.com/*/*', 'https://example.com/$/login_page', true ],
        [ 'https://example.com/*/*', 'https://example.com/login_page', false ],
        [ 'https://*.com/*', 'https://example.com/$/login_page', true ],
        [ 'https://*.com/*', 'https://example.org/$/login_page', false ],
        [ 'https://*.*/*', 'https://example.org/$/login_page', false ],
        // IP based URL's
        [ 'https://127.128.129.130:8448/', 'https://127.128.129.130:8448/', true ],
        [ 'https://127.128.129.*:8448/', 'https://127.128.129.130:8448/', true ],
        [ 'https://127.128.*/', 'https://127.128.129.130/', true ],
        [ 'https://127.128.*/', 'https://127.1.129.130/', false ],
        [ 'https://127.128.129.130/', 'https://127.128.129.130:8448/', false ],
        [ 'https://127.128.129.*/', 'https://127.128.129.130:8448/', false ],
        // Invalid URL's
        [ '', 'https://example.com', false ],
        [ 'abcdefgetc', 'https://example.com', false ],
        [ '{TOTP}\\no', 'https://example.com', false ],
        [ 'https://320.320.320.320', 'https://example.com', false ]
    ];

    for (const m of matches) {
        assertRegex(siteMatch(m[0], m[1]), m[2], testCard, `siteMatch() for ${m[1]}`);
    }

    // Base domain parsing (window.location.hostname)
    const domains = [
        [ 'another.example.co.uk', 'example.co.uk' ],
        [ 'www.example.com', 'example.com' ],
        [ 'test.net', 'test.net' ],
        [ 'so.many.subdomains.co.jp', 'subdomains.co.jp' ],
        [ 'test.site.example.com.au', 'example.com.au' ],
        [ '192.168.0.1', '192.168.0.1' ]
    ];

    for (const d of domains) {
        kpxcAssert(getTopLevelDomainFromUrl(d[0]), d[1], testCard, 'getBaseDomainFromUrl() for ' + d[0]);
    }
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
        [ 'div3', 2, '#toggle3' ], // Fields are behind a button that must be pressed
        [ 'div4', 2, '#toggle4' ], // Fields are behind a button that must be pressed
        [ 'hiddenFields1', 0 ], // Two hidden fields
        [ 'hiddenFields2', 1 ], // Two hidden fields with one visible
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
        await testGeneral(),
        await testInputFields(),
        await testSearchFields(),
        await testTotpFields(),
        await testPasswordChange(),
    ]);
})();
