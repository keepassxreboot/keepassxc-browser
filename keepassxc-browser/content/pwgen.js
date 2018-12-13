'use strict';

var kpxcPassword = {};
kpxcPassword.created = false;
kpxcPassword.icon = null;
kpxcPassword.inputField = null;
kpxcPassword.selected = null;
kpxcPassword.startPosX = 0;
kpxcPassword.startPosY = 0;
kpxcPassword.diffX = 0;
kpxcPassword.diffY = 0;
kpxcPassword.dialog = null;
kpxcPassword.titleBar = null;
kpxcPassword.useIcons = false;

try {
    kpxcPassword.observer = new IntersectionObserver((entries) => {
        kpxcUI.updateFromIntersectionObserver(kpxcPassword, entries);
    });
} catch (err) {
    console.log(err);
}

kpxcPassword.init = function(useIcons) {
    kpxcPassword.useIcons = useIcons;
    if ('initPasswordGenerator' in _called) {
        return;
    }

    _called.initPasswordGenerator = true;
};

kpxcPassword.initField = function(field, inputs, pos) {
    if (!field) {
        return;
    }

    if (field.getAttribute('kpxc-password-generator')) {
        return;
    }

    field.setAttribute('kpxc-password-generator', true);

    if (kpxcPassword.useIcons) {
        // Observer the visibility
        if (kpxcPassword.observer) {
            kpxcPassword.observer.observe(field);
        }
        kpxcPassword.createIcon(field);
    }

    kpxcPassword.inputField = field;

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

kpxcPassword.createIcon = function(field) {
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
        kpxcPassword.showDialog(field, icon);
    });

    kpxcUI.setIconPosition(icon, field);
    kpxcPassword.icon = icon;
    document.body.appendChild(icon);
};

kpxcPassword.removeIcon = function(field) {
    if (field.getAttribute('kpxc-password-generator')) {
        const pwgenIcons = document.querySelectorAll('.kpxc-pwgen-icon');
        for (const i of pwgenIcons) {
            if (i.getAttribute('kpxc-pwgen-field-id') === field.getAttribute('data-kpxc-id')) {
                document.body.removeChild(i);
            }
        }
    }
};

kpxcPassword.createDialog = function() {
    if (kpxcPassword.created) {
        // If database is open again, generate a new password right away
        const input = $('.kpxc-pwgen-input');
        if (input.style.display === 'none') {
            kpxcPassword.generate();
        }
        return;
    }
    kpxcPassword.created = true;

    const wrapper = kpxcUI.createElement('div', 'kpxc');
    const dialog = kpxcUI.createElement('div', 'kpxc kpxc-pwgen-dialog');
    const titleBar = kpxcUI.createElement('div', 'kpxc-pwgen-titlebar', {}, tr('passwordGeneratorTitle'));
    const closeButton = kpxcUI.createElement('div', 'kpxc-pwgen-close', {}, '×');
    closeButton.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }

        kpxcPassword.openDialog();
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
        kpxcPassword.generate(e);
    });

    fillButton.addEventListener('click', function(e) {
        kpxcPassword.fill(e);
        kpxcPassword.openDialog();
    });

    copyButton.addEventListener('click', function(e) {
        kpxcPassword.copy(e);
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

    kpxcPassword.dialog = dialog;
    kpxcPassword.titleBar = titleBar;
    kpxcPassword.titleBar.addEventListener('mousedown', function(e) {
        kpxcPassword.mouseDown(e);
    });

    kpxcPassword.generate();
};

kpxcPassword.mouseDown = function(e) {
    kpxcPassword.selected = kpxcPassword.titleBar;
    kpxcPassword.startPosX = e.clientX;
    kpxcPassword.startPosY = e.clientY;
    kpxcPassword.diffX = kpxcPassword.startPosX - kpxcPassword.dialog.offsetLeft;
    kpxcPassword.diffY = kpxcPassword.startPosY - kpxcPassword.dialog.offsetTop;
    return false;
};

kpxcPassword.openDialog = function() {
    if (kpxcPassword.dialog.style.display === '' || kpxcPassword.dialog.style.display === 'none') {
        kpxcPassword.dialog.style.display = 'block';
    } else {
        kpxcPassword.dialog.style.display = 'none';
    }
};

kpxcPassword.trigger = function() {
    kpxcPassword.showDialog(kpxcPassword.inputField || document.activeElement, kpxcPassword.icon);
};

kpxcPassword.showDialog = function(field, icon) {
    if (!kpxcFields.isVisible(field)) {
        document.body.removeChild(icon);
        field.removeAttribute('kpxc-password-generator');
        return;
    }

    kpxcPassword.createDialog();
    kpxcPassword.openDialog();

    // Adjust the dialog location
    if (kpxcPassword.dialog) {
        if (icon) {
            kpxcPassword.dialog.style.top = Pixels(icon.offsetTop + icon.offsetHeight);
            kpxcPassword.dialog.style.left = icon.style.left;
        } else {
            const rect = document.activeElement.getBoundingClientRect();
            kpxcPassword.dialog.style.top = Pixels(rect.top + rect.height);
            kpxcPassword.dialog.style.left = Pixels(rect.left);
        }

        kpxcPassword.dialog.setAttribute('kpxc-pwgen-field-id', field.getAttribute('data-kpxc-id'));
        kpxcPassword.dialog.setAttribute('kpxc-pwgen-next-field-id', field.getAttribute('kpxc-pwgen-next-field-id'));
        kpxcPassword.dialog.setAttribute('kpxc-pwgen-next-is-password-field', field.getAttribute('kpxc-pwgen-next-is-password-field'));

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

kpxcPassword.generate = async function(e) {
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

kpxcPassword.copy = function(e) {
    if (!e.isTrusted) {
        return;
    }

    e.preventDefault();
    kpxcPassword.copyPasswordToClipboard();
};

kpxcPassword.fill = function(e) {
    if (!e.isTrusted) {
        return;
    }

    e.preventDefault();

    // Use the active input field
    const field = _f(kpxcPassword.dialog.getAttribute('kpxc-pwgen-field-id'));
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

kpxcPassword.copyPasswordToClipboard = function() {
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

// Handle icon position on window resize
window.addEventListener('resize', function(e) {
    kpxcUI.updateIconPosition(kpxcPassword);
});

// Handle icon position on scroll
window.addEventListener('scroll', function(e) {
    kpxcUI.updateIconPosition(kpxcPassword);
});
