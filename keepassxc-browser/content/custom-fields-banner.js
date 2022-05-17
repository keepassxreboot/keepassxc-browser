'use strict';

const STEP_NONE = 0;
const STEP_SELECT_USERNAME = 1;
const STEP_SELECT_PASSWORD = 2;
const STEP_SELECT_TOTP = 3;
const STEP_SELECT_STRING_FIELDS = 4;

const FIXED_FIELD_CLASS = 'kpxcDefine-fixed-field';
const HOVER_FIELD_CLASS = 'kpxcDefine-fixed-hover-field';
const USERNAME_FIELD_CLASS = 'kpxcDefine-fixed-username-field';
const PASSWORD_FIELD_CLASS = 'kpxcDefine-fixed-password-field';
const TOTP_FIELD_CLASS = 'kpxcDefine-fixed-totp-field';
const STRING_FIELD_CLASS = 'kpxcDefine-fixed-string-field';
const GRAY_BUTTON_CLASS = 'kpxc-gray-button';

const kpxcCustomLoginFieldsBanner = {};
kpxcCustomLoginFieldsBanner.banner = undefined;
kpxcCustomLoginFieldsBanner.chooser = undefined;
kpxcCustomLoginFieldsBanner.created = false;
kpxcCustomLoginFieldsBanner.dataStep = STEP_NONE;
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
    closeButton.style.minWidth = Pixels(64);

    confirmButton.disabled = true;
    kpxcCustomLoginFieldsBanner.banner = banner;
    kpxcCustomLoginFieldsBanner.infoText = infoText;
    kpxcCustomLoginFieldsBanner.buttons.reset = resetButton;
    kpxcCustomLoginFieldsBanner.buttons.clearData = clearDataButton;
    kpxcCustomLoginFieldsBanner.buttons.confirm = confirmButton;
    kpxcCustomLoginFieldsBanner.buttons.close = closeButton;
    kpxcCustomLoginFieldsBanner.buttons.username = usernameButton;
    kpxcCustomLoginFieldsBanner.buttons.password = passwordButton;
    kpxcCustomLoginFieldsBanner.buttons.totp = totpButton;
    kpxcCustomLoginFieldsBanner.buttons.stringFields = stringFieldsButton;

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

kpxcCustomLoginFieldsBanner.removeSelection = function(selection, fieldClass) {
    const inputField = kpxcFields.getElementFromXPathId(selection[0]);
    const index = kpxcCustomLoginFieldsBanner.markedFields.indexOf(inputField);
    if (index >= 0) {
        removeContent(fieldClass);
        kpxcCustomLoginFieldsBanner.markedFields.splice(index, 1);
    }
};

kpxcCustomLoginFieldsBanner.enableAllButtons = function() {
    for (const button of Object.values(kpxcCustomLoginFieldsBanner.buttons)) {
        button.classList.remove(GRAY_BUTTON_CLASS);
    }
};

kpxcCustomLoginFieldsBanner.usernameButtonClicked = function(e) {
    // Cancel the current selection if button is clicked again
    if (!e.isTrusted || kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_USERNAME) {
        kpxcCustomLoginFieldsBanner.backToStart();
        return;
    }

    // Reset username field selection if already set
    if (kpxcCustomLoginFieldsBanner.selection.username) {
        kpxcCustomLoginFieldsBanner.removeSelection(kpxcCustomLoginFieldsBanner.selection.username, `div.${USERNAME_FIELD_CLASS}`);
        kpxcCustomLoginFieldsBanner.selection.username = undefined;
    }

    kpxcCustomLoginFieldsBanner.prepareUsernameSelection();
    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.passwordButtonClicked = function(e) {
    if (!e.isTrusted || kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_PASSWORD) {
        kpxcCustomLoginFieldsBanner.backToStart();
        return;
    }

    // Reset password field selection if already set
    if (kpxcCustomLoginFieldsBanner.selection.password) {
        kpxcCustomLoginFieldsBanner.removeSelection(kpxcCustomLoginFieldsBanner.selection.password, `div.${PASSWORD_FIELD_CLASS}`);
        kpxcCustomLoginFieldsBanner.selection.password = undefined;
    }

    kpxcCustomLoginFieldsBanner.preparePasswordSelection();
    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.totpButtonClicked = function(e) {
    if (!e.isTrusted || kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_TOTP) {
        kpxcCustomLoginFieldsBanner.backToStart();
        return;
    }

    // Reset TOTP field selection if already set
    if (kpxcCustomLoginFieldsBanner.selection.totp) {
        kpxcCustomLoginFieldsBanner.removeSelection(kpxcCustomLoginFieldsBanner.selection.totp, `div.${TOTP_FIELD_CLASS}`);
        kpxcCustomLoginFieldsBanner.selection.totp = undefined;
    }

    kpxcCustomLoginFieldsBanner.prepareTOTPSelection();
    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
};

kpxcCustomLoginFieldsBanner.stringFieldsButtonClicked = function(e) {
    if (!e.isTrusted || kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_STRING_FIELDS) {
        kpxcCustomLoginFieldsBanner.backToStart();
        return;
    }

    // Reset TOTP field selection if already set
    if (kpxcCustomLoginFieldsBanner.selection.fields.length > 0) {
        for (const field of kpxcCustomLoginFieldsBanner.selection.fields) {
            kpxcCustomLoginFieldsBanner.removeSelection(field, `div.${STRING_FIELD_CLASS}`);
        }

        kpxcCustomLoginFieldsBanner.selection.fields = [];
    }

    kpxcCustomLoginFieldsBanner.prepareStringFieldSelection();
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
    if (kpxcCustomLoginFieldsBanner.dataStep === STEP_NONE && kpxcCustomLoginFieldsBanner.markedFields.length === 0) {
        return;
    }

    kpxcCustomLoginFieldsBanner.removeMarkedFields();

    if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_USERNAME) {
        kpxcCustomLoginFieldsBanner.prepareUsernameSelection();
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_PASSWORD) {
        kpxcCustomLoginFieldsBanner.preparePasswordSelection();
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_TOTP) {
        kpxcCustomLoginFieldsBanner.prepareTOTPSelection();
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_STRING_FIELDS) {
        kpxcCustomLoginFieldsBanner.prepareStringFieldSelection();
    }
};

// Reset selections
kpxcCustomLoginFieldsBanner.reset = function() {
    kpxcCustomLoginFieldsBanner.resetSelection();

    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseCustomLoginFieldText');
    kpxcCustomLoginFieldsBanner.buttons.close.textContent = tr('defineClose');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_NONE;

    kpxcCustomLoginFieldsBanner.enableAllButtons();
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
        }

        if (passwordPath) {
            clearIdenticalField(passwordPath, location);
            kpxc.settings['defined-custom-fields'][location].password = passwordPath;
        }

        if (totpPath) {
            clearIdenticalField(totpPath, location);
            kpxc.settings['defined-custom-fields'][location].totp = totpPath;
        }

        if (stringFieldsPaths.length > 0) {
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
    kpxcCustomLoginFieldsBanner.buttons.username.classList.remove(GRAY_BUTTON_CLASS);
    kpxcCustomLoginFieldsBanner.selectUserNameField();
};

kpxcCustomLoginFieldsBanner.preparePasswordSelection = function() {
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChoosePassword');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_PASSWORD;
    kpxcCustomLoginFieldsBanner.buttons.password.classList.remove(GRAY_BUTTON_CLASS);
    kpxcCustomLoginFieldsBanner.selectPasswordField();
};

kpxcCustomLoginFieldsBanner.prepareTOTPSelection = function() {
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseTOTP');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_TOTP;
    kpxcCustomLoginFieldsBanner.buttons.totp.classList.remove(GRAY_BUTTON_CLASS);
    kpxcCustomLoginFieldsBanner.selectTOTPField();
};

kpxcCustomLoginFieldsBanner.prepareStringFieldSelection = function() {
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseStringFields');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_STRING_FIELDS;
    kpxcCustomLoginFieldsBanner.buttons.stringFields.classList.remove(GRAY_BUTTON_CLASS);
    kpxcCustomLoginFieldsBanner.selectStringFields();
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

kpxcCustomLoginFieldsBanner.getSelectedField = function(e, elem) {
    if (!e.isTrusted) {
        return undefined;
    }

    const field = elem || e.currentTarget;
    if (kpxcCustomLoginFieldsBanner.markedFields.includes(field.originalElement)) {
        return undefined;
    }

    return field;
};

kpxcCustomLoginFieldsBanner.setSelectedField = function(elem) {
    kpxcCustomLoginFieldsBanner.markedFields.push(elem);
    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = false;
    kpxcCustomLoginFieldsBanner.buttons.close.textContent = tr('optionsButtonCancel');
};

kpxcCustomLoginFieldsBanner.selectUserNameField = function() {
    kpxcCustomLoginFieldsBanner.eventFieldClick = function(e, elem) {
        const field = kpxcCustomLoginFieldsBanner.getSelectedField(e, elem);
        if (!field) {
            return;
        }

        field.classList.add(USERNAME_FIELD_CLASS);
        field.textContent = tr('username');
        field.onclick = undefined;

        kpxcCustomLoginFieldsBanner.selection.username = kpxcFields.setId(field.originalElement);
        kpxcCustomLoginFieldsBanner.selection.usernameElement = field.originalElement;
        kpxcCustomLoginFieldsBanner.setSelectedField(field.originalElement);
        kpxcCustomLoginFieldsBanner.backToStart();

        kpxcCustomLoginFieldsBanner.buttons.username.classList.add(GRAY_BUTTON_CLASS);
    };

    kpxcCustomLoginFieldsBanner.markFields();
};

kpxcCustomLoginFieldsBanner.selectPasswordField = function() {
    kpxcCustomLoginFieldsBanner.eventFieldClick = function(e, elem) {
        const field = kpxcCustomLoginFieldsBanner.getSelectedField(e, elem);
        if (!field) {
            return;
        }

        field.classList.add(PASSWORD_FIELD_CLASS);
        field.textContent = tr('password');
        field.onclick = undefined;

        kpxcCustomLoginFieldsBanner.selection.password = kpxcFields.setId(field.originalElement);
        kpxcCustomLoginFieldsBanner.selection.passwordElement = field.originalElement;
        kpxcCustomLoginFieldsBanner.setSelectedField(field.originalElement);
        kpxcCustomLoginFieldsBanner.backToStart();

        kpxcCustomLoginFieldsBanner.buttons.password.classList.add(GRAY_BUTTON_CLASS);
    };

    kpxcCustomLoginFieldsBanner.markFields();
};

kpxcCustomLoginFieldsBanner.selectTOTPField = function() {
    kpxcCustomLoginFieldsBanner.eventFieldClick = function(e, elem) {
        const field = kpxcCustomLoginFieldsBanner.getSelectedField(e, elem);
        if (!field) {
            return;
        }

        field.classList.add(TOTP_FIELD_CLASS);
        field.textContent = 'TOTP';
        field.onclick = undefined;

        kpxcCustomLoginFieldsBanner.selection.totp = kpxcFields.setId(field.originalElement);
        kpxcCustomLoginFieldsBanner.selection.totpElement = field.originalElement;
        kpxcCustomLoginFieldsBanner.setSelectedField(field.originalElement);
        kpxcCustomLoginFieldsBanner.backToStart();

        kpxcCustomLoginFieldsBanner.buttons.totp.classList.add(GRAY_BUTTON_CLASS);
    };

    kpxcCustomLoginFieldsBanner.markFields();
};

kpxcCustomLoginFieldsBanner.selectStringFields = function() {
    kpxcCustomLoginFieldsBanner.eventFieldClick = function(e, elem) {
        const field = kpxcCustomLoginFieldsBanner.getSelectedField(e, elem);
        if (!field) {
            return;
        }

        kpxcCustomLoginFieldsBanner.selection.fields.push(kpxcFields.setId(field.originalElement));
        kpxcCustomLoginFieldsBanner.setSelectedField(field.originalElement);

        field.classList.add(STRING_FIELD_CLASS);
        field.textContent = tr('defineStringField') + String(kpxcCustomLoginFieldsBanner.selection.fields.length);
        field.onclick = undefined;

        kpxcCustomLoginFieldsBanner.buttons.stringFields.classList.add(GRAY_BUTTON_CLASS);
    };

    kpxcCustomLoginFieldsBanner.markFields();
};

kpxcCustomLoginFieldsBanner.markFields = function() {
    let index = 1;
    let firstInput;
    const inputs = document.querySelectorAll(kpxcCustomLoginFieldsBanner.inputQueryPattern);

    for (const i of inputs) {
        if (kpxcCustomLoginFieldsBanner.isFieldSelected(i)
            || inputFieldIsSelected(i)) {
            continue;
        }

        const field = kpxcUI.createElement('div', FIXED_FIELD_CLASS);
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
            field.classList.add(HOVER_FIELD_CLASS);
        });

        field.addEventListener('mouseleave', function() {
            field.classList.remove(HOVER_FIELD_CLASS);
        });

        i.addEventListener('focus', function() {
            field.classList.add(HOVER_FIELD_CLASS);
        });

        i.addEventListener('blur', function() {
            field.classList.remove(HOVER_FIELD_CLASS);
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
    removeContent(`div.${FIXED_FIELD_CLASS}:not(.${USERNAME_FIELD_CLASS}):not(.${PASSWORD_FIELD_CLASS}):not(.${TOTP_FIELD_CLASS}):not(.${STRING_FIELD_CLASS})`);
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseCustomLoginFieldText');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_NONE;

    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = kpxcCustomLoginFieldsBanner.markedFields.length === 0;
};

// Handle keyboard events
kpxcCustomLoginFieldsBanner.keyDown = function(e) {
    if (!e.isTrusted) {
        return;
    }

    // Works as a cancel when selection process is active
    if (e.key === 'Escape') {
        if (kpxcCustomLoginFieldsBanner.dataStep === STEP_NONE) {
            kpxcCustomLoginFieldsBanner.destroy();
        } else {
            kpxcCustomLoginFieldsBanner.backToStart();
        }
    } else if (e.keyCode >= 49 && e.keyCode <= 57) {
        // Select input field by number
        e.preventDefault();

        const index = e.keyCode - 48;
        const inputFields
            = [ ...kpxcCustomLoginFieldsBanner.chooser.children ].filter(c => !c.classList.contains(USERNAME_FIELD_CLASS)
                && !c.classList.contains(PASSWORD_FIELD_CLASS) && !c.classList.contains(TOTP_FIELD_CLASS));

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
