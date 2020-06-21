'use strict';

const kpxcPasswordIcons = {};
kpxcPasswordIcons.icons = [];

kpxcPasswordIcons.newIcon = function(useIcons, field, inputs, pos, databaseState = DatabaseState.DISCONNECTED) {
    kpxcPasswordIcons.icons.push(new PasswordIcon(useIcons, field, inputs, pos, databaseState));
};

kpxcPasswordIcons.switchIcon = function(state) {
    kpxcPasswordIcons.icons.forEach(u => u.switchIcon(state));
};


class PasswordIcon extends Icon {
    constructor(useIcons, field, inputs, pos, databaseState) {
        super();
        this.useIcons = useIcons;
        this.databaseState = databaseState;

        this.initField(field, inputs, pos);
        kpxcUI.monitorIconPosition(this);
    }
}

PasswordIcon.prototype.initField = function(field, inputs, pos) {
    if (!field || field.readOnly) {
        return;
    }

    if (field.getAttribute('kpxc-password-generator')
        || (field.hasAttribute('kpxc-defined') && field.getAttribute('kpxc-defined') !== 'password')) {
        return;
    }

    field.setAttribute('kpxc-password-generator', true);

    if (this.useIcons) {
        // Observer the visibility
        if (this.observer) {
            this.observer.observe(field);
        }
        this.createIcon(field);
    }

    this.inputField = field;

    let found = false;
    if (inputs) {
        for (let i = pos + 1; i < inputs.length; i++) {
            if (inputs[i] && inputs[i].getLowerCaseAttribute('type') === 'password') {
                field.setAttribute('kpxc-pwgen-next-field-id', inputs[i].getAttribute('data-kpxc-id'));
                field.setAttribute('kpxc-pwgen-next-is-password-field', (i === 0));
                found = true;
                break;
            }
        }
    }

    field.setAttribute('kpxc-pwgen-next-field-exists', found);
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
kpxcPasswordDialog.selected = null;
kpxcPasswordDialog.startPosX = 0;
kpxcPasswordDialog.startPosY = 0;
kpxcPasswordDialog.diffX = 0;
kpxcPasswordDialog.diffY = 0;
kpxcPasswordDialog.dialog = null;
kpxcPasswordDialog.titleBar = null;

kpxcPasswordDialog.removeIcon = function(field) {
    if (field.getAttribute('kpxc-password-generator')) {
        const pwgenIcons = document.querySelectorAll('.kpxc-pwgen-icon');
        for (const i of pwgenIcons) {
            if (i.getAttribute('kpxc-pwgen-field-id') === field.getAttribute('data-kpxc-id')) {
                document.body.removeChild(i);
            }
        }
    }
};

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
        field.removeAttribute('kpxc-password-generator');
        return;
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

        kpxcPasswordDialog.dialog.setAttribute('kpxc-pwgen-field-id', field.getAttribute('data-kpxc-id'));
        kpxcPasswordDialog.dialog.setAttribute('kpxc-pwgen-next-field-id', field.getAttribute('kpxc-pwgen-next-field-id'));
        kpxcPasswordDialog.dialog.setAttribute('kpxc-pwgen-next-is-password-field', field.getAttribute('kpxc-pwgen-next-is-password-field'));
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

    callbackGeneratedPassword(await browser.runtime.sendMessage({
        action: 'generate_password'
    }));
};

kpxcPasswordDialog.copy = function(e) {
    if (!e.isTrusted) {
        return;
    }

    e.preventDefault();
    kpxcPasswordDialog.copyPasswordToClipboard();
};

kpxcPasswordDialog.fill = function(e) {
    if (!e.isTrusted) {
        return;
    }

    e.preventDefault();

    // Use the active input field
    const field = _f(kpxcPasswordDialog.dialog.getAttribute('kpxc-pwgen-field-id'));
    if (field) {
        const password = kpxcPasswordDialog.shadowSelector('.kpxc-pwgen-input');
        if (field.getAttribute('maxlength')) {
            if (password.value.length > field.getAttribute('maxlength')) {
                const message = tr('passwordGeneratorErrorTooLong') + '\r\n'
                                + tr('passwordGeneratorErrorTooLongCut') + '\r\n' + tr('passwordGeneratorErrorTooLongRemember');
                message.style.whiteSpace = 'pre';
                browser.runtime.sendMessage({
                    action: 'show_notification',
                    args: [ message ]
                });
                return;
            }
        }

        field.value = password.value;
        const nextFieldId = field.getAttribute('kpxc-pwgen-next-field-id');
        const nextField = $('input[data-kpxc-id=\'' + nextFieldId + '\']');
        if (nextField) {
            nextField.value = password.value;
        }
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
