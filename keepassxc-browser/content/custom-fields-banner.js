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
kpxcCustomLoginFieldsBanner.wrapper = undefined;
kpxcCustomLoginFieldsBanner.inputQueryPattern = 'input:not([type=button]):not([type=checkbox]):not([type=color]):not([type=date]):not([type=datetime-local]):not([type=file]):not([type=hidden]):not([type=image]):not([type=month]):not([type=range]):not([type=reset]):not([type=submit]):not([type=time]):not([type=week]), select, textarea';
kpxcCustomLoginFieldsBanner.markedFields = [];

kpxcCustomLoginFieldsBanner.selection = {
    username: undefined,
    usernameElement: undefined,
    password: undefined,
    passwordElement: undefined,
    totp: undefined,
    totpElement: undefined,
    fields: [],
    fieldElements: [],
};

kpxcCustomLoginFieldsBanner.buttons = {
    reset: undefined,
    confirm: undefined,
    clearData: undefined,
    close: undefined,
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
    const icon = kpxcUI.createElement('span', iconClassName);
    const infoText = kpxcUI.createElement('span', '', {}, tr('defineChooseCustomLoginFieldText'));
    const separator = kpxcUI.createElement('div', 'kpxc-separator');
    const secondSeparator = kpxcUI.createElement('div', 'kpxc-separator');

    const resetButton = kpxcUI.createButton(BLUE_BUTTON, tr('defineReset'), kpxcCustomLoginFieldsBanner.reset);
    const usernameButton = kpxcUI.createButton(ORANGE_BUTTON, tr('username'), kpxcCustomLoginFieldsBanner.usernameButtonClicked);
    const passwordButton = kpxcUI.createButton(RED_BUTTON, tr('password'), kpxcCustomLoginFieldsBanner.passwordButtonClicked);
    const totpButton = kpxcUI.createButton(GREEN_BUTTON, 'TOTP', kpxcCustomLoginFieldsBanner.totpButtonClicked);
    const stringFieldsButton = kpxcUI.createButton(BLUE_BUTTON, tr('stringFields'), kpxcCustomLoginFieldsBanner.stringFieldsButtonClicked);
    const clearDataButton = kpxcUI.createButton(RED_BUTTON, tr('defineClearData'), kpxcCustomLoginFieldsBanner.clearData);
    const confirmButton = kpxcUI.createButton(GREEN_BUTTON, tr('defineConfirm'), kpxcCustomLoginFieldsBanner.confirm);
    const closeButton = kpxcUI.createButton(RED_BUTTON, tr('defineClose'), kpxcCustomLoginFieldsBanner.closeButtonClicked);

    confirmButton.disabled = true;
    kpxcCustomLoginFieldsBanner.banner = banner;
    kpxcCustomLoginFieldsBanner.infoText = infoText;
    kpxcCustomLoginFieldsBanner.buttons.reset = resetButton;
    kpxcCustomLoginFieldsBanner.buttons.clearData = clearDataButton;
    kpxcCustomLoginFieldsBanner.buttons.confirm = confirmButton;
    kpxcCustomLoginFieldsBanner.buttons.close = closeButton;

    bannerInfo.appendMultiple(icon, infoText);
    bannerButtons.appendMultiple(resetButton, separator, usernameButton,
        passwordButton, totpButton, stringFieldsButton, secondSeparator, clearDataButton, confirmButton, closeButton);
    banner.appendMultiple(bannerInfo, bannerButtons);

    const location = kpxc.getDocumentLocation();
    kpxcCustomLoginFieldsBanner.buttons.clearData.style.display
        = kpxc.settings['defined-custom-fields'] && kpxc.settings['defined-custom-fields'][location]
            ? 'inline-block' : 'none';

    initColorTheme(banner);

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
    kpxcCustomLoginFieldsBanner.wrapper = wrapper;

    if (window.self === window.top && !kpxcCustomLoginFieldsBanner.created) {
        window.parent.document.body.appendChild(wrapper);
        kpxcCustomLoginFieldsBanner.created = true;
    }

    document.addEventListener('keydown', kpxcCustomLoginFieldsBanner.keyDown);
};

kpxcCustomLoginFieldsBanner.usernameButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.prepareUsernameSelection();
    kpxcCustomLoginFieldsBanner.selectUserNameField();

    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.passwordButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.preparePasswordSelection();
    kpxcCustomLoginFieldsBanner.selectPasswordField();

    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.totpButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.prepareTOTPSelection();
    kpxcCustomLoginFieldsBanner.markAllTOTPFields();

    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.stringFieldsButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.prepareStringFieldSelection();
    kpxcCustomLoginFieldsBanner.markAllStringFields();

    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.closeButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.destroy();
};

// Updates the possible selections if the page content has been changed
kpxcCustomLoginFieldsBanner.updateFieldSelections = function() {
    kpxcCustomLoginFieldsBanner.removeMarkedFields();

    if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_USERNAME) {
        kpxcCustomLoginFieldsBanner.prepareUsernameSelection();
        kpxcCustomLoginFieldsBanner.selectUserNameField();
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_PASSWORD) {
        kpxcCustomLoginFieldsBanner.preparePasswordSelection();
        kpxcCustomLoginFieldsBanner.selectPasswordField();
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_TOTP) {
        kpxcCustomLoginFieldsBanner.prepareTOTPSelection();
        kpxcCustomLoginFieldsBanner.markAllTOTPFields();
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_STRING_FIELDS) {
        kpxcCustomLoginFieldsBanner.prepareStringFieldSelection();
        kpxcCustomLoginFieldsBanner.markAllStringFields();
    }
};

// Reset selections
kpxcCustomLoginFieldsBanner.reset = function() {
    kpxcCustomLoginFieldsBanner.resetSelection();

    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseCustomLoginFieldText');
};

// Confirm and save the selections
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

    const usernamePath = kpxcCustomLoginFieldsBanner.selection.username;
    const passwordPath = kpxcCustomLoginFieldsBanner.selection.password;
    const totpPath = kpxcCustomLoginFieldsBanner.selection.totp;
    const stringFieldsPaths = kpxcCustomLoginFieldsBanner.selection.fields;
    const location = kpxc.getDocumentLocation();
    const currentSettings = kpxc.settings['defined-custom-fields'][location];

    if (currentSettings) {
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

// Clears the previously saved data from settings
kpxcCustomLoginFieldsBanner.clearData = async function() {
    const location = kpxc.getDocumentLocation();
    delete kpxc.settings['defined-custom-fields'][location];

    await sendMessage('save_settings', kpxc.settings);
    await sendMessage('load_settings');

    kpxcCustomLoginFieldsBanner.buttons.clearData.style.display = 'none';
};

// Resets all selections and marked fields
kpxcCustomLoginFieldsBanner.resetSelection = function() {
    kpxcCustomLoginFieldsBanner.selection = {
        username: undefined,
        password: undefined,
        totp: undefined,
        fields: []
    };

    kpxcCustomLoginFieldsBanner.removeMarkedFields();
};

kpxcCustomLoginFieldsBanner.removeMarkedFields = function() {
    while (kpxcCustomLoginFieldsBanner.chooser.firstChild) {
        kpxcCustomLoginFieldsBanner.chooser.firstChild.remove();
    }

    kpxcCustomLoginFieldsBanner.markedFields = [];
};

kpxcCustomLoginFieldsBanner.prepareUsernameSelection = function() {
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseUsername');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_USERNAME;
};

kpxcCustomLoginFieldsBanner.preparePasswordSelection = function() {
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChoosePassword');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_PASSWORD;
};

kpxcCustomLoginFieldsBanner.prepareTOTPSelection = function() {
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseTOTP');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_TOTP;
};

kpxcCustomLoginFieldsBanner.prepareStringFieldSelection = function() {
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseStringFields');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_STRING_FIELDS;
};

kpxcCustomLoginFieldsBanner.isFieldSelected = function(field) {
    const currentFieldId = kpxcFields.setId(field);

    if (kpxcCustomLoginFieldsBanner.markedFields.some(f => f === field)) {
        return (
            (kpxcCustomLoginFieldsBanner.selection.username && kpxcCustomLoginFieldsBanner.selection.usernameElement === field)
            || (kpxcCustomLoginFieldsBanner.selection.password && kpxcCustomLoginFieldsBanner.selection.passwordElement === field)
            || (kpxcCustomLoginFieldsBanner.selection.totp && kpxcCustomLoginFieldsBanner.selection.totpElement === field)
            || kpxcCustomLoginFieldsBanner.selection.fields.some(f => f[0] === currentFieldId[0])
        );
    }

    return false;
};

kpxcCustomLoginFieldsBanner.selectUserNameField = function() {
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

        kpxcCustomLoginFieldsBanner.selection.username = kpxcFields.setId(field.originalElement);
        kpxcCustomLoginFieldsBanner.selection.usernameElement = field.originalElement;
        kpxcCustomLoginFieldsBanner.markedFields.push(field.originalElement);
        kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = false;

        kpxcCustomLoginFieldsBanner.backToStart();
    };

    kpxcCustomLoginFieldsBanner.markFields();
};

kpxcCustomLoginFieldsBanner.selectPasswordField = function() {
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

        kpxcCustomLoginFieldsBanner.selection.password = kpxcFields.setId(field.originalElement);
        kpxcCustomLoginFieldsBanner.selection.passwordElement = field.originalElement;
        kpxcCustomLoginFieldsBanner.markedFields.push(field.originalElement);
        kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = false;

        kpxcCustomLoginFieldsBanner.backToStart();
    };

    kpxcCustomLoginFieldsBanner.markFields();
};

kpxcCustomLoginFieldsBanner.markAllTOTPFields = function() {
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

        kpxcCustomLoginFieldsBanner.selection.totp = kpxcFields.setId(field.originalElement);
        kpxcCustomLoginFieldsBanner.selection.totpElement = field.originalElement;
        kpxcCustomLoginFieldsBanner.markedFields.push(field.originalElement);
        kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = false;

        kpxcCustomLoginFieldsBanner.backToStart();
    };

    kpxcCustomLoginFieldsBanner.markFields();
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

        kpxcCustomLoginFieldsBanner.selection.fields.push(kpxcFields.setId(field.originalElement));
        kpxcCustomLoginFieldsBanner.markedFields.push(field.originalElement);
        kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = false;

        field.classList.add('kpxcDefine-fixed-string-field');
        field.textContent = tr('defineStringField') + String(kpxcCustomLoginFieldsBanner.selection.fields.length);
        field.onclick = undefined;
    };

    kpxcCustomLoginFieldsBanner.markFields();
};

kpxcCustomLoginFieldsBanner.markFields = function() {
    let index = 1;
    let firstInput;
    const inputs = document.querySelectorAll(kpxcCustomLoginFieldsBanner.inputQueryPattern);

    for (const i of inputs) {
        if (kpxcCustomLoginFieldsBanner.isFieldSelected(i)
            || inputFieldIsSelected(i)
            || !kpxcFields.isVisible(i)) {
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

// Returns to start after a single selection
kpxcCustomLoginFieldsBanner.backToStart = function() {
    removeContent('div.kpxcDefine-fixed-field:not(.kpxcDefine-fixed-username-field):not(.kpxcDefine-fixed-password-field):not(.kpxcDefine-fixed-totp-field):not(.kpxcDefine-fixed-string-field)');
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseCustomLoginFieldText');
};

// Handle keyboard events
kpxcCustomLoginFieldsBanner.keyDown = function(e) {
    if (!e.isTrusted) {
        return;
    }

    if (e.key === 'Escape') {
        kpxcCustomLoginFieldsBanner.destroy();
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
    }
};

const removeContent = function(pattern) {
    const elems = kpxcCustomLoginFieldsBanner.chooser.querySelectorAll(pattern);
    for (const e of elems) {
        e.remove();
    }
};

const inputFieldIsSelected = function(field) {
    for (const child of kpxcCustomLoginFieldsBanner.chooser.children) {
        if (child.originalElement === field) {
            return true;
        }
    }

    return false;
};
