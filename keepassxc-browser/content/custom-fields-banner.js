'use strict';

const STEP_NONE = 0;
const STEP_SELECT_USERNAME = 1;
const STEP_SELECT_PASSWORD = 2;
const STEP_SELECT_TOTP = 3;
const STEP_SELECT_STRING_FIELDS = 4;

const DEFINED_CUSTOM_FIELDS = 'defined-custom-fields';
const FIXED_FIELD_CLASS = 'kpxcDefine-fixed-field';
const DARK_FIXED_FIELD_CLASS = 'kpxcDefine-fixed-field-dark';
const HOVER_FIELD_CLASS = 'kpxcDefine-fixed-hover-field';
const DARK_HOVER_FIELD_CLASS = 'kpxcDefine-fixed-hover-field-dark';
const DARK_TEXT_CLASS = 'kpxcDefine-dark-text';
const USERNAME_FIELD_CLASS = 'kpxcDefine-fixed-username-field';
const PASSWORD_FIELD_CLASS = 'kpxcDefine-fixed-password-field';
const TOTP_FIELD_CLASS = 'kpxcDefine-fixed-totp-field';
const STRING_FIELD_CLASS = 'kpxcDefine-fixed-string-field';

const kpxcCustomLoginFieldsBanner = {};
kpxcCustomLoginFieldsBanner.banner = undefined;
kpxcCustomLoginFieldsBanner.chooser = undefined;
kpxcCustomLoginFieldsBanner.created = false;
kpxcCustomLoginFieldsBanner.dataStep = STEP_NONE;
kpxcCustomLoginFieldsBanner.infoText = undefined;
kpxcCustomLoginFieldsBanner.wrapper = undefined;
kpxcCustomLoginFieldsBanner.inputQueryPattern = 'input:not([type=button]):not([type=checkbox]):not([type=color]):not([type=date]):not([type=datetime-local]):not([type=file]):not([type=hidden]):not([type=image]):not([type=month]):not([type=range]):not([type=reset]):not([type=submit]):not([type=time]):not([type=week]), select, textarea';
kpxcCustomLoginFieldsBanner.markedFields = [];
kpxcCustomLoginFieldsBanner.nonSelectedElementsPattern = `div.${FIXED_FIELD_CLASS}:not(.${USERNAME_FIELD_CLASS}):not(.${PASSWORD_FIELD_CLASS}):not(.${TOTP_FIELD_CLASS}):not(.${STRING_FIELD_CLASS})`;

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

    if (kpxcCustomLoginFieldsBanner.wrapper && window.self.document.body.contains(kpxcCustomLoginFieldsBanner.wrapper)) {
        window.self.document.body.removeChild(kpxcCustomLoginFieldsBanner.wrapper);
    } else {
        window.self.document.body.removeChild(window.parent.document.body.querySelector('#kpxc-banner'));
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

    const bannerPosition = await sendMessage('banner_get_position');
    const bannerClass =
        bannerPosition === BannerPosition.TOP ? 'kpxc-banner kpxc-banner-on-top' : 'kpxc-banner kpxc-banner-on-bottom';
    const banner = kpxcUI.createElement('div', bannerClass, { 'id': 'container' });
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
    kpxcUI.makeBannerDraggable(banner);

    const location = kpxc.getDocumentLocation();
    kpxcCustomLoginFieldsBanner.buttons.clearData.style.display
        = kpxc.settings[DEFINED_CUSTOM_FIELDS] && kpxc.settings[DEFINED_CUSTOM_FIELDS][location]
            ? 'inline-block' : 'none';
    if (window.self !== window.top && kpxcCustomLoginFieldsBanner.buttons.clearData.style.display === 'inline-block') {
        sendMessageToParent(undefined, 'enable_clear_data_button');
    }

    initColorTheme(banner);

    const styleSheet = createStylesheet('css/banner.css');
    const defineStyleSheet = createStylesheet('css/define.css');
    const buttonStyleSheet = createStylesheet('css/button.css');
    const colorStyleSheet = createStylesheet('css/colors.css');

    const wrapper = document.createElement('div');
    wrapper.style.all = 'unset';
    wrapper.style.display = 'none';
    styleSheet.addEventListener('load', () => wrapper.style.display = 'block');
    this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    this.shadowRoot.append(colorStyleSheet);
    this.shadowRoot.append(defineStyleSheet);
    this.shadowRoot.append(buttonStyleSheet);
    this.shadowRoot.append(styleSheet);

    // Only create the banner to top window
    if (window.self === window.top) {
        this.shadowRoot.append(banner);
    }

    this.shadowRoot.append(kpxcCustomLoginFieldsBanner.chooser);
    kpxcCustomLoginFieldsBanner.wrapper = wrapper;

    if (!kpxcCustomLoginFieldsBanner.created) {
        window.self.document.body.appendChild(wrapper);
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

    sendMessageToFrames(e, 'username_button_clicked');
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

    sendMessageToFrames(e, 'password_button_clicked');
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

    sendMessageToFrames(e, 'totp_button_clicked');
};

kpxcCustomLoginFieldsBanner.stringFieldsButtonClicked = function(e) {
    if (!e.isTrusted || kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_STRING_FIELDS) {
        kpxcCustomLoginFieldsBanner.backToStart();
        return;
    }

    // Reset String Field selection if already set
    if (kpxcCustomLoginFieldsBanner.selection.fields.length > 0) {
        for (const field of kpxcCustomLoginFieldsBanner.selection.fields) {
            kpxcCustomLoginFieldsBanner.removeSelection(field, `div.${STRING_FIELD_CLASS}`);
        }

        kpxcCustomLoginFieldsBanner.selection.fields = [];
    }

    kpxcCustomLoginFieldsBanner.prepareStringFieldSelection();
    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;

    sendMessageToFrames(e, 'string_field_button_clicked');
};

kpxcCustomLoginFieldsBanner.closeButtonClicked = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcCustomLoginFieldsBanner.destroy();

    sendMessageToFrames(e, 'close_button_clicked');
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
kpxcCustomLoginFieldsBanner.reset = function(e) {
    kpxcCustomLoginFieldsBanner.resetSelection();

    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = true;
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseCustomLoginFieldText');
    kpxcCustomLoginFieldsBanner.buttons.close.textContent = tr('defineClose');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_NONE;

    kpxcCustomLoginFieldsBanner.enableAllButtons();

    sendMessageToFrames(e, 'reset_button_clicked');
};

// Confirm and save the selections
kpxcCustomLoginFieldsBanner.confirm = async function(e) {
    if (!kpxc.settings[DEFINED_CUSTOM_FIELDS]) {
        kpxc.settings[DEFINED_CUSTOM_FIELDS] = {};
    }

    // If the new selection is already used in some other field, clear it
    const clearIdenticalField = function(path, location) {
        const currentSite = kpxc.settings[DEFINED_CUSTOM_FIELDS][location];
        if (currentSite.username?.[0] === path[0]) {
            kpxc.settings[DEFINED_CUSTOM_FIELDS][location].username = undefined;
        } else if (currentSite.password?.[0] === path[0]) {
            kpxc.settings[DEFINED_CUSTOM_FIELDS][location].password = undefined;
        } else if (currentSite.totp?.[0] === path[0]) {
            kpxc.settings[DEFINED_CUSTOM_FIELDS][location].totp = undefined;
        }
    };

    const usernamePath = kpxcCustomLoginFieldsBanner.selection.username;
    const passwordPath = kpxcCustomLoginFieldsBanner.selection.password;
    const totpPath = kpxcCustomLoginFieldsBanner.selection.totp;
    const stringFieldsPaths = kpxcCustomLoginFieldsBanner.selection.fields;
    const location = kpxc.getDocumentLocation();
    const currentSettings = kpxc.settings[DEFINED_CUSTOM_FIELDS][location];

    if (usernamePath || passwordPath || totpPath || stringFieldsPaths.length > 0) {
        if (currentSettings) {
            // Update the single selection to current settings
            if (usernamePath) {
                clearIdenticalField(usernamePath, location);
                kpxc.settings[DEFINED_CUSTOM_FIELDS][location].username = usernamePath;
            }

            if (passwordPath) {
                clearIdenticalField(passwordPath, location);
                kpxc.settings[DEFINED_CUSTOM_FIELDS][location].password = passwordPath;
            }

            if (totpPath) {
                clearIdenticalField(totpPath, location);
                kpxc.settings[DEFINED_CUSTOM_FIELDS][location].totp = totpPath;
            }

            if (stringFieldsPaths.length > 0) {
                kpxc.settings[DEFINED_CUSTOM_FIELDS][location].fields = stringFieldsPaths;
            }
        } else {
            // Override all fields (default, because there's no currentSettings available)
            kpxc.settings[DEFINED_CUSTOM_FIELDS][location] = {
                username: usernamePath,
                password: passwordPath,
                totp: totpPath,
                fields: stringFieldsPaths
            };
        }

        await sendMessage('save_settings', kpxc.settings);
    }

    kpxcCustomLoginFieldsBanner.destroy();
    sendMessageToFrames(e, 'confirm_button_clicked');
};

// Clears the previously saved data from settings
kpxcCustomLoginFieldsBanner.clearData = async function(e) {
    const location = kpxc.getDocumentLocation();
    delete kpxc.settings[DEFINED_CUSTOM_FIELDS][location];

    await sendMessage('save_settings', kpxc.settings);
    await sendMessage('load_settings');

    kpxcCustomLoginFieldsBanner.buttons.clearData.style.display = 'none';

    sendMessageToFrames(e, 'clear_data_button_clicked');
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
    kpxcCustomLoginFieldsBanner.selectField('username');
};

kpxcCustomLoginFieldsBanner.preparePasswordSelection = function() {
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChoosePassword');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_PASSWORD;
    kpxcCustomLoginFieldsBanner.buttons.password.classList.remove(GRAY_BUTTON_CLASS);
    kpxcCustomLoginFieldsBanner.selectField('password');
};

kpxcCustomLoginFieldsBanner.prepareTOTPSelection = function() {
    kpxcCustomLoginFieldsBanner.infoText.textContent = tr('defineChooseTOTP');
    kpxcCustomLoginFieldsBanner.dataStep = STEP_SELECT_TOTP;
    kpxcCustomLoginFieldsBanner.buttons.totp.classList.remove(GRAY_BUTTON_CLASS);
    kpxcCustomLoginFieldsBanner.selectField('totp');
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
    if (elem) {
        kpxcCustomLoginFieldsBanner.markedFields.push(elem);
    }

    kpxcCustomLoginFieldsBanner.buttons.confirm.disabled = false;
    kpxcCustomLoginFieldsBanner.buttons.close.textContent = tr('optionsButtonCancel');
};

// Expects 'username', 'password' or 'totp'
kpxcCustomLoginFieldsBanner.selectField = function(fieldType) {
    kpxcCustomLoginFieldsBanner.eventFieldClick = function(e) {
        const field = kpxcCustomLoginFieldsBanner.getSelectedField(e);
        if (!field) {
            return;
        }

        if (isLightThemeBackground(field.originalElement)) {
            field.classList.add(DARK_TEXT_CLASS);
        }

        field.classList.add(`kpxcDefine-fixed-${fieldType}-field`);
        field.textContent = tr(fieldType);
        field.onclick = undefined;

        kpxcCustomLoginFieldsBanner.selection[fieldType] = kpxcFields.setId(field.originalElement);
        kpxcCustomLoginFieldsBanner.selection[`${fieldType}Element`] = field.originalElement;
        kpxcCustomLoginFieldsBanner.setSelectedField(field.originalElement);
        kpxcCustomLoginFieldsBanner.backToStart();

        kpxcCustomLoginFieldsBanner.buttons[fieldType].classList.add(GRAY_BUTTON_CLASS);
        sendMessageToParent(e, `${fieldType}_selected`, kpxcCustomLoginFieldsBanner.selection[fieldType]);
    };

    kpxcCustomLoginFieldsBanner.markFields();
};

kpxcCustomLoginFieldsBanner.selectStringFields = function() {
    kpxcCustomLoginFieldsBanner.eventFieldClick = function(e) {
        const field = kpxcCustomLoginFieldsBanner.getSelectedField(e);
        if (!field) {
            return;
        }

        if (isLightThemeBackground(field.originalElement)) {
            field.classList.add(DARK_TEXT_CLASS);
        }

        kpxcCustomLoginFieldsBanner.selection.fields.push(kpxcFields.setId(field.originalElement));
        kpxcCustomLoginFieldsBanner.setSelectedField(field.originalElement);

        field.classList.add(STRING_FIELD_CLASS);
        field.textContent = `${tr('defineStringField')} #${String(kpxcCustomLoginFieldsBanner.selection.fields.length)}`;
        field.onclick = undefined;

        kpxcCustomLoginFieldsBanner.buttons.stringFields.classList.add(GRAY_BUTTON_CLASS);
        sendMessageToParent(e, 'string_field_selected', kpxcCustomLoginFieldsBanner.selection.fields);
    };

    kpxcCustomLoginFieldsBanner.markFields();
};

kpxcCustomLoginFieldsBanner.markFields = function() {
    let firstInput;
    const inputs = document.querySelectorAll(kpxcCustomLoginFieldsBanner.inputQueryPattern);
    const zoom = kpxcUI.bodyStyle.zoom || 1;

    for (const i of inputs) {
        if (kpxcCustomLoginFieldsBanner.isFieldSelected(i) || inputFieldIsSelected(i)) {
            // Switch texts to current selection type
            for (const selection of kpxcCustomLoginFieldsBanner.getNonSelectedElements()) {
                selection.textContent = dataStepToString();
            }

            continue;
        }

        const field = kpxcUI.createElement('div', FIXED_FIELD_CLASS);
        field.originalElement = i;

        const rect = i.getBoundingClientRect();
        field.style.top = Pixels(rect.top / zoom);
        field.style.left = Pixels(rect.left / zoom);
        field.style.width = Pixels(rect.width / zoom);
        field.style.height = Pixels(rect.height / zoom);
        field.textContent = dataStepToString();

        // Change selection theme if needed
        const isLightTheme = isLightThemeBackground(i);
        if (isLightTheme) {
            field.classList.add(DARK_FIXED_FIELD_CLASS);
        }

        field.addEventListener('click', function(e) {
            kpxcCustomLoginFieldsBanner.eventFieldClick(e);
        });

        field.addEventListener('mouseenter', function() {
            field.classList.add(isLightTheme ? DARK_HOVER_FIELD_CLASS : HOVER_FIELD_CLASS);
        });

        field.addEventListener('mouseleave', function() {
            field.classList.remove(HOVER_FIELD_CLASS, DARK_HOVER_FIELD_CLASS);
        });

        i.addEventListener('focus', function() {
            field.classList.add(isLightTheme ? DARK_HOVER_FIELD_CLASS : HOVER_FIELD_CLASS);
        });

        i.addEventListener('blur', function() {
            field.classList.remove(HOVER_FIELD_CLASS, DARK_HOVER_FIELD_CLASS);
        });

        if (kpxcCustomLoginFieldsBanner.chooser) {
            kpxcCustomLoginFieldsBanner.setSelectionPosition(field);
            kpxcCustomLoginFieldsBanner.monitorSelectionPosition(field);

            kpxcCustomLoginFieldsBanner.chooser.append(field);
            firstInput = field;
        }
    }

    if (firstInput) {
        firstInput.focus();
    }
};

// Returns to start after a single selection
kpxcCustomLoginFieldsBanner.backToStart = function() {
    removeContent(kpxcCustomLoginFieldsBanner.nonSelectedElementsPattern);
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
    }
};

// Detect page scroll or resize changes
kpxcCustomLoginFieldsBanner.monitorSelectionPosition = function(selection) {
    // Handle icon position on resize
    window.addEventListener('resize', function(e) {
        kpxcCustomLoginFieldsBanner.setSelectionPosition(selection);
    });

    // Handle icon position on scroll
    window.addEventListener('scroll', function(e) {
        kpxcCustomLoginFieldsBanner.setSelectionPosition(selection);
    });
};

// Set selection input field position dynamically including the scroll position
kpxcCustomLoginFieldsBanner.setSelectionPosition = function(field) {
    const zoom = kpxcUI.bodyStyle.zoom || 1;
    const rect = field.originalElement.getBoundingClientRect();
    const left = kpxcUI.getRelativeLeftPosition(rect) / zoom;
    const top = kpxcUI.getRelativeTopPosition(rect) / zoom;
    const scrollTop = kpxcUI.getScrollTop() / zoom;
    const scrollLeft = kpxcUI.getScrollLeft() / zoom;

    field.style.top = Pixels(top + scrollTop);
    field.style.left = Pixels(left + scrollLeft);
};

kpxcCustomLoginFieldsBanner.getNonSelectedElements = function() {
    return kpxcCustomLoginFieldsBanner.chooser.querySelectorAll(kpxcCustomLoginFieldsBanner.nonSelectedElementsPattern);
};

//--------------------------------------------------------------------------
// IFrame support
//--------------------------------------------------------------------------

// Handles messages sent from iframes to the top window
kpxcCustomLoginFieldsBanner.handleTopWindowMessage = function(args) {
    if (!kpxcCustomLoginFieldsBanner.created) {
        return;
    }

    const message = args?.[2];
    const selection = args?.[3];

    if (message === 'username_selected') {
        kpxcCustomLoginFieldsBanner.selection.username = selection;
        kpxcCustomLoginFieldsBanner.setSelectedField();
    } else if (message === 'password_selected') {
        kpxcCustomLoginFieldsBanner.selection.password = selection;
        kpxcCustomLoginFieldsBanner.setSelectedField();
    } else if (message === 'totp_selected') {
        kpxcCustomLoginFieldsBanner.selection.totp = selection;
        kpxcCustomLoginFieldsBanner.setSelectedField();
    } else if (message === 'string_field_selected') {
        kpxcCustomLoginFieldsBanner.selection.stringFields = selection;
        kpxcCustomLoginFieldsBanner.setSelectedField();
    } else if (message === 'enable_clear_data_button') {
        kpxcCustomLoginFieldsBanner.buttons.clearData.style.display = 'inline-block';
    }
};

// Handle Banner button clicks from the top window
kpxcCustomLoginFieldsBanner.handleParentWindowMessage = function(args) {
    if (!kpxcCustomLoginFieldsBanner.created) {
        return;
    }

    const e = {};
    e.isTrusted = args?.[1];
    const message = args?.[2];

    if (message === 'username_button_clicked') {
        kpxcCustomLoginFieldsBanner.usernameButtonClicked(e);
    } else if (message === 'password_button_clicked') {
        kpxcCustomLoginFieldsBanner.passwordButtonClicked(e);
    } else if (message === 'totp_button_clicked') {
        kpxcCustomLoginFieldsBanner.totpButtonClicked(e);
    } else if (message === 'string_field_button_clicked') {
        kpxcCustomLoginFieldsBanner.stringFieldsButtonClicked(e);
    } else if (message === 'reset_button_clicked') {
        kpxcCustomLoginFieldsBanner.reset();
    } else if (message === 'close_button_clicked') {
        kpxcCustomLoginFieldsBanner.closeButtonClicked(e);
    } else if (message === 'confirm_button_clicked') {
        kpxcCustomLoginFieldsBanner.confirm();
    } else if (message === 'clear_data_button_clicked') {
        kpxcCustomLoginFieldsBanner.clearData();
    }
};

// Sends messages to all iframes. Works only from the top window.
const sendMessageToFrames = async function(e, message) {
    if (window.self === window.top) {
        await sendMessage('frame_message', [ 'frame_request_to_frames', e?.isTrusted, message ]);
    }
};

// Sends message to parent window. Works only from iframes.
const sendMessageToParent = async function(e, message, selection) {
    if (window.self !== window.top) {
        await sendMessage('frame_message', [ 'frame_request_to_parent', e?.isTrusted, message, selection ]);
    }
};

//--------------------------------------------------------------------------
// Helper functions
//--------------------------------------------------------------------------

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

// Checks if an element has a light background, using luminance. Luminance with >= 127 is considered 'light'.
const isLightThemeBackground = function(elem) {
    const inputStyle = getComputedStyle(elem);
    const bgColor = inputStyle.backgroundColor.match(/[\.\d]+/g).map(e => Number(e));
    if (bgColor.length < 3) {
        return false;
    }

    const luminance = 0.299 * bgColor[0] + 0.587 * bgColor[1] + 0.114 * bgColor[2];
    return luminance >= 128;
};

const dataStepToString = function() {
    if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_USERNAME) {
        return tr('username');
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_PASSWORD) {
        return tr('password');
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_TOTP) {
        return tr('totp');
    } else if (kpxcCustomLoginFieldsBanner.dataStep === STEP_SELECT_STRING_FIELDS) {
        return tr('defineStringField');
    }
};
