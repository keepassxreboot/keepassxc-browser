'use strict';

const STEP_SELECT_USERNAME = 1;
const STEP_SELECT_PASSWORD = 2;
const STEP_SELECT_TOTP = 3;
const STEP_SELECT_STRING_FIELDS = 4;

const kpxcCustomLoginFieldsBanner = {};
kpxcCustomLoginFieldsBanner.banner = undefined;
kpxcCustomLoginFieldsBanner.chooser = undefined;
kpxcCustomLoginFieldsBanner.created = false;
kpxcCustomLoginFieldsBanner.dataStep = 1;
kpxcCustomLoginFieldsBanner.infoText = undefined;
kpxcCustomLoginFieldsBanner.keyboardHelp = undefined;
kpxcCustomLoginFieldsBanner.wrapper = undefined;
kpxcCustomLoginFieldsBanner.inputQueryPattern = 'input[type=email], input[type=number], input[type=password], input[type=tel], input[type=text], input[type=username], input:not([type])';
kpxcCustomLoginFieldsBanner.moreInputQueryPattern = 'input:not([type=button]):not([type=checkbox]):not([type=color]):not([type=date]):not([type=datetime-local]):not([type=file]):not([type=hidden]):not([type=image]):not([type=month]):not([type=range]):not([type=reset]):not([type=submit]):not([type=time]):not([type=week]), select, textarea';
kpxcCustomLoginFieldsBanner.markedFields = [];
kpxcCustomLoginFieldsBanner.singleSelection = false;

kpxcCustomLoginFieldsBanner.selection = {
    username: undefined,
    password: undefined,
    totp: undefined,
    fields: []
};

kpxcCustomLoginFieldsBanner.buttons = {
    again: undefined,
    confirm: undefined,
    clearData: undefined,
    dismiss: undefined,
    more: undefined,
    skip: undefined
};

kpxcCustomLoginFieldsBanner.destroy = async function() {
    if (!kpxcCustomLoginFieldsBanner.created) {
        return;
    }

    kpxcCustomLoginFieldsBanner.resetSelection();
    kpxcCustomLoginFieldsBanner.created = false;
    kpxcCustomLoginFieldsBanner.close();

    if (kpxcCustomLoginFieldsBanner.wrapper && window.parent.document.body.contains(kpxcCustomLoginFieldsBanner.wrapper)) {
        window.parent.document.body.removeChild(kpxcCustomLoginFieldsBanner.wrapper);
    } else {
        window.parent.document.body.removeChild(window.parent.document.body.querySelector('#kpxc-banner'));
    }
};

kpxcCustomLoginFieldsBanner.close = function() {
    kpxcCustomLoginFieldsBanner.chooser.remove();
    document.removeEventListener('keydown', kpxcCustomLoginFieldsBanner.keyDown);
};

kpxcCustomLoginFieldsBanner.create = async function() {
    if (await kpxc.siteIgnored() || kpxcCustomLoginFieldsBanner.created) {
        return;
    }

    const banner = kpxcUI.createElement('div', 'kpxc-banner', { 'id': 'container' });
    banner.style.zIndex = '2147483646';
    kpxcCustomLoginFieldsBanner.chooser = kpxcUI.createElement('div', '', { 'id': 'kpxcDefine-fields' });

    const bannerInfo = kpxcUI.createElement('div', 'banner-info');
    const bannerButtons = kpxcUI.createElement('div', 'banner-buttons');

    const iconClassName = isFirefox() ? 'kpxc-banner-icon-moz' : 'kpxc-banner-icon';
    const helpIconClassName = isFirefox() ? 'kpxc-help-icon-moz' : 'kpxc-help-icon';
    const icon = kpxcUI.createElement('span', iconClassName);
    const helpIcon = kpxcUI.createElement('span', helpIconClassName);
    const infoText = kpxcUI.createElement('span', '', {}, tr('defineChooseUsername'));
    const pickOneInfoText = kpxcUI.createElement('span', 'kpxc-pick-info-text', {}, tr('definePickOneInfoText'));
    const separator = kpxcUI.createElement('div', 'kpxc-separator');
    const secondSeparator = kpxcUI.createElement('div', 'kpxc-separator');

    helpIcon.addEventListener('mouseover', kpxcCustomLoginFieldsBanner.showKeyboardHelp);
    helpIcon.addEventListener('mouseout', kpxcCustomLoginFieldsBanner.hideKeyboardHelp);

    const againButton = kpxcUI.createButton(BLUE_BUTTON, tr('defineAgain'), kpxcCustomLoginFieldsBanner.again);
    const moreButton = kpxcUI.createButton(ORANGE_BUTTON, tr('defineMore'), kpxcCustomLoginFieldsBanner.more);
    const skipButton = kpxcUI.createButton(ORANGE_BUTTON, tr('defineSkip'), kpxcCustomLoginFieldsBanner.skip);
    const usernameButton = kpxcUI.createButton(ORANGE_BUTTON, tr('username'), kpxcCustomLoginFieldsBanner.usernameButtonClicked);
    const passwordButton = kpxcUI.createButton(RED_BUTTON, tr('password'), kpxcCustomLoginFieldsBanner.passwordButtonClicked);
    const totpButton = kpxcUI.createButton(GREEN_BUTTON, 'TOTP', kpxcCustomLoginFieldsBanner.totpButtonClicked);
    const stringFieldsButton = kpxcUI.createButton(BLUE_BUTTON, tr('stringFields'), kpxcCustomLoginFieldsBanner.stringFieldsButtonClicked);
    const clearDataButton = kpxcUI.createButton(RED_BUTTON, tr('defineClearData'), kpxcCustomLoginFieldsBanner.clearData);
    const confirmButton = kpxcUI.createButton(GREEN_BUTTON, tr('defineConfirm'), kpxcCustomLoginFieldsBanner.confirm);
    const dismissButton = kpxcUI.createButton(RED_BUTTON, tr('defineDismiss'), kpxcCustomLoginFieldsBanner.dismissButtonClicked);

    confirmButton.disabled = true;
    kpxcCustomLoginFieldsBanner.banner = banner;
    kpxcCustomLoginFieldsBanner.infoText = infoText;
    kpxcCustomLoginFieldsBanner.buttons.again = againButton;
    kpxcCustomLoginFieldsBanner.buttons.clearData = clearDataButton;
    kpxcCustomLoginFieldsBanner.buttons.confirm = confirmButton;
    kpxcCustomLoginFieldsBanner.buttons.dismiss = dismissButton;
    kpxcCustomLoginFieldsBanner.buttons.more = moreButton;
    kpxcCustomLoginFieldsBanner.buttons.skip = skipButton;

    bannerInfo.appendMultiple(icon, infoText);
    bannerButtons.appendMultiple(skipButton, moreButton, againButton, helpIcon, separator, pickOneInfoText, usernameButton,
        passwordButton, totpButton, stringFieldsButton, secondSeparator, clearDataButton, confirmButton, dismissButton);
    banner.appendMultiple(bannerInfo, bannerButtons);

    const location = kpxc.getDocumentLocation();
    kpxcCustomLoginFieldsBanner.buttons.clearData.style.display
        = kpxc.settings['defined-custom-fields'] && kpxc.settings['defined-custom-fields'][location]
            ? 'inline-block' : 'none';

    const keyboardHelp = kpxcUI.createElement('div', 'kpxc-banner-keyboardHelp', {}, tr('optionsKeyboardShortcutsHeader'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'Escape'), ' ' + tr('defineDismiss'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'S'), ' ' + tr('defineSkip'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'A'), ' ' + tr('defineAgain'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'C'), ' ' + tr('defineConfirm'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'M'), ' ' + tr('defineMore'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'D'), ' ' + tr('defineClearData'));
    keyboardHelp.style.display = 'none';
    keyboardHelp.style.zIndex = '2147483646';
    kpxcCustomLoginFieldsBanner.keyboardHelp = keyboardHelp;

    initColorTheme(banner);
    initColorTheme(keyboardHelp);

    const bannerStyleSheet = createStylesheet('css/banner.css');
    const defineStyleSheet = createStylesheet('css/define.css');
    const buttonStyleSheet = createStylesheet('css/button.css');
    const colorStyleSheet = createStylesheet('css/colors.css');

    const wrapper = document.createElement('div');
    this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    this.shadowRoot.append(colorStyleSheet);
    this.shadowRoot.append(bannerStyleSheet);
    this.shadowRoot.append(defineStyleSheet);
    this.shadowRoot.append(buttonStyleSheet);
    this.shadowRoot.append(banner);
    this.shadowRoot.append(kpxcCustomLoginFieldsBanner.chooser);
    this.shadowRoot.append(keyboardHelp);
    kpxcCustomLoginFieldsBanner.wrapper = wrapper;

    if (window.self === window.top && !kpxcCustomLoginFieldsBanner.created) {
        window.parent.document.body.appendChild(wrapper);
        kpxcCustomLoginFieldsBanner.created = true;
    }

    kpxcCustomLoginFieldsBanner.prepareUsernameSelection();
    kpxcCustomLoginFieldsBanner.markAllUsernameFields();

    document.addEventListener('keydown', kpxcCustomLoginFieldsBanner.keyDown);
};

kpxcCustomLoginFieldsBanner.usernameButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.resetSelection();
    kpxcCustomLoginFieldsBanner.prepareUsernameSelection();
    kpxcCustomLoginFieldsBanner.markAllUsernameFields(true);

    kpxcCustomLoginFieldsBanner.singleSelection = true;
    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
    kpxcCustomLoginFieldsBanner.buttons.again.disabled = false;
};

kpxcCustomLoginFieldsBanner.passwordButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.resetSelection();
    kpxcCustomLoginFieldsBanner.preparePasswordSelection();
    kpxcCustomLoginFieldsBanner.markAllPasswordFields(true);

    kpxcCustomLoginFieldsBanner.singleSelection = true;
    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.totpButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.resetSelection();
    kpxcCustomLoginFieldsBanner.prepareTOTPSelection();
    kpxcCustomLoginFieldsBanner.markAllTOTPFields(true);

    kpxcCustomLoginFieldsBanner.singleSelection = true;
    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.stringFieldsButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.resetSelection();
    kpxcCustomLoginFieldsBanner.prepareStringFieldSelection();
    kpxcCustomLoginFieldsBanner.markAllStringFields();

    kpxcCustomLoginFieldsBanner.singleSelection = true;
    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.dismissButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.destroy();
};

kpxcCustomLoginFieldsBanner.showKeyboardHelp = function(e) {
    const helpIconPosition = e.currentTarget.getBoundingClientRect();

    kpxcCustomLoginFieldsBanner.keyboardHelp.style.top = Pixels(helpIconPosition.bottom + 10);
    kpxcCustomLoginFieldsBanner.keyboardHelp.style.left = Pixels(helpIconPosition.left);
    kpxcCustomLoginFieldsBanner.keyboardHelp.style.display = 'inline-block';
};

kpxcCustomLoginFieldsBanner.hideKeyboardHelp = function() {
    kpxcCustomLoginFieldsBanner.keyboardHelp.style.display = 'none';
};

kpxcCustomLoginFieldsBanner.skip = function() {
    if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_USERNAME) {
        kpxcCustomLoginFieldsBanner.selection.username = undefined;
        kpxcCustomLoginFieldsBanner.preparePasswordSelection();
        kpxcCustomLoginFieldsBanner.markAllPasswordFields();
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_PASSWORD) {
        kpxcCustomLoginFieldsBanner.selection.password = undefined;
        kpxcCustomLoginFieldsBanner.prepareTOTPSelection();
        kpxcCustomLoginFieldsBanner.markAllTOTPFields();
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_TOTP) {
        kpxcCustomLoginFieldsBanner.selection.totp = undefined;
        kpxcCustomLoginFieldsBanner.prepareStringFieldSelection();
        kpxcCustomLoginFieldsBanner.markAllStringFields();
    }
};

kpxcCustomLoginFieldsBanner.again = function() {
    kpxcCustomLoginFieldsBanner.resetSelection();
    kpxcCustomLoginFieldsBanner.prepareUsernameSelection();
    kpxcCustomLoginFieldsBanner.markAllUsernameFields();

    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.more = function() {
    if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_USERNAME) {
        kpxcCustomLoginFieldsBanner.prepareUsernameSelection();

        // Reset previous marked fields when no usernames have been selected
        if (kpxcCustomLoginFieldsBanner.markedFields.length === 0) {
            kpxcCustomLoginFieldsBanner.resetSelection();
        }
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_PASSWORD) {
        kpxcCustomLoginFieldsBanner.preparePasswordSelection();
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_TOTP) {
        kpxcCustomLoginFieldsBanner.prepareTOTPSelection();
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_STRING_FIELDS) {
        kpxcCustomLoginFieldsBanner.prepareStringFieldSelection();
    }

    kpxcCustomLoginFieldsBanner.markFields(kpxcCustomLoginFieldsBanner.moreInputQueryPattern);
};

kpxcCustomLoginFieldsBanner.confirm = async function() {
    if (!kpxc.settings['defined-custom-fields']) {
        kpxc.settings['defined-custom-fields'] = {};
    }

    // If the new selection is already used in some other field, clear it
    const clearIdenticalField = function(path, location) {
        const currentSite = kpxc.settings['defined-custom-fields'][location];
        if (currentSite.username && currentSite.username[0] === path[0]) {
            kpxc.settings['defined-custom-fields'][location].username = undefined;
        } else if (currentSite.password && currentSite.password[0] === path[0]) {
            kpxc.settings['defined-custom-fields'][location].password = undefined;
        } else if (currentSite.totp && currentSite.totp[0] === path[0]) {
            kpxc.settings['defined-custom-fields'][location].totp = undefined;
        }
    };

    let usernamePath;
    let passwordPath;
    let totpPath;
    const stringFieldsPaths = [];

    if (kpxcCustomLoginFieldsBanner.selection.username) {
        usernamePath = kpxcFields.setId(kpxcCustomLoginFieldsBanner.selection.username.originalElement);
    }

    if (kpxcCustomLoginFieldsBanner.selection.password) {
        passwordPath = kpxcFields.setId(kpxcCustomLoginFieldsBanner.selection.password.originalElement);
    }

    if (kpxcCustomLoginFieldsBanner.selection.totp) {
        totpPath = kpxcFields.setId(kpxcCustomLoginFieldsBanner.selection.totp.originalElement);
    }

    for (const i of kpxcCustomLoginFieldsBanner.selection.fields) {
        stringFieldsPaths.push(kpxcFields.setId(i));
    }

    const location = kpxc.getDocumentLocation();
    const currentSettings = kpxc.settings['defined-custom-fields'][location];

    if (kpxcCustomLoginFieldsBanner.singleSelection && currentSettings) {
        // Update the single selection to current settings
        if (usernamePath) {
            clearIdenticalField(usernamePath, location);
            kpxc.settings['defined-custom-fields'][location].username = usernamePath;
        } else if (passwordPath) {
            clearIdenticalField(passwordPath, location);
            kpxc.settings['defined-custom-fields'][location].password = passwordPath;
        } else if (totpPath) {
            clearIdenticalField(totpPath, location);
            kpxc.settings['defined-custom-fields'][location].totp = totpPath;
        } else if (stringFieldsPaths.length > 0) {
            kpxc.settings['defined-custom-fields'][location].fields = stringFieldsPaths;
        }
    } else {
        // Override all fields (default)
        kpxc.settings['defined-custom-fields'][location] = {
            username: usernamePath,
            password: passwordPath,
            totp: totpPath,
            fields: stringFieldsPaths
        };
    }

    await sendMessage('save_settings', kpxc.settings);
    kpxcCustomLoginFieldsBanner.destroy();
};

kpxcCustomLoginFieldsBanner.clearData = async function() {
    const location = kpxc.getDocumentLocation();
    delete kpxc.settings['defined-custom-fields'][location];

    await sendMessage('save_settings', kpxc.settings);
    await sendMessage('load_settings');

    kpxcCustomLoginFieldsBanner.buttons.clearData.style.display = 'none';
};

kpxcCustomLoginFieldsBanner.resetSelection = function() {
    kpxcCustomLoginFieldsBanner.selection = {
        username: undefined,
        password: undefined,
        totp: undefined,
        fields: []
    };

    while (kpxcCustomLoginFieldsBanner.chooser.firstChild) {
        kpxcCustomLoginFieldsBanner.chooser.firstChild.remove();
    }

    kpxcCustomLoginFieldsBanner.markedFields = [];
    kpxcCustomLoginFieldsBanner.singleSelection = false;
};

kpxcCustomLoginFieldsBanner.prepareUsernameSelection = function() {
    removeContent('div#kpxcDefine-fixed-field');
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseUsername');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_USERNAME;

    kpxcCustomLoginFieldsBanner.buttons.skip.disabled = false;
    kpxcCustomLoginFieldsBanner.buttons.again.disabled = true;
    kpxcCustomLoginFieldsBanner.buttons.more.disabled = true;
};

kpxcCustomLoginFieldsBanner.preparePasswordSelection = function() {
    removeContent('div.kpxcDefine-fixed-field:not(.kpxcDefine-fixed-username-field)');
    removeContent('div.kpxcDefine-fixed.field');
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChoosePassword');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_PASSWORD;

    kpxcCustomLoginFieldsBanner.buttons.again.disabled = false;
    kpxcCustomLoginFieldsBanner.buttons.more.disabled = false;
};

kpxcCustomLoginFieldsBanner.prepareTOTPSelection = function() {
    removeContent('div.kpxcDefine-fixed-field:not(.kpxcDefine-fixed-username-field):not(.kpxcDefine-fixed-password-field)');
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseTOTP');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_TOTP;

    kpxcCustomLoginFieldsBanner.buttons.skip.disabled = false;
    kpxcCustomLoginFieldsBanner.buttons.again.disabled = false;
    kpxcCustomLoginFieldsBanner.buttons.more.disabled = true;
};

kpxcCustomLoginFieldsBanner.prepareStringFieldSelection = function() {
    removeContent('div.kpxcDefine-fixed-field:not(.kpxcDefine-fixed-username-field):not(.kpxcDefine-fixed-password-field):not(.kpxcDefine-fixed-totp-field):not(.kpxcDefine-fixed-string-field)');
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseStringFields');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_STRING_FIELDS;

    kpxcCustomLoginFieldsBanner.buttons.skip.disabled = true;
    kpxcCustomLoginFieldsBanner.buttons.more.disabled = false;
    kpxcCustomLoginFieldsBanner.buttons.again.disabled = false;
};

kpxcCustomLoginFieldsBanner.isFieldSelected = function(field) {
    if (kpxcCustomLoginFieldsBanner.markedFields.some(f => f === field)) {
        return (
            (kpxcCustomLoginFieldsBanner.selection.username && kpxcCustomLoginFieldsBanner.selection.username.originalElement === field)
            || (kpxcCustomLoginFieldsBanner.selection.password && kpxcCustomLoginFieldsBanner.selection.password.originalElement === field)
            || (kpxcCustomLoginFieldsBanner.selection.totp && kpxcCustomLoginFieldsBanner.selection.totp.originalElement === field)
            || kpxcCustomLoginFieldsBanner.selection.fields.includes(field)
        );
    }

    return false;
};

kpxcCustomLoginFieldsBanner.markAllUsernameFields = function(singleSelection = false) {
    kpxcCustomLoginFieldsBanner.eventFieldClick = function(e, elem) {
        if (!e.isTrusted) {
            return;
        }

        const field = elem || e.currentTarget;
        if (kpxcCustomLoginFieldsBanner.markedFields.includes(field.originalElement)) {
            return;
        }

        field.classList.add('kpxcDefine-fixed-username-field');
        field.textContent = tr('username');
        field.onclick = undefined;
        kpxcCustomLoginFieldsBanner.selection.username = field;
        kpxcCustomLoginFieldsBanner.markedFields.push(field.originalElement);
        kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = false;

        if (!singleSelection) {
            kpxcCustomLoginFieldsBanner.preparePasswordSelection();
            kpxcCustomLoginFieldsBanner.markAllPasswordFields();
        } else {
            removeContent('div.kpxcDefine-fixed-field:not(.kpxcDefine-fixed-username-field)');
        }
    };

    kpxcCustomLoginFieldsBanner.markFields(kpxcCustomLoginFieldsBanner.inputQueryPattern);
};

kpxcCustomLoginFieldsBanner.markAllPasswordFields = function(singleSelection = false) {
    kpxcCustomLoginFieldsBanner.eventFieldClick = function(e, elem) {
        if (!e.isTrusted) {
            return;
        }

        const field = elem || e.currentTarget;
        if (kpxcCustomLoginFieldsBanner.markedFields.includes(field.originalElement)) {
            return;
        }

        field.classList.add('kpxcDefine-fixed-password-field');
        field.textContent = tr('password');
        field.onclick = undefined;
        kpxcCustomLoginFieldsBanner.selection.password = field;
        kpxcCustomLoginFieldsBanner.markedFields.push(field.originalElement);
        kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = false;

        if (!singleSelection) {
            kpxcCustomLoginFieldsBanner.prepareTOTPSelection();
            kpxcCustomLoginFieldsBanner.markAllTOTPFields();
        } else {
            removeContent('div.kpxcDefine-fixed-field:not(.kpxcDefine-fixed-password-field)');
        }
    };

    kpxcCustomLoginFieldsBanner.markFields('input[type=\'password\']');
};

kpxcCustomLoginFieldsBanner.markAllTOTPFields = function(singleSelection = false) {
    kpxcCustomLoginFieldsBanner.eventFieldClick = function(e, elem) {
        if (!e.isTrusted) {
            return;
        }

        const field = elem || e.currentTarget;
        if (kpxcCustomLoginFieldsBanner.markedFields.includes(field.originalElement)) {
            return;
        }

        field.classList.add('kpxcDefine-fixed-totp-field');
        field.textContent = 'TOTP';
        field.onclick = undefined;
        kpxcCustomLoginFieldsBanner.selection.totp = field;
        kpxcCustomLoginFieldsBanner.markedFields.push(field.originalElement);
        kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = false;

        if (!singleSelection) {
            kpxcCustomLoginFieldsBanner.prepareStringFieldSelection();
            kpxcCustomLoginFieldsBanner.markAllStringFields();
        } else {
            removeContent('div.kpxcDefine-fixed-field:not(.kpxcDefine-fixed-totp-field)');
        }
    };

    kpxcCustomLoginFieldsBanner.markFields(kpxcCustomLoginFieldsBanner.inputQueryPattern);
};

kpxcCustomLoginFieldsBanner.markAllStringFields = function() {
    kpxcCustomLoginFieldsBanner.eventFieldClick = function(e, elem) {
        if (!e.isTrusted) {
            return;
        }

        const field = elem || e.currentTarget;
        if (kpxcCustomLoginFieldsBanner.isFieldSelected(field.originalElement)) {
            return;
        }

        kpxcCustomLoginFieldsBanner.selection.fields.push(field.originalElement);
        kpxcCustomLoginFieldsBanner.markedFields.push(field.originalElement);
        kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = false;

        field.classList.add('kpxcDefine-fixed-string-field');
        field.textContent = tr('defineStringField') + String(kpxcCustomLoginFieldsBanner.selection.fields.length);
        field.onclick = undefined;
    };

    kpxcCustomLoginFieldsBanner.markFields(kpxcCustomLoginFieldsBanner.inputQueryPattern + ', select');
};

kpxcCustomLoginFieldsBanner.markFields = function(pattern) {
    let index = 1;
    let firstInput;
    const inputs = document.querySelectorAll(pattern);

    for (const i of inputs) {
        if (kpxcCustomLoginFieldsBanner.isFieldSelected(i)) {
            continue;
        }

        if (!kpxcFields.isVisible(i)) {
            continue;
        }

        const field = kpxcUI.createElement('div', 'kpxcDefine-fixed-field');
        field.originalElement = i;

        const rect = i.getBoundingClientRect();
        field.style.top = Pixels(rect.top);
        field.style.left = Pixels(rect.left);
        field.style.width = Pixels(rect.width);
        field.style.height = Pixels(rect.height);
        field.textContent = String(index);

        field.addEventListener('click', function(e) {
            kpxcCustomLoginFieldsBanner.eventFieldClick(e);
        });

        field.addEventListener('mouseenter', function() {
            field.classList.add('kpxcDefine-fixed-hover-field');
        });

        field.addEventListener('mouseleave', function() {
            field.classList.remove('kpxcDefine-fixed-hover-field');
        });

        i.addEventListener('focus', function() {
            field.classList.add('kpxcDefine-fixed-hover-field');
        });

        i.addEventListener('blur', function() {
            field.classList.remove('kpxcDefine-fixed-hover-field');
        });

        if (kpxcCustomLoginFieldsBanner.chooser) {
            kpxcCustomLoginFieldsBanner.chooser.append(field);
            firstInput = field;
            ++index;
        }
    }

    if (firstInput) {
        firstInput.focus();
    }
};

// Handle keyboard events
kpxcCustomLoginFieldsBanner.keyDown = function(e) {
    if (!e.isTrusted) {
        return;
    }

    if (e.key === 'Escape') {
        kpxcCustomLoginFieldsBanner.destroy();
    } else if (e.key === 'Enter') {
        e.preventDefault();
    } else if (e.keyCode >= 49 && e.keyCode <= 57) {
        // Select input field by number
        e.preventDefault();

        const index = e.keyCode - 48;
        const inputFields
            = [ ...kpxcCustomLoginFieldsBanner.chooser.children ].filter(c => !c.classList.contains('kpxcDefine-fixed-username-field')
                && !c.classList.contains('kpxcDefine-fixed-password-field') && !c.classList.contains('kpxcDefine-fixed-totp-field'));

        if (inputFields.length >= index) {
            kpxcCustomLoginFieldsBanner.eventFieldClick(e, inputFields[index - 1]);
        }
    } else if (e.key === 's') {
        e.preventDefault();
        kpxcCustomLoginFieldsBanner.skip();
    } else if (e.key === 'a') {
        e.preventDefault();
        kpxcCustomLoginFieldsBanner.again();
    } else if (e.key === 'c' && !kpxcCustomLoginFieldsBanner.buttons.confirm.disabled) {
        e.preventDefault();
        kpxcCustomLoginFieldsBanner.confirm();
    } else if (e.key === 'm') {
        e.preventDefault();
        kpxcCustomLoginFieldsBanner.more();
    } else if (e.key === 'd') {
        e.preventDefault();
        kpxcCustomLoginFieldsBanner.clearData();
    }
};

const removeContent = function(pattern) {
    const elems = kpxcCustomLoginFieldsBanner.chooser.querySelectorAll(pattern);
    for (const e of elems) {
        e.remove();
    }
};
