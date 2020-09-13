'use strict';

const kpxcPasswordIcons = {};
kpxcPasswordIcons.icons = [];

kpxcPasswordIcons.newIcon = function(field, databaseState = DatabaseState.DISCONNECTED) {
    kpxcPasswordIcons.icons.push(new PasswordIcon(field, databaseState));
};

kpxcPasswordIcons.switchIcon = function(state) {
    kpxcPasswordIcons.icons.forEach(u => u.switchIcon(state));
};

kpxcPasswordIcons.deleteHiddenIcons = function() {
    kpxcUI.deleteHiddenIcons(kpxcPasswordIcons.icons, 'kpxc-password-field');
};

kpxcPasswordIcons.isValid = function(field) {
    if (!field
        || field.readOnly
        || field.offsetWidth < MINIMUM_INPUT_FIELD_WIDTH
        || kpxcIcons.hasIcon(field)
        || !kpxcFields.isVisible(field)) {
        return false;
    }

    return true;
};


class PasswordIcon extends Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED) {
        super();
        this.databaseState = databaseState;
        this.nextFieldExists = false;

        this.initField(field);
        kpxcUI.monitorIconPosition(this);
    }
}

PasswordIcon.prototype.initField = function(field) {
    // Observer the visibility
    if (this.observer) {
        this.observer.observe(field);
    }

    this.createIcon(field);
    this.inputField = field;
};

PasswordIcon.prototype.createIcon = function(field) {
    const className = (isFirefox() ? 'key-moz' : 'key');
    const size = (field.offsetHeight > 28) ? 24 : 16;
    const offset = kpxcUI.calculateIconOffset(field, size);

    const icon = kpxcUI.createElement('div', 'kpxc kpxc-pwgen-icon ' + className,
        {
            'title': tr('passwordGeneratorGenerateText'),
            'alt': tr('passwordGeneratorIcon'),
            'size': size,
            'offset': offset,
            'kpxc-pwgen-field-id': field.getAttribute('data-kpxc-id')
        });

    icon.style.zIndex = '10000000';
    icon.style.width = Pixels(size);
    icon.style.height = Pixels(size);

    if (this.databaseState === DatabaseState.DISCONNECTED || this.databaseState === DatabaseState.LOCKED) {
        icon.style.filter = 'saturate(0%)';
    }

    icon.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }

        e.preventDefault();
        kpxcPasswordDialog.showDialog(field, icon);
    });

    kpxcUI.setIconPosition(icon, field);
    this.icon = icon;

    const styleSheet = document.createElement('link');
    styleSheet.setAttribute('rel', 'stylesheet');
    styleSheet.setAttribute('href', browser.runtime.getURL('css/pwgen.css'));

    const wrapper = document.createElement('div');
    this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    this.shadowRoot.append(styleSheet);
    this.shadowRoot.append(icon);
    document.body.append(wrapper);
};


const kpxcPasswordDialog = {};
kpxcPasswordDialog.created = false;
kpxcPasswordDialog.icon = null;
kpxcPasswordDialog.input = null;
kpxcPasswordDialog.nextField = null;
kpxcPasswordDialog.selected = null;
kpxcPasswordDialog.startPosX = 0;
kpxcPasswordDialog.startPosY = 0;
kpxcPasswordDialog.diffX = 0;
kpxcPasswordDialog.diffY = 0;
kpxcPasswordDialog.dialog = null;
kpxcPasswordDialog.titleBar = null;

kpxcPasswordDialog.createDialog = function() {
    if (kpxcPasswordDialog.created) {
        // If database is open again, generate a new password right away
        const input = kpxcPasswordDialog.shadowSelector('.kpxc-pwgen-input');
        if (input.style.display === 'none') {
            kpxcPasswordDialog.generate();
        }
        return;
    }
    kpxcPasswordDialog.created = true;

    const wrapper = kpxcUI.createElement('div');
    kpxcPasswordDialog.shadowRoot = wrapper.attachShadow({ mode: 'closed' });

    const dialog = kpxcUI.createElement('div', 'kpxc kpxc-pwgen-dialog');
    const titleBar = kpxcUI.createElement('div', 'kpxc-pwgen-titlebar', {}, tr('passwordGeneratorTitle'));
    const closeButton = kpxcUI.createElement('div', 'kpxc-pwgen-close', {}, '×');
    closeButton.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }

        kpxcPasswordDialog.openDialog();
    });
    titleBar.append(closeButton);

    const passwordRow = kpxcUI.createElement('div', 'kpxc-pwgen-password-row');
    const input = kpxcUI.createElement('input', 'kpxc-pwgen-input', { 'placeholder': tr('passwordGeneratorPlaceholder'), 'type': 'text', 'tabindex': '-1' });
    passwordRow.appendMultiple(input);

    // Buttons
    const buttonsRow = kpxcUI.createElement('div', 'kpxc-pwgen-buttons');
    const generateButton = kpxcUI.createElement('button', 'kpxc-button kpxc-orange-button', { 'id': 'kpxc-pwgen-btn-generate' }, tr('passwordGeneratorGenerate'));
    const copyButton = kpxcUI.createElement('button', 'kpxc-button kpxc-orange-button', { 'id': 'kpxc-pwgen-btn-copy' }, tr('passwordGeneratorCopy'));
    const fillButton = kpxcUI.createElement('button', 'kpxc-button kpxc-green-button', { 'id': 'kpxc-pwgen-btn-fill' }, tr('passwordGeneratorFill'));

    generateButton.addEventListener('click', function(e) {
        kpxcPasswordDialog.generate(e);
    });

    fillButton.addEventListener('click', function(e) {
        kpxcPasswordDialog.fill(e);
        kpxcPasswordDialog.openDialog();
    });

    copyButton.addEventListener('click', function(e) {
        kpxcPasswordDialog.copy(e);
    });

    buttonsRow.appendMultiple(generateButton, copyButton, fillButton);
    dialog.appendMultiple(titleBar, passwordRow, buttonsRow);

    const styleSheet = createStylesheet('css/pwgen.css');
    const buttonStyle = createStylesheet('css/button.css');
    const colorStyleSheet = createStylesheet('css/colors.css');

    kpxcPasswordDialog.shadowRoot.append(colorStyleSheet);
    kpxcPasswordDialog.shadowRoot.append(styleSheet);
    kpxcPasswordDialog.shadowRoot.append(buttonStyle);
    kpxcPasswordDialog.shadowRoot.append(dialog);

    const icon = $('.kpxc-pwgen-icon');
    if (icon) {
        dialog.style.top = Pixels(icon.offsetTop + icon.offsetHeight);
        dialog.style.left = icon.style.left;
    } else {
        const rect = document.activeElement.getBoundingClientRect();
        dialog.style.top = Pixels(rect.top + rect.height);
        dialog.style.left = Pixels(rect.left);
    }

    document.body.append(wrapper);

    kpxcPasswordDialog.dialog = dialog;
    kpxcPasswordDialog.titleBar = titleBar;
    kpxcPasswordDialog.titleBar.addEventListener('mousedown', function(e) {
        kpxcPasswordDialog.mouseDown(e);
    });

    kpxcPasswordDialog.generate();
};

kpxcPasswordDialog.mouseDown = function(e) {
    kpxcPasswordDialog.selected = kpxcPasswordDialog.titleBar;
    kpxcPasswordDialog.startPosX = e.clientX;
    kpxcPasswordDialog.startPosY = e.clientY;
    kpxcPasswordDialog.diffX = kpxcPasswordDialog.startPosX - kpxcPasswordDialog.dialog.offsetLeft;
    kpxcPasswordDialog.diffY = kpxcPasswordDialog.startPosY - kpxcPasswordDialog.dialog.offsetTop;
    return false;
};

kpxcPasswordDialog.openDialog = function() {
    if (kpxcPasswordDialog.dialog.style.display === '' || kpxcPasswordDialog.dialog.style.display === 'none') {
        kpxcPasswordDialog.dialog.style.display = 'block';
    } else {
        kpxcPasswordDialog.dialog.style.display = 'none';
    }
};

kpxcPasswordDialog.trigger = function() {
    kpxcPasswordDialog.showDialog(document.activeElement, kpxcPasswordDialog.icon);
};

kpxcPasswordDialog.showDialog = function(field, icon) {
    if (!kpxcFields.isVisible(field)) {
        document.body.removeChild(icon);
        field.removeAttribute('kpxc-password-field');
        return;
    }

    kpxcPasswordDialog.input = field;

    // Save next password field if found
    if (kpxc.inputs.length > 0) {
        const index = kpxc.inputs.indexOf(field);
        const nextField = kpxc.inputs[index + 1];
        kpxcPasswordDialog.nextField = (nextField && nextField.getLowerCaseAttribute('type') === 'password') ? nextField : undefined;
    }

    kpxcPasswordDialog.createDialog();
    initColorTheme(kpxcPasswordDialog.dialog);
    kpxcPasswordDialog.openDialog();

    // Adjust the dialog location
    if (kpxcPasswordDialog.dialog) {
        if (icon) {
            kpxcPasswordDialog.dialog.style.top = Pixels(icon.offsetTop + icon.offsetHeight);
            kpxcPasswordDialog.dialog.style.left = icon.style.left;
        } else {
            const rect = document.activeElement.getBoundingClientRect();
            kpxcPasswordDialog.dialog.style.top = Pixels(rect.top + rect.height);
            kpxcPasswordDialog.dialog.style.left = Pixels(rect.left);
        }
    }
};

kpxcPasswordDialog.generate = async function(e) {
    // This function can be also called from non-events
    if (e) {
        if (!e.isTrusted) {
            return;
        }
        e.preventDefault();
    }

    callbackGeneratedPassword(await sendMessage('generate_password'));
};

kpxcPasswordDialog.copy = function(e) {
    if (!e.isTrusted) {
        return;
    }

    e.preventDefault();
    kpxcPasswordDialog.copyPasswordToClipboard();
};

kpxcPasswordDialog.fill = function(e) {
    if (!e.isTrusted || !kpxcPasswordDialog.input) {
        return;
    }

    e.preventDefault();

    const password = kpxcPasswordDialog.shadowSelector('.kpxc-pwgen-input');
    if (kpxcPasswordDialog.input.getAttribute('maxlength')) {
        if (password.value.length > kpxcPasswordDialog.input.getAttribute('maxlength')) {
            const message = tr('passwordGeneratorErrorTooLong') + '\r\n'
                            + tr('passwordGeneratorErrorTooLongCut') + '\r\n' + tr('passwordGeneratorErrorTooLongRemember');
            message.style.whiteSpace = 'pre';
            sendMessage('show_notification', [ message ]);
            return;
        }
    }

    kpxcPasswordDialog.input.value = password.value;

    if (kpxcPasswordDialog.nextField) {
        kpxcPasswordDialog.nextField.value = password.value;
    }
};

kpxcPasswordDialog.copyPasswordToClipboard = function() {
    kpxcPasswordDialog.shadowSelector('.kpxc-pwgen-input').select();
    try {
        return document.execCommand('copy');
    } catch (err) {
        console.log('Could not copy password to clipboard: ' + err);
    }
    return false;
};

const callbackGeneratedPassword = function(entries) {
    if (entries && entries.length >= 1) {
        const errorMessage = kpxcPasswordDialog.shadowSelector('#kpxc-pwgen-error');
        if (errorMessage) {
            enableButtons();

            const input = kpxcPasswordDialog.shadowSelector('.kpxc-pwgen-input');
            input.style.display = 'block';
            errorMessage.remove();
        }

        kpxcPasswordDialog.shadowSelector('.kpxc-pwgen-input').value = entries[0].password;
    } else {
        if (kpxcPasswordDialog.shadowSelectorAll('div#kpxc-pwgen-error').length === 0) {
            const input = kpxcPasswordDialog.shadowSelector('.kpxc-pwgen-input');
            input.style.display = 'none';

            const errorMessage = kpxcUI.createElement('div', '', { 'id': 'kpxc-pwgen-error' },
                tr('passwordGeneratorError') + '\r\n' + tr('passwordGeneratorErrorIsRunning'));
            errorMessage.style.whiteSpace = 'pre';
            input.parentElement.append(errorMessage);

            disableButtons();
        }
    }
};

const enableButtons = function() {
    kpxcPasswordDialog.shadowSelector('#kpxc-pwgen-btn-generate').textContent = tr('passwordGeneratorGenerate');
    kpxcPasswordDialog.shadowSelector('#kpxc-pwgen-btn-copy').style.display = 'inline-block';
    kpxcPasswordDialog.shadowSelector('#kpxc-pwgen-btn-fill').style.display = 'inline-block';
};

const disableButtons = function() {
    kpxcPasswordDialog.shadowSelector('#kpxc-pwgen-btn-generate').textContent = tr('passwordGeneratorTryAgain');
    kpxcPasswordDialog.shadowSelector('#kpxc-pwgen-btn-copy').style.display = 'none';
    kpxcPasswordDialog.shadowSelector('#kpxc-pwgen-btn-fill').style.display = 'none';
};
