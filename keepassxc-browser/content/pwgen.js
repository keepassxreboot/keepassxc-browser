'use strict';

const kpxcPasswordIcons = {};
kpxcPasswordIcons.icons = [];

kpxcPasswordIcons.newIcon = function(field, databaseClosed = true) {
    kpxcPasswordIcons.icons.push(new PasswordIcon(field, databaseClosed));
};


class PasswordIcon extends Icon {
    constructor(useIcons, field, inputs, pos) {
        super();
        this.useIcons = useIcons;

        this.initField(field, inputs, pos);
        kpxcUI.monitorIconPosition(this);
    }
};

PasswordIcon.prototype.initField = function(field, inputs, pos) {
    if (!field) {
        return;
    }

    if (field.getAttribute('kpxc-password-generator')) {
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
    let offset = Math.floor((field.offsetHeight - size) / 3);
    offset = (offset < 0) ? 0 : offset;

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

    icon.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }

        e.preventDefault();
        kpxcPasswordDialog.showDialog(field, icon);
    });

    kpxcUI.setIconPosition(icon, field);
    this.icon = icon;
    document.body.appendChild(icon);
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
        const input = $('.kpxc-pwgen-input');
        if (input.style.display === 'none') {
            kpxcPasswordDialog.generate();
        }
        return;
    }
    kpxcPasswordDialog.created = true;

    const wrapper = kpxcUI.createElement('div', 'kpxc');
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
    wrapper.append(dialog);

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

        const fieldExists = Boolean(field.getAttribute('kpxc-pwgen-next-field-exists'));
        const checkbox = $('.kpxc-pwgen-checkbox');
        if (checkbox) {
            checkbox.setAttribute('checked', fieldExists);
            if (fieldExists) {
                checkbox.removeAttribute('disabled');
            } else {
                checkbox.setAttribute('disabled', '');
            }
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
        const password = $('.kpxc-pwgen-input');
        if (field.getAttribute('maxlength')) {
            if (password.value.length > field.getAttribute('maxlength')) {
                const message = tr('passwordGeneratorErrorTooLong') + '\r\n' +
                    tr('passwordGeneratorErrorTooLongCut') + '\r\n' + tr('passwordGeneratorErrorTooLongRemember');
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
    $('.kpxc-pwgen-input').select();
    try {
        return document.execCommand('copy');
    } catch (err) {
        console.log('Could not copy password to clipboard: ' + err);
    }
    return false;
};

const callbackGeneratedPassword = function(entries) {
    if (entries && entries.length >= 1) {
        const errorMessage = $('#kpxc-pwgen-error');
        if (errorMessage) {
            enableButtons();

            const input = $('.kpxc-pwgen-input');
            input.style.display = 'block';
            errorMessage.remove();
        }

        $('.kpxc-pwgen-input').value = entries[0].password;
    } else {
        if (document.querySelectorAll('div#kpxc-pwgen-error').length === 0) {
            const input = $('.kpxc-pwgen-input');
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
    $('#kpxc-pwgen-btn-generate').textContent = tr('passwordGeneratorGenerate');
    $('#kpxc-pwgen-btn-copy').style.display = 'inline-block';
    $('#kpxc-pwgen-btn-fill').style.display = 'inline-block';
};

const disableButtons = function() {
    $('#kpxc-pwgen-btn-generate').textContent = tr('passwordGeneratorTryAgain');
    $('#kpxc-pwgen-btn-copy').style.display = 'none';
    $('#kpxc-pwgen-btn-fill').style.display = 'none';
};
