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

const DOMRectToArray = function(domRect) {
    return [ domRect.bottom, domRect.height, domRect.left, domRect.right, domRect.top, domRect.width, domRect.x, domRect.y ];
};

/**
* Detects if the input field appears or disappears -> show/hide the icon
* - boundingClientRect with slightly (< -10) negative values -> hidden
* - intersectionRatio === 0 -> hidden
* - isIntersecting === false -> hidden
* - intersectionRatio > 0 -> shown
* - isIntersecting === true -> shown
*/
try {
    kpxcPassword.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const rect = DOMRectToArray(entry.boundingClientRect);

            if ((entry.intersectionRatio === 0 && !entry.isIntersecting) || (rect.some(x => x < -10))) {
                kpxcPassword.icon.style.display = 'none';
            } else if (entry.intersectionRatio > 0 && entry.isIntersecting) {
                kpxcPassword.icon.style.display = 'block';

                // Wait for possible DOM animations
                setTimeout(() => {
                    kpxcPassword.setIconPosition(kpxcPassword.icon, entry.target);
                }, 500);
            }
        }
    });
} catch (err) {
    console.log(err);
}

kpxcPassword.init = function() {
    if ('initPasswordGenerator' in _called) {
        return;
    }

    _called.initPasswordGenerator = true;
};

kpxcPassword.initField = function(field, inputs, pos) {
    if (!field) {
        return;
    }

    // Observer the visibility
    if (kpxcPassword.observer) {
        kpxcPassword.observer.observe(field);
    }

    if (field.getAttribute('kpxc-password-generator')) {
        return;
    }

    field.setAttribute('kpxc-password-generator', true);

    kpxcPassword.createIcon(field);
    kpxcPassword.inputField = field;

    let found = false;
    if (inputs) {
        for (let i = pos + 1; i < inputs.length; i++) {
            if (inputs[i] && inputs[i].getAttribute('type') && inputs[i].getAttribute('type').toLowerCase() === 'password') {
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
    icon.style.zIndex = '9999';
    icon.style.width = String(size) + 'px';
    icon.style.height = String(size) + 'px';

    icon.addEventListener('click', function(e) {
        e.preventDefault();
        kpxcPassword.showDialog(field, icon);
    });

    kpxcPassword.setIconPosition(icon, field);
    kpxcPassword.icon = icon;
    document.body.appendChild(icon);
};

kpxcPassword.setIconPosition = function(icon, field) {
    const rect = field.getBoundingClientRect();
    const offset = Number(icon.getAttribute('offset'));
    const size = Number(icon.getAttribute('size'));

    icon.style.top = String((rect.top + document.scrollingElement.scrollTop) + offset + 1) + 'px';
    icon.style.left = String((rect.left + document.scrollingElement.scrollLeft) + field.offsetWidth - size - offset) + 'px';
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
        kpxcPassword.openDialog();
    });
    titleBar.append(closeButton);

    const passwordRow = kpxcUI.createElement('div', 'kpxc-pwgen-password-row');
    const input = kpxcUI.createElement('input', 'kpxc-pwgen-input', { 'placeholder': tr('passwordGeneratorPlaceholder'), 'type': 'text', 'tabindex': '-1' });
    const inputLabel = kpxcUI.createElement('label', 'kpxc-pwgen-bits', {}, tr('passwordGeneratorBits', '???'));
    passwordRow.appendMultiple(input, inputLabel);

    const nextFillRow = kpxcUI.createElement('div', 'kpxc-pwgen-nextfill-row');
    const checkbox = kpxcUI.createElement('input', 'kpxc-pwgen-checkbox', { 'id': 'kpxc-pwgen-checkbox', 'type': 'checkbox' });
    const checkboxLabel = kpxcUI.createElement('label', 'kpxc-pwgen-checkbox-label', { 'for': 'kpxc-pwgen-checkbox' }, tr('passwordGeneratorLabel'));
    nextFillRow.appendMultiple(checkbox, checkboxLabel);

    // Buttons
    const buttonsRow = kpxcUI.createElement('div', 'kpxc-pwgen-buttons');
    const generateButton = kpxcUI.createElement('button', 'kpxc-button kpxc-white-button', { 'id': 'kpxc-pwgen-btn-generate' }, tr('passwordGeneratorGenerate'));
    const copyButton = kpxcUI.createElement('button', 'kpxc-button', { 'id': 'kpxc-pwgen-btn-copy' }, tr('passwordGeneratorCopy'));
    const fillButton = kpxcUI.createElement('button', 'kpxc-button', { 'id': 'kpxc-pwgen-btn-fill' }, tr('passwordGeneratorFillAndCopy'));

    generateButton.addEventListener('click', function(e) {
        kpxcPassword.generate(e);
    });

    copyButton.addEventListener('click', function(e) {
        kpxcPassword.copy(e);
    });

    fillButton.addEventListener('click', function(e) {
        kpxcPassword.fill(e);
    });

    buttonsRow.appendMultiple(generateButton, copyButton, fillButton);
    dialog.appendMultiple(titleBar, passwordRow, nextFillRow, buttonsRow);
    wrapper.append(dialog);

    const icon = $('.kpxc-pwgen-icon');
    dialog.style.top = String(icon.offsetTop + icon.offsetHeight) + 'px';
    dialog.style.left = icon.style.left;

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
    kpxcPassword.showDialog(kpxcPassword.inputField, kpxcPassword.icon);
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
        kpxcPassword.dialog.style.top = String(icon.offsetTop + icon.offsetHeight) + 'px';
        kpxcPassword.dialog.style.left = icon.style.left;

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

kpxcPassword.generate = function(e) {
    if (e) {
        e.preventDefault();
    }

    browser.runtime.sendMessage({
        action: 'generate_password'
    }).then(kpxcPassword.callbackGeneratedPassword).catch((err) => {
        console.log(err);
    });
};

kpxcPassword.copy = function(e) {
    e.preventDefault();
    if (kpxcPassword.copyPasswordToClipboard()) {
        kpxcPassword.greenButton('#kpxc-pwgen-btn-copy');
        kpxcPassword.whiteButton('#kpxc-pwgen-btn-fill');
    }
};

kpxcPassword.fill = function(e) {
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
        if ($('.kpxc-pwgen-checkbox').checked) {
            if (field.getAttribute('kpxc-pwgen-next-field-id')) {
                const nextFieldId = field.getAttribute('kpxc-pwgen-next-field-id');
                const nextField = $('input[data-kpxc-id=\'' + nextFieldId + '\']');
                if (nextField) {
                    nextField.value = password.value;
                }
            }
        }

        if (kpxcPassword.copyPasswordToClipboard()) {
            kpxcPassword.greenButton('#kpxc-pwgen-btn-fill');
            kpxcPassword.whiteButton('#kpxc-pwgen-btn-copy');
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

kpxcPassword.callbackGeneratedPassword = function(entries) {
    if (entries && entries.length >= 1) {
        const errorMessage = $('#kpxc-pwgen-error');
        if (errorMessage) {
            kpxcPassword.enableButtons();

            $('.kpxc-pwgen-checkbox').parentElement.style.display = 'block';
            $('.kpxc-pwgen-bits').style.display = 'block';

            const input = $('.kpxc-pwgen-input');
            input.style.display = 'block';
            errorMessage.remove();
        }

        kpxcPassword.whiteButton('#kpxc-pwgen-btn-fill');
        kpxcPassword.whiteButton('#kpxc-pwgen-btn-copy');
        $('.kpxc-pwgen-input').value = entries[0].password;
        if (entries[0].entropy) {
            $('.kpxc-pwgen-bits').textContent = tr('passwordGeneratorBits', (Number.isNaN(entries[0].entropy) ? '???' : String(entries[0].entropy.toFixed(2))));
        } else {
            $('.kpxc-pwgen-bits').textContent = tr('passwordGeneratorBits', (isNaN(entries[0].login) ? '???' : entries[0].login));
        }
    } else {
        if (document.querySelectorAll('div#kpxc-pwgen-error').length === 0) {
            $('.kpxc-pwgen-checkbox').parentElement.style.display = 'none';
            $('.kpxc-pwgen-bits').style.display = 'none';

            const input = $('.kpxc-pwgen-input');
            input.style.display = 'none';

            const errorMessage = kpxcUI.createElement('div', '', { 'id': 'kpxc-pwgen-error' },
                tr('passwordGeneratorError') + '\r\n' + tr('passwordGeneratorErrorIsRunning'));
            errorMessage.style.whiteSpace = 'pre';
            input.parentElement.append(errorMessage);

            kpxcPassword.disableButtons();
        }
    }
};

kpxcPassword.onRequestPassword = function() {
    browser.runtime.sendMessage({
        action: 'generate_password'
    }).then(kpxcPassword.callbackGeneratedPassword);
};

kpxcPassword.greenButton = function(button) {
    $(button).classList.remove('kpxc-white-button');
    $(button).classList.add('kpxc-green-button');
};

kpxcPassword.whiteButton = function(button) {
    $(button).classList.remove('kpxc-green-button');
    $(button).classList.add('kpxc-white-button');
};

kpxcPassword.enableButtons = function() {
    $('#kpxc-pwgen-btn-generate').textContent = tr('passwordGeneratorGenerate');
    $('#kpxc-pwgen-btn-copy').style.display = 'inline-block';
    $('#kpxc-pwgen-btn-fill').style.display = 'inline-block';
};

kpxcPassword.disableButtons = function() {
    $('#kpxc-pwgen-btn-generate').textContent = tr('passwordGeneratorTryAgain');
    $('#kpxc-pwgen-btn-copy').style.display = 'none';
    $('#kpxc-pwgen-btn-fill').style.display = 'none';
};

// Handle icon position on window resize
window.addEventListener('resize', function(e) {
    if (kpxcPassword.inputField && kpxcPassword.icon) {
        kpxcPassword.setIconPosition(kpxcPassword.icon, kpxcPassword.inputField);
    }
});

// Handle icon position on scroll
window.addEventListener('scroll', function(e) {
    if (kpxcPassword.inputField && kpxcPassword.icon) {
        kpxcPassword.setIconPosition(kpxcPassword.icon, kpxcPassword.inputField);
    }
});

// Closes the dialog when clicked outside of it)
document.addEventListener('click', function(e) {
    if (kpxcPassword.dialog && kpxcPassword.dialog.style.display === 'block') {
        const dialogEndX = kpxcPassword.dialog.offsetLeft + kpxcPassword.dialog.offsetWidth;
        const dialogEndY = kpxcPassword.dialog.offsetTop + kpxcPassword.dialog.offsetHeight;

        if ((e.clientX < kpxcPassword.dialog.offsetLeft || e.clientX > dialogEndX) ||
            (e.clientY < kpxcPassword.dialog.offsetTop || e.clientY > dialogEndY) &&
            !e.target.classList.contains('kpxc-pwgen-icon')) {
            kpxcPassword.openDialog();
        }
    }
});
