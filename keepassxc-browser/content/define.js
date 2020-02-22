'use strict';

var kpxcDefine = {};

kpxcDefine.selection = {
    username: null,
    password: null,
    fields: []
};
kpxcDefine.eventFieldClick = null;
kpxcDefine.dialog = null;
kpxcDefine.startPosX = 0;
kpxcDefine.startPosY = 0;
kpxcDefine.diffX = 0;
kpxcDefine.diffY = 0;
kpxcDefine.keyDown = null;

kpxcDefine.init = function() {
    const backdrop = kpxcUI.createElement('div', 'kpxcDefine-modal-backdrop', { 'id': 'kpxcDefine-backdrop' });
    const chooser = kpxcUI.createElement('div', '', { 'id': 'kpxcDefine-fields' });
    const description = kpxcUI.createElement('div', '', { 'id': 'kpxcDefine-description' });

    backdrop.append(description);
    document.body.append(backdrop);
    document.body.append(chooser);

    kpxcFields.getAllFields();
    kpxcFields.prepareVisibleFieldsWithID('select');

    kpxcDefine.initDescription();
    kpxcDefine.resetSelection();
    kpxcDefine.prepareStep1();
    kpxcDefine.markAllUsernameFields('#kpxcDefine-fields');

    kpxcDefine.dialog = $('#kpxcDefine-description');
    kpxcDefine.dialog.onmousedown = function(e) {
        kpxcDefine.mouseDown(e);
    };

    document.addEventListener('keydown', kpxcDefine.keyDown);
};

kpxcDefine.close = function() {
    $('#kpxcDefine-backdrop').remove();
    $('#kpxcDefine-fields').remove();
    document.removeEventListener('keydown', kpxcDefine.keyDown);
};

kpxcDefine.mouseDown = function(e) {
    kpxcDefine.selected = kpxcDefine.dialog;
    kpxcDefine.startPosX = e.clientX;
    kpxcDefine.startPosY = e.clientY;
    kpxcDefine.diffX = kpxcDefine.startPosX - kpxcDefine.dialog.offsetLeft;
    kpxcDefine.diffY = kpxcDefine.startPosY - kpxcDefine.dialog.offsetTop;
    return false;
};

kpxcDefine.initDescription = function() {
    const description = $('#kpxcDefine-description');
    const h1 = kpxcUI.createElement('div', '', { 'id': 'kpxcDefine-chooser-headline' });
    const help = kpxcUI.createElement('div', 'kpxcDefine-chooser-help', { 'id': 'kpxcDefine-help' });

    // Show keyboard shortcuts help text
    const keyboardHelp = kpxcUI.createElement('div', 'kpxcDefine-keyboardHelp', {}, `${tr('optionsKeyboardShortcutsHeader')}:`);
    keyboardHelp.style.marginBottom = '5px';
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'Escape'), ' ' + tr('defineDismiss'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'S'), ' ' + tr('defineSkip'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'A'), ' ' + tr('defineAgain'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'C'), ' ' + tr('defineConfirm'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'M'), ' ' + tr('defineMore'));
    keyboardHelp.appendMultiple(document.createElement('br'), kpxcUI.createElement('kbd', '', {}, 'D'), ' ' + tr('defineDiscard'));

    description.appendMultiple(h1, help, keyboardHelp);

    const buttonDismiss = kpxcUI.createElement('button', 'kpxc-button kpxc-red-button', { 'id': 'kpxcDefine-btn-dismiss' }, tr('defineDismiss'));
    buttonDismiss.addEventListener('click', kpxcDefine.close);

    const buttonSkip = kpxcUI.createElement('button', 'kpxc-button kpxc-orange-button', { 'id': 'kpxcDefine-btn-skip' }, tr('defineSkip'));
    buttonSkip.style.marginRight = '5px';
    buttonSkip.addEventListener('click', kpxcDefine.skip);

    const buttonMore = kpxcUI.createElement('button', 'kpxc-button kpxc-orange-button', { 'id': 'kpxcDefine-btn-more' }, tr('defineMore'));
    buttonMore.style.marginRight = '5px';
    buttonMore.style.marginLeft = '5px';
    buttonMore.addEventListener('click', kpxcDefine.more);

    const buttonAgain = kpxcUI.createElement('button', 'kpxc-button kpxc-blue-button', { 'id': 'kpxcDefine-btn-again' }, tr('defineAgain'));
    buttonAgain.style.marginRight = '5px';
    buttonAgain.addEventListener('click', kpxcDefine.again);

    const buttonConfirm = kpxcUI.createElement('button', 'kpxc-button kpxc-green-button', { 'id': 'kpxcDefine-btn-confirm' }, tr('defineConfirm'));
    buttonConfirm.style.marginRight = '15px';
    buttonConfirm.style.display = 'none';
    buttonConfirm.addEventListener('click', kpxcDefine.confirm);

    description.appendMultiple(buttonConfirm, buttonSkip, buttonMore, buttonAgain, buttonDismiss);

    const location = kpxc.getDocumentLocation();
    if (kpxc.settings['defined-custom-fields'] && kpxc.settings['defined-custom-fields'][location]) {
        const div = kpxcUI.createElement('div', 'alreadySelected', {});
        const defineDiscard = kpxcUI.createElement('p', '', {}, tr('defineAlreadySelected'));
        const buttonDiscard = kpxcUI.createElement('button', 'kpxc-button kpxc-red-button', { 'id': 'kpxcDefine-btn-discard' }, tr('defineDiscard'));
        buttonDiscard.style.marginTop = '5px';
        buttonDiscard.addEventListener('click', kpxcDefine.discard);

        div.appendMultiple(defineDiscard, buttonDiscard);
        description.append(div);
    }
};

kpxcDefine.resetSelection = function() {
    kpxcDefine.selection = {
        username: null,
        password: null,
        fields: []
    };

    const fields = $('#kpxcDefine-fields');
    if (fields) {
        fields.textContent = '';
    }
};

kpxcDefine.isFieldSelected = function(kpxcId) {
    if (kpxcId) {
        return (
            kpxcId === kpxcDefine.selection.username
            || kpxcId === kpxcDefine.selection.password
            || kpxcId in kpxcDefine.selection.fields
        );
    }
    return false;
};

kpxcDefine.markAllUsernameFields = function(chooser) {
    kpxcDefine.eventFieldClick = function(e, elem) {
        if (!e.isTrusted) {
            return;
        }

        const field = elem || e.currentTarget;
        kpxcDefine.selection.username = field.getAttribute('data-kpxc-id');
        field.classList.add('kpxcDefine-fixed-username-field');
        field.textContent = tr('username');
        field.onclick = null;
        kpxcDefine.prepareStep2();
        kpxcDefine.markAllPasswordFields('#kpxcDefine-fields');
    };
    kpxcDefine.markFields(chooser, kpxcFields.inputQueryPattern);
};

kpxcDefine.markAllPasswordFields = function(chooser, more = false) {
    kpxcDefine.eventFieldClick = function(e, elem) {
        if (!e.isTrusted) {
            return;
        }

        const field = elem || e.currentTarget;
        kpxcDefine.selection.password = field.getAttribute('data-kpxc-id');
        field.classList.add('kpxcDefine-fixed-password-field');
        field.textContent = tr('password');
        field.onclick = null;
        kpxcDefine.prepareStep3();
        kpxcDefine.markAllStringFields('#kpxcDefine-fields');
    };
    if (more) {
        kpxcDefine.markFields(chooser, kpxcFields.inputQueryPattern);
    } else {
        kpxcDefine.markFields(chooser, 'input[type=\'password\']');
    }
};

kpxcDefine.markAllStringFields = function(chooser) {
    kpxcDefine.eventFieldClick = function(e, elem) {
        if (!e.isTrusted) {
            return;
        }

        const field = elem || e.currentTarget;
        const value = field.getAttribute('data-kpxc-id');
        kpxcDefine.selection.fields[value] = true;

        const count = Object.keys(kpxcDefine.selection.fields).length;
        field.classList.add('kpxcDefine-fixed-string-field');
        field.textContent = tr('defineStringField') + String(count);
        field.onclick = null;
    };
    kpxcDefine.markFields(chooser, kpxcFields.inputQueryPattern + ', select');
};

kpxcDefine.markFields = function(chooser, pattern) {
    let index = 1;
    let firstInput = null;
    const inputs = document.querySelectorAll(pattern);

    for (const i of inputs) {
        if (kpxcDefine.isFieldSelected(i.getAttribute('data-kpxc-id'))) {
            continue;
        }

        if (kpxcFields.isVisible(i)) {
            const field = kpxcUI.createElement('div', 'kpxcDefine-fixed-field', { 'data-kpxc-id': i.getAttribute('data-kpxc-id') });
            const rect = i.getBoundingClientRect();
            field.style.top = Pixels(rect.top);
            field.style.left = Pixels(rect.left);
            field.style.width = Pixels(rect.width);
            field.style.height = Pixels(rect.height);
            field.textContent = String(index);
            field.addEventListener('click', function(e) {
                kpxcDefine.eventFieldClick(e);
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
            const elem = $(chooser);
            if (elem) {
                elem.append(field);
                firstInput = field;
                ++index;
            }
        }
    }

    if (firstInput) {
        firstInput.focus();
    }
};

kpxcDefine.prepareStep1 = function() {
    const help = $('#kpxcDefine-help');
    help.style.marginBottom = '10px';
    help.textContent = tr('defineKeyboardText');

    removeContent('div#kpxcDefine-fixed-field');
    $('#kpxcDefine-chooser-headline').textContent = tr('defineChooseUsername');
    kpxcDefine.dataStep = 1;
    $('#kpxcDefine-btn-skip').style.display = 'inline-block';
    $('#kpxcDefine-btn-confirm').style.display = 'none';
    $('#kpxcDefine-btn-again').style.display = 'none';
    $('#kpxcDefine-btn-more').style.display = 'none';
};

kpxcDefine.prepareStep2 = function() {
    const help = $('#kpxcDefine-help');
    help.style.marginBottom = '10px';
    help.textContent = tr('defineKeyboardText');

    removeContent('div.kpxcDefine-fixed-field:not(.kpxcDefine-fixed-username-field)');
    $('#kpxcDefine-chooser-headline').textContent = tr('defineChoosePassword');
    kpxcDefine.dataStep = 2;
    $('#kpxcDefine-btn-again').style.display = 'inline-block';
    $('#kpxcDefine-btn-more').style.display = 'inline-block';
};

kpxcDefine.prepareStep3 = function() {
    $('#kpxcDefine-help').style.marginBottom = '10px';
    $('#kpxcDefine-help').textContent = tr('defineHelpText');

    removeContent('div.kpxcDefine-fixed-field:not(.kpxcDefine-fixed-username-field):not(.kpxcDefine-fixed-password-field)');
    $('#kpxcDefine-chooser-headline').textContent = tr('defineConfirmSelection');
    kpxcDefine.dataStep = 3;
    $('#kpxcDefine-btn-skip').style.display = 'none';
    $('#kpxcDefine-btn-more').style.display = 'none';
    $('#kpxcDefine-btn-again').style.display = 'inline-block';
    $('#kpxcDefine-btn-confirm').style.display = 'inline-block';
};

kpxcDefine.skip = function() {
    if (kpxcDefine.dataStep === 1) {
        kpxcDefine.selection.username = null;
        kpxcDefine.prepareStep2();
        kpxcDefine.markAllPasswordFields('#kpxcDefine-fields');
    } else if (kpxcDefine.dataStep === 2) {
        kpxcDefine.selection.password = null;
        kpxcDefine.prepareStep3();
        kpxcDefine.markAllStringFields('#kpxcDefine-fields');
    }
};

kpxcDefine.again = function() {
    kpxcDefine.resetSelection();
    kpxcDefine.prepareStep1();
    kpxcDefine.markAllUsernameFields('#kpxcDefine-fields');
};

kpxcDefine.more = function() {
    if (kpxcDefine.dataStep === 2) {
        kpxcDefine.prepareStep2();
        kpxcDefine.markAllPasswordFields('#kpxcDefine-fields', true);
    }
};

kpxcDefine.confirm = async function() {
    if (kpxcDefine.dataStep !== 3) {
        return;
    }

    if (!kpxc.settings['defined-custom-fields']) {
        kpxc.settings['defined-custom-fields'] = {};
    }

    if (kpxcDefine.selection.username) {
        kpxcDefine.selection.username = kpxcFields.prepareId(kpxcDefine.selection.username);
    }

    if (kpxcDefine.selection.password) {
        kpxcDefine.selection.password = kpxcFields.prepareId(kpxcDefine.selection.password);
    }

    const fieldIds = [];
    const fieldKeys = Object.keys(kpxcDefine.selection.fields);
    for (const i of fieldKeys) {
        fieldIds.push(kpxcFields.prepareId(i));
    }

    const location = kpxc.getDocumentLocation();
    kpxc.settings['defined-custom-fields'][location] = {
        username: kpxcDefine.selection.username,
        password: kpxcDefine.selection.password,
        fields: fieldIds
    };

    await browser.runtime.sendMessage({
        action: 'save_settings',
        args: [ kpxc.settings ]
    });

    kpxcDefine.close();
};

kpxcDefine.discard = async function() {
    if (!$('#kpxcDefine-btn-discard')) {
        return;
    }

    const location = kpxc.getDocumentLocation();
    delete kpxc.settings['defined-custom-fields'][location];

    await browser.runtime.sendMessage({
        action: 'save_settings',
        args: [ kpxc.settings ]
    });

    await browser.runtime.sendMessage({
        action: 'load_settings'
    });

    $('div.alreadySelected').remove();
};

// Handle the keyboard events
kpxcDefine.keyDown = function(e) {
    if (!e.isTrusted) {
        return;
    }

    if (e.key === 'Escape') {
        kpxcDefine.close();
    } else if (e.key === 'Enter') {
        e.preventDefault();
    } else if (e.keyCode >= 49 && e.keyCode <= 57) {
        // Select input field by number
        e.preventDefault();
        const index = e.keyCode - 48;
        const inputFields = document.querySelectorAll('div.kpxcDefine-fixed-field:not(.kpxcDefine-fixed-username-field):not(.kpxcDefine-fixed-password-field)');

        if (inputFields.length >= index) {
            kpxcDefine.eventFieldClick(e, inputFields[index - 1]);
        }
    } else if (e.key === 's') {
        e.preventDefault();
        kpxcDefine.skip();
    } else if (e.key === 'a') {
        e.preventDefault();
        kpxcDefine.again();
    } else if (e.key === 'c') {
        e.preventDefault();
        kpxcDefine.confirm();
    } else if (e.key === 'm') {
        e.preventDefault();
        kpxcDefine.more();
    } else if (e.key === 'd') {
        e.preventDefault();
        kpxcDefine.discard();
    }
};

const removeContent = function(pattern) {
    const elems = document.querySelectorAll(pattern);
    for (const e of elems) {
        e.remove();
    }
};
