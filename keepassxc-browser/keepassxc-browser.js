'use strict';

// contains already called method names
var _called = {};
_called.retrieveCredentials = false;
_called.clearLogins = false;
_called.manualFillRequested = 'none';
let _loginId = -1;
let _singleInputEnabledForPage = false;
const _maximumInputs = 100;

// Count of detected form fields on the page
var _detectedFields = 0;

// Element id's containing input fields detected by MutationObserver
var _observerIds = [];

// Document URL
let _documentURL = document.location.href;

function _f(fieldId) {
    const field = (fieldId) ? jQuery('input[data-cip-id=\''+fieldId+'\']:first') : [];
    return (field.length > 0) ? field : null;
}

function _fs(fieldId) {
    const field = (fieldId) ? jQuery('input[data-cip-id=\''+fieldId+'\']:first,select[data-cip-id=\''+fieldId+'\']:first').first() : [];
    return (field.length > 0) ? field : null;
}


var cipAutocomplete = {};

// objects of username + description for autocomplete
cipAutocomplete.elements = [];

cipAutocomplete.init = function(field) {
    if (cip.settings.autoFillSingleEntry && cip.credentials.length === 1 && field.hasClass('ui-autocomplete-input')) {
        field.autocomplete('destroy');
    }

    let acMenu = jQuery('#kpxc-ac-menu');
    if (acMenu.length == 0) {
        jQuery('<div id=\"kpxc-ac-menu\" class=\"kpxc\"></div>').appendTo('body');
    }

    field
        .addClass('kpxc')
        .autocomplete({
            appendTo: '#kpxc-ac-menu',
            minLength: 0,
            source: cipAutocomplete.onSource,
            select: cipAutocomplete.onSelect,
            open: cipAutocomplete.onOpen
        });
    field
        .click(cipAutocomplete.onClick)
        .blur(cipAutocomplete.onBlur)
        .focus(cipAutocomplete.onFocus);
};

cipAutocomplete.onClick = function() {
    jQuery(this).autocomplete('search', jQuery(this).val());
};

cipAutocomplete.onOpen = function(event, ui) {
    jQuery('ul.ui-autocomplete.ui-menu').css('z-index', 2147483636);
};

cipAutocomplete.onSource = function(request, callback) {
    const matches = jQuery.map(cipAutocomplete.elements, (tag) => {
        if (tag.label.toUpperCase().indexOf(request.term.toUpperCase()) === 0) {
            return tag;
        }
    });
    callback(matches);
};

cipAutocomplete.onSelect = function(e, ui) {
    e.preventDefault();
    cip.setValueWithChange(jQuery(this), ui.item.value);
    const fieldId = cipFields.prepareId(jQuery(this).attr('data-cip-id'));
    const combination = cipFields.getCombination('username', fieldId);
    combination.loginId = ui.item.loginId;
    cip.fillInCredentials(combination, true, false);
    jQuery(this).data('fetched', true);
};

cipAutocomplete.onBlur = function() {
    if (jQuery(this).data('fetched') === true) {
        jQuery(this).data('fetched', false);
    }
    else {
        const fieldId = cipFields.prepareId(jQuery(this).attr('data-cip-id'));
        const fields = cipFields.getCombination('username', fieldId);
        const fieldValue = jQuery(this).val();

        // Check if the manually inserted value is one of the retrieved credentials
        let fieldFound = cipAutocomplete.elements.some(e => e.value === fieldValue);

        if (_f(fields.password) && _f(fields.password).data('unchanged') !== true && fieldFound && _detectedFields > 1) {
            cip.fillInCredentials(fields, true, true);
        }
    }
};

cipAutocomplete.onFocus = function() {
    cip.u = jQuery(this);

    if (jQuery(this).val() === '') {
        jQuery(this).autocomplete('search', '');
    }
};

var cipPassword = {};
cipPassword.observedIcons = [];
cipPassword.observingLock = false;

cipPassword.init = function() {
    if ('initPasswordGenerator' in _called) {
        return;
    }

    _called.initPasswordGenerator = true;

    window.setInterval(function() {
        cipPassword.checkObservedElements();
    }, 400);
};

cipPassword.initField = function(field, inputs, pos) {
    if (!field || field.length !== 1) {
        return;
    }
    if (field.data('cip-password-generator')) {
        return;
    }

    field.data('cip-password-generator', true);

    cipPassword.createIcon(field);

    let $found = false;
    if (inputs) {
        for (let i = pos + 1; i < inputs.length; i++) {
            if (inputs[i] && inputs[i].attr('type') && inputs[i].attr('type').toLowerCase() === 'password') {
                field.data('cip-genpw-next-field-id', inputs[i].data('cip-id'));
                field.data('cip-genpw-next-is-password-field', (i === 0));
                $found = true;
                break;
            }
        }
    }

    field.data('cip-genpw-next-field-exists', $found);
};

cipPassword.createDialog = function() {
    if ('passwordCreateDialog' in _called) {
        return;
    }

    _called.passwordCreateDialog = true;

    const $dialog = jQuery('<div>')
        .addClass('dialog-form')
        .attr('id', 'cip-genpw-dialog');

    const $inputDiv = jQuery('<div>').addClass('form-group');
    const $inputGroup = jQuery('<div>').addClass('genpw-input-group');
    const $textfieldPassword = jQuery('<input>')
        .attr('id', 'cip-genpw-textfield-password')
        .attr('type', 'text')
        .attr('aria-describedby', 'cip-genpw-quality')
        .attr('placeholder', tr('passwordGeneratorPlaceholder'))
        .addClass('genpw-text ui-widget-content ui-corner-all')
        .on('change keypress paste textInput input', function() {
            jQuery('#cip-genpw-btn-clipboard:first').removeClass('btn-success');
        });
    const $quality = jQuery('<span>')
        .addClass('genpw-input-group-addon')
        .addClass('b2c-add-on')
        .attr('id', 'cip-genpw-quality')
        .text(tr('passwordGeneratorBits'));
    $inputGroup.append($textfieldPassword).append($quality);

    const $checkGroup = jQuery('<div>').addClass('genpw-input-group');
    const $checkboxNextField = jQuery('<input>')
        .attr('id', 'cip-genpw-checkbox-next-field')
        .attr('type', 'checkbox')
        .addClass('cip-genpw-checkbox');
    const $labelNextField = jQuery('<label>')
        .append($checkboxNextField)
        .addClass('cip-genpw-label')
        .append(tr('passwordGeneratorLabel'));
    $checkGroup.append($labelNextField);

    $inputDiv.append($inputGroup).append($checkGroup);
    $dialog.append($inputDiv);

    $dialog.hide();
    jQuery('body').append($dialog);

    let $container = jQuery('#kpxc-pw-dialog');
    if ($container.length === 0) {
        jQuery('<div id=\"kpxc-pw-dialog\" class=\"kpxc\"></div>').appendTo('body');
    }

    $dialog.dialog({
        appendTo: '#kpxc-pw-dialog',
        autoOpen: false,
        modal: true,
        resizable: false,
        minWidth: 300,
        minHeight: 80,
        title: tr('passwordGeneratorTitle'),
        classes: {'ui-dialog': 'ui-corner-all'},
        buttons: {
            'Generate':
            {
                text: tr('passwordGeneratorGenerate'),
                id: 'cip-genpw-btn-generate',
                click: (e) => {
                    e.preventDefault();
                    browser.runtime.sendMessage({
                        action: 'generate_password'
                    }).then(cipPassword.callbackGeneratedPassword).catch((e) => {
                        console.log(e);
                    });
                }
            },
            'Copy':
            {
                text: tr('passwordGeneratorCopy'),
                id: 'cip-genpw-btn-clipboard',
                click: (e) => {
                    e.preventDefault();
                    cipPassword.copyPasswordToClipboard();
                }
            },
            'Fill & copy':
            {
                text: tr('passwordGeneratorFillAndCopy'),
                id: 'cip-genpw-btn-fillin',
                click: (e) => {
                    e.preventDefault();

                    const fieldId = jQuery('#cip-genpw-dialog:first').data('cip-genpw-field-id');
                    const field = jQuery('input[data-cip-id=\''+fieldId+'\']:first');
                    if (field.length === 1) {
                        let $password = jQuery('input#cip-genpw-textfield-password:first').val();

                        if (field.attr('maxlength')) {
                            if ($password.length > field.attr('maxlength')) {
                                $password = $password.substring(0, field.attr('maxlength'));
                                jQuery('input#cip-genpw-textfield-password:first').val($password);
                                jQuery('#cip-genpw-btn-clipboard:first').removeClass('b2c-btn-success');
                                alert(tr('passwordGeneratorErrorTooLong'));
                                browser.runtime.sendMessage({
                                    action: 'show_notification',
                                    args: [message]
                                });
                            }
                        }

                        field.val($password);
                        if (jQuery('input#cip-genpw-checkbox-next-field:checked').length === 1) {
                            if (field.data('cip-genpw-next-field-exists')) {
                                const nextFieldId = field.data('cip-genpw-next-field-id');
                                const nextField = jQuery('input[data-cip-id=\''+nextFieldId+'\']:first');
                                if (nextField.length === 1) {
                                    nextField.val($password);
                                }
                            }
                        }

                        cipPassword.copyPasswordToClipboard();
                    }
                }
            }
        },
        open: function(event, ui) {
            jQuery('.ui-widget-overlay').click(function() {
                jQuery('#cip-genpw-dialog:first').dialog('close');
                jQuery('span').remove('.kpxc');
            });

            if (jQuery('input#cip-genpw-textfield-password:first').val() === '') {
                jQuery('button#cip-genpw-btn-generate:first').click();
            }
        }
    });
};

cipPassword.createIcon = function(field) {
    const $className = (isFirefox() ? 'key-moz' : 'key');
    const $size = (field.outerHeight() > 28) ? 24 : 16;
    let $offset = Math.floor((field.outerHeight() - $size) / 3);
    $offset = ($offset < 0) ? 0 : $offset;

    const $icon = jQuery('<div>')
        .addClass('kpxc')
        .addClass('cip-genpw-icon')
        .addClass($className)
        .attr('title', tr('passwordGeneratorGenerateText'))
        .css('z-index', '9999')
        .css('width', $size)
        .css('height', $size)
        .data('size', $size)
        .data('offset', $offset)
        .data('cip-genpw-field-id', field.data('cip-id'));
    cipPassword.setIconPosition($icon, field);
    $icon.click(function(e) {
        e.preventDefault();

        if (!field.is(':visible')) {
            $icon.remove();
            field.removeData('cip-password-generator');
            return;
        }

        cipPassword.createDialog();
        const $dialog = jQuery('#cip-genpw-dialog');
        if ($dialog.dialog('isOpen')) {
            $dialog.dialog('close');
        }

        $dialog.dialog('option', 'position', { my: 'left-10px top', at: 'center bottom', of: jQuery(this) });
        $dialog.data('cip-genpw-field-id', field.data('cip-id'));
        $dialog.data('cip-genpw-next-field-id', field.data('cip-genpw-next-field-id'));
        $dialog.data('cip-genpw-next-is-password-field', field.data('cip-genpw-next-is-password-field'));

        const $bool = Boolean(field.data('cip-genpw-next-field-exists'));
        jQuery('input#cip-genpw-checkbox-next-field:first')
            .attr('checked', $bool)
            .attr('disabled', !$bool);

        $dialog.dialog('open');
    });

    cipPassword.observedIcons.push($icon);
    jQuery('body').append($icon);
};

cipPassword.setIconPosition = function($icon, $field) {
    $icon.css('top', $field.offset().top + $icon.data('offset') + 1)
        .css('left', $field.offset().left + $field.outerWidth() - $icon.data('size') - $icon.data('offset'));
};

cipPassword.copyPasswordToClipboard = function(e) {
    if (e) {
        e.preventDefault();
    }

    const input = jQuery("input#cip-genpw-textfield-password");
    input.select();
    try {
        const success = document.execCommand('copy');
        if (success) {
            jQuery("#cip-genpw-btn-clipboard").addClass("b2c-btn-success");
        }
        jQuery("#cip-genpw-dialog").select();
        input.value = '';
    }
    catch (err) {
        console.log('Could not copy password to clipboard: ' + err);
    }
};

cipPassword.callbackPasswordCopied = function(bool) {
    if (bool) {
        jQuery('#cip-genpw-btn-clipboard').addClass('btn-success');
    }
};

cipPassword.callbackGeneratedPassword = function(entries) {
    if (entries && entries.length >= 1) {
        jQuery('#cip-genpw-btn-clipboard:first').removeClass('btn-success');
        jQuery('input#cip-genpw-textfield-password:first').val(entries[0].password);
        if (isNaN(entries[0].login)) {
            jQuery('#cip-genpw-quality:first').text('??? Bits');
        }
        else {
            jQuery('#cip-genpw-quality:first').text(entries[0].login + ' Bits');
        }
    }
    else {
        if (jQuery('div#cip-genpw-error:first').length === 0) {
            jQuery('button#cip-genpw-btn-generate:first').after('<div style=\'block\' id=\'cip-genpw-error\'>' + tr('passwordGeneratorError') + '<br /></div>');
            jQuery('input#cip-genpw-textfield-password:first').parent().hide();
            jQuery('input#cip-genpw-checkbox-next-field:first').parent('label').hide();
            jQuery('button#cip-genpw-btn-generate').hide();
            jQuery('button#cip-genpw-btn-clipboard').hide();
            jQuery('button#cip-genpw-btn-fillin').hide();
        }
    }
};

cipPassword.onRequestPassword = function() {
    browser.runtime.sendMessage({
        action: 'generate_password'
    }).then(cipPassword.callbackGeneratedPassword);
};

cipPassword.checkObservedElements = function() {
    if (cipPassword.observingLock) {
        return;
    }

    cipPassword.observingLock = true;
    jQuery.each(cipPassword.observedIcons, (index, iconField) => {
        if (iconField && iconField.length === 1) {
            const fieldId = iconField.data('cip-genpw-field-id');
            const field = jQuery('input[data-cip-id=\''+fieldId+'\']:first');
            if (!field || field.length !== 1) {
                iconField.remove();
                cipPassword.observedIcons.splice(index, 1);
            }
            else if (!field.is(':visible')) {
                iconField.hide();
                //field.removeData('cip-password-generator');
            }
            else if (field.is(':visible')) {
                iconField.show();
                cipPassword.setIconPosition(iconField, field);
                field.data('cip-password-generator', true);
            }


        }
        else {
            cipPassword.observedIcons.splice(index, 1);
        }
    });
    cipPassword.observingLock = false;
};



var cipForm = {};

cipForm.init = function(form, credentialFields) {
    // TODO: could be called multiple times --> update credentialFields

    // not already initialized && password-field is not null
    if (!form.data('cipForm-initialized') && (credentialFields.password || (_singleInputEnabledForPage && credentialFields.username))) {
        form.data('cipForm-initialized', true);
        cipForm.setInputFields(form, credentialFields);
        form.submit(cipForm.onSubmit);
    }
};

cipForm.destroy = function(form, credentialFields) {
    if (form === false && credentialFields) {
        const field = _f(credentialFields.password) || _f(credentialFields.username);
        if (field) {
            form = field.closest('form');
        }
    }

    if (form && jQuery(form).length > 0) {
        jQuery(form).unbind('submit', cipForm.onSubmit);
    }
};

cipForm.setInputFields = function(form, credentialFields) {
    form.data('cipUsername', credentialFields.username);
    form.data('cipPassword', credentialFields.password);
};

cipForm.onSubmit = function() {
    const usernameId = jQuery(this).data('cipUsername');
    const passwordId = jQuery(this).data('cipPassword');

    let usernameValue = '';
    let passwordValue = '';

    const usernameField = _f(usernameId);
    const passwordField = _f(passwordId);

    if (usernameField) {
        usernameValue = usernameField.val();
    }
    if (passwordField) {
        passwordValue = passwordField.val();
    }

    cip.rememberCredentials(usernameValue, passwordValue);
};



var cipDefine = {};

cipDefine.selection = {
    username: null,
    password: null,
    fields: []
};
cipDefine.eventFieldClick = null;

cipDefine.init = function () {
    const $backdrop = jQuery('<div>').attr('id', 'b2c-backdrop').addClass('b2c-modal-backdrop');
    jQuery('body').append($backdrop);

    const $chooser = jQuery('<div>').attr('id', 'b2c-cipDefine-fields');
    jQuery('body').append($chooser);

    let $description = jQuery('<div>').attr('id', 'b2c-cipDefine-description');
    $backdrop.append($description);

    cipFields.getAllFields();
    cipFields.prepareVisibleFieldsWithID('select');

    cipDefine.initDescription();

    cipDefine.resetSelection();
    cipDefine.prepareStep1();
    cipDefine.markAllUsernameFields($chooser);
};

cipDefine.initDescription = function() {
    const $description = jQuery('div#b2c-cipDefine-description');
    const $h1 = jQuery('<div>').addClass('b2c-chooser-headline');
    $description.append($h1);
    const $help = jQuery('<div>').addClass('b2c-chooser-help').attr('id', 'b2c-help');
    $description.append($help);

    const $btnDismiss = jQuery('<button>').text(tr('defineDismiss')).attr('id', 'b2c-btn-dismiss')
        .addClass('btn').addClass('btn-danger')
        .click(function(e) {
            jQuery('div#b2c-backdrop').remove();
            jQuery('div#b2c-cipDefine-fields').remove();
        });
    const $btnSkip = jQuery('<button>').text(tr('defineSkip')).attr('id', 'b2c-btn-skip')
        .addClass('btn').addClass('btn-info')
        .css('margin-right', '5px')
        .click(function() {
            if (jQuery(this).data('step') === '1') {
                cipDefine.selection.username = null;
                cipDefine.prepareStep2();
                cipDefine.markAllPasswordFields(jQuery('#b2c-cipDefine-fields'));
            }
            else if (jQuery(this).data('step') === '2') {
                cipDefine.selection.password = null;
                cipDefine.prepareStep3();
                cipDefine.markAllStringFields(jQuery('#b2c-cipDefine-fields'));
            }
        });
    const $btnAgain = jQuery('<button>').text(tr('defineAgain')).attr('id', 'b2c-btn-again')
        .addClass('btn').addClass('btn-warning')
        .css('margin-right', '5px')
        .click(function(e) {
            cipDefine.resetSelection();
            cipDefine.prepareStep1();
            cipDefine.markAllUsernameFields(jQuery('#b2c-cipDefine-fields'));
        })
        .hide();
    const $btnConfirm = jQuery('<button>').text(tr('defineConfirm')).attr('id', 'b2c-btn-confirm')
        .addClass('btn').addClass('btn-primary')
        .css('margin-right', '15px')
        .click(function(e) {
            if (!cip.settings['defined-custom-fields']) {
                cip.settings['defined-custom-fields'] = {};
            }

            if (cipDefine.selection.username) {
                cipDefine.selection.username = cipFields.prepareId(cipDefine.selection.username);
            }

            if (cipDefine.selection.password) {
                cipDefine.selection.password = cipFields.prepareId(cipDefine.selection.password);
            }

            let fieldIds = [];
            const fieldKeys = Object.keys(cipDefine.selection.fields);
            for (const i of fieldKeys) {
                fieldIds.push(cipFields.prepareId(i));
            }

            const location = cip.getDocumentLocation();
            cip.settings['defined-custom-fields'][location] = {
                username: cipDefine.selection.username,
                password: cipDefine.selection.password,
                fields: fieldIds
            };

            browser.runtime.sendMessage({
                action: 'save_settings',
                args: [cip.settings]
            });

            jQuery('button#b2c-btn-dismiss').click();
        })
        .hide();

    $description.append($btnConfirm);
    $description.append($btnSkip);
    $description.append($btnAgain);
    $description.append($btnDismiss);

    const location = cip.getDocumentLocation();
    if (cip.settings['defined-custom-fields'] && cip.settings['defined-custom-fields'][location]) {
        const $p = jQuery('<p>').html(tr('defineAlreadySelected') + '<br />');
        const $btnDiscard = jQuery('<button>')
            .attr('id', 'btn-warning')
            .text(tr('defineDiscard'))
            .css('margin-top', '5px')
            .addClass('btn')
            .addClass('btn-sm')
            .addClass('btn-danger')
            .click(function(e) {
                delete cip.settings['defined-custom-fields'][location];

                browser.runtime.sendMessage({
                    action: 'save_settings',
                    args: [cip.settings]
                });

                browser.runtime.sendMessage({
                    action: 'load_settings'
                });

                jQuery(this).parent('p').remove();
            });
        $p.append($btnDiscard);
        $description.append($p);
    }

    jQuery('div#b2c-cipDefine-description').draggable();
};

cipDefine.resetSelection = function() {
    cipDefine.selection = {
        username: null,
        password: null,
        fields: []
    };
};

cipDefine.isFieldSelected = function($cipId) {
    return (
        $cipId === cipDefine.selection.username ||
        $cipId === cipDefine.selection.password ||
        $cipId in cipDefine.selection.fields
    );
};

cipDefine.markAllUsernameFields = function($chooser) {
    cipDefine.eventFieldClick = function(e) {
        cipDefine.selection.username = jQuery(this).data('cip-id');
        jQuery(this).addClass('b2c-fixed-username-field').text(tr('username')).unbind('click');
        cipDefine.prepareStep2();
        cipDefine.markAllPasswordFields(jQuery('#b2c-cipDefine-fields'));
    };
    cipDefine.markFields($chooser, cipFields.inputQueryPattern);
};

cipDefine.markAllPasswordFields = function($chooser) {
    cipDefine.eventFieldClick = function(e) {
        cipDefine.selection.password = jQuery(this).data('cip-id');
        jQuery(this).addClass('b2c-fixed-password-field').text(tr('password')).unbind('click');
        cipDefine.prepareStep3();
        cipDefine.markAllStringFields(jQuery('#b2c-cipDefine-fields'));
    };
    cipDefine.markFields($chooser, 'input[type=\'password\']');
};

cipDefine.markAllStringFields = function($chooser) {
    cipDefine.eventFieldClick = function(e) {
        cipDefine.selection.fields[jQuery(this).data('cip-id')] = true;
        const count = Object.keys(cipDefine.selection.fields).length;
        jQuery(this).addClass('b2c-fixed-string-field').text(tr('defineStringField') + String(count)).unbind('click');
        jQuery('button#b2c-btn-confirm:first').addClass('b2c-btn-primary').attr('disabled', false);
    };
    cipDefine.markFields($chooser, cipFields.inputQueryPattern + ', select');
};

cipDefine.markFields = function ($chooser, $pattern) {
    jQuery($pattern).each(function() {
        if (cipDefine.isFieldSelected(jQuery(this).data('cip-id'))) {
            return true;
        }

        if (cipFields.isVisible(this)) {
            const $field = jQuery('<div>').addClass('b2c-fixed-field')
                .css('top', jQuery(this).offset().top)
                .css('left', jQuery(this).offset().left)
                .css('width', jQuery(this).outerWidth())
                .css('height', jQuery(this).outerHeight())
                .attr('data-cip-id', jQuery(this).attr('data-cip-id'))
                .click(cipDefine.eventFieldClick)
                .hover(function() {jQuery(this).addClass('b2c-fixed-hover-field');}, function() {jQuery(this).removeClass('b2c-fixed-hover-field');});
            $chooser.append($field);
        }
    });
};

cipDefine.prepareStep1 = function() {
    jQuery('div#b2c-help').text('').css('margin-bottom', 0);
    jQuery('div#b2c-cipDefine-fields').removeData('username');
    jQuery('div#b2c-cipDefine-fields').removeData('password');
    jQuery('div.b2c-fixed-field', jQuery('div#b2c-cipDefine-fields')).remove();
    jQuery('div:first', jQuery('div#b2c-cipDefine-description')).text(tr('defineChooseUsername'));
    jQuery('button#b2c-btn-skip:first').data('step', '1').show();
    jQuery('button#b2c-btn-confirm:first').hide();
    jQuery('button#b2c-btn-again:first').hide();
};

cipDefine.prepareStep2 = function() {
    jQuery('div#b2c-help').text('').css('margin-bottom', 0);
    jQuery('div.b2c-fixed-field:not(.b2c-fixed-username-field)', jQuery('div#b2c-cipDefine-fields')).remove();
    jQuery('div:first', jQuery('div#b2c-cipDefine-description')).text(tr('defineChoosePassword'));
    jQuery('button#b2c-btn-skip:first').data('step', '2');
    jQuery('button#b2c-btn-again:first').show();
};

cipDefine.prepareStep3 = function() {
    if (!cipDefine.selection.username && !cipDefine.selection.password) {
        jQuery('button#b2c-btn-confirm:first').removeClass('b2c-btn-primary').attr('disabled', true);
    }

    jQuery('div#b2c-help').html(tr('defineHelpText')).css('margin-bottom', '5px');
    jQuery('div.b2c-fixed-field:not(.b2c-fixed-password-field,.b2c-fixed-username-field)', jQuery('div#b2c-cipDefine-fields')).remove();
    jQuery('button#b2c-btn-confirm:first').show();
    jQuery('button#b2c-btn-skip:first').data('step', '3').hide();
    jQuery('div:first', jQuery('div#b2c-cipDefine-description')).text(tr('defineConfirmSelection'));
};



var cipFields = {};

cipFields.inputQueryPattern = 'input[type=\'text\'], input[type=\'email\'], input[type=\'password\'], input[type=\'tel\'], input[type=\'number\'], input:not([type])';
// unique number as new IDs for input fields
cipFields.uniqueNumber = 342845638;
// objects with combination of username + password fields
cipFields.combinations = [];

cipFields.setUniqueId = function(field) {
    if (field && !field.attr('data-cip-id')) {
        // use ID of field if it is unique
        // yes, it should be, but there are many bad developers outside...
        const fieldId = field.attr('id');
        if (fieldId) {
            const foundIds = jQuery('input#' + cipFields.prepareId(fieldId));
            if (foundIds.length === 1) {
                field.attr('data-cip-id', fieldId);
                return;
            }
        }

        // create own ID if no ID is set for this field
        cipFields.uniqueNumber += 1;
        field.attr('data-cip-id', 'jQuery'+String(cipFields.uniqueNumber));
    }
};

cipFields.prepareId = function(id) {
    return id.replace(/[:#.,\[\]\(\)' "]/g, function(m) { return '\\'+m; });
};

/**
 * Returns the first parent element satifying the {@code predicate} mapped by {@code resultFn} or else {@code defaultVal}.
 * @param {HTMLElement} element     The start element (excluded, starting with the parents)
 * @param {function} predicate      Matcher for the element to find, type (HTMLElement) => boolean
 * @param {function} resultFn       Callback function of type (HTMLElement) => {*} called for the first matching element
 * @param {fun} defaultValFn        Fallback return value supplier, if no element matching the predicate can be found
 */
cipFields.traverseParents = function(element, predicate, resultFn = () => true, defaultValFn = () => false) {
    for (let f = element.parentElement; f !== null; f = f.parentElement) {
        if (predicate(f)) {
            return resultFn(f);
        }
    }
    return defaultValFn();
};

cipFields.getOverflowHidden = function(field) {
    return cipFields.traverseParents(field, f => f.style.overflow === 'hidden');
};


// Checks if input field is a search field. Attributes or form action containing 'search', or parent element holding
// role="search" will be identified as a search field.
cipFields.isSearchField = function(target) {
    const attributes = target.attributes;

    // Check element attributes
    for (const attr of attributes) {
        if ((attr.value && (attr.value.toLowerCase().includes('search')) || attr.value === 'q')) {
            return true;
        }
    }

    // Check closest form
    const closestForm = target.closest('form');
    if (closestForm) {
        // Check form action
        const formAction = closestForm.getAttribute('action');
        if (formAction && (formAction.toLowerCase().includes('search') && 
            !formAction.toLowerCase().includes('research'))) {
            return true;
        }

        // Check form class and id
        const closestFormId = closestForm.getAttribute('id');
        const closestFormClass = closestForm.className;
        if (closestFormClass && (closestForm.className.toLowerCase().includes('search') || 
            (closestFormId && closestFormId.toLowerCase().includes('search') && !closestFormId.toLowerCase().includes('research')))) {
            return true;
        }
    }

    // Check parent elements for role="search"
    const roleFunc = f => f.getAttribute('role');
    const roleValue = cipFields.traverseParents(target, roleFunc, roleFunc, () => null);
    if (roleValue && roleValue === 'search') {
        return true;
    }

    return false;
};

cipFields.isVisible = function(field) {
    const rect = field.getBoundingClientRect();

    // Check CSS visibility
    const fieldStyle = getComputedStyle(field);
    if (fieldStyle.visibility && (fieldStyle.visibility === 'hidden' || fieldStyle.visibility === 'collapse')) {
        return false;
    }

    // Check element position and size
    if (rect.x < 0 || rect.y < 0 || rect.width < 8 || rect.height < 8) {
        return false;
    }

    return true;
};

cipFields.getAllFields = function() {
    let fields = [];
    const inputs = cipObserverHelper.getInputs(document);
    for (const i of inputs) {
        if (cipFields.isVisible(i) && !cipFields.isSearchField(i)) {
            cipFields.setUniqueId(jQuery(i));
            fields.push(jQuery(i));
        }
    };

    _detectedFields = fields.length;
    return fields;
};

cipFields.prepareVisibleFieldsWithID = function($pattern) {
    jQuery($pattern).each(function() {
        if (cipFields.isVisible(this) && !cipFields.isSearchField(this)) {
            cipFields.setUniqueId(jQuery(this));
        }
    });
};

cipFields.getAllCombinations = function(inputs) {
    let fields = [];
    let uField = null;

    for (const i of inputs) {
        if (i) {
            if (i.attr('type') && i.attr('type').toLowerCase() === 'password') {
                const uId = (!uField || uField.length < 1) ? null : cipFields.prepareId(uField.attr('data-cip-id'));

                const combination = {
                    username: uId,
                    password: cipFields.prepareId(i.attr('data-cip-id'))
                };
                fields.push(combination);

                // reset selected username field
                uField = null;
            }
            else {
                // username field
                uField = i;
            }
        }
    }

    if (_singleInputEnabledForPage && fields.length === 0 && uField) {
        const combination = {
            username: uField[0].getAttribute('data-cip-id'),
            password: null
        };
        fields.push(combination);
    }

    return fields;
};

cipFields.getCombination = function(givenType, fieldId) {
    if (cipFields.combinations.length === 0) {
        if (cipFields.useDefinedCredentialFields()) {
            return cipFields.combinations[0];
        }
    }
    // use defined credential fields (already loaded into combinations)
    const location = cip.getDocumentLocation();
    if (cip.settings['defined-custom-fields'] && cip.settings['defined-custom-fields'][location]) {
        return cipFields.combinations[0];
    }

    for (let c of cipFields.combinations) {
        if (c[givenType] === fieldId) {
            return c;
        }
    }

    // find new combination
    let combination = {
        username: null,
        password: null
    };

    let newCombi = false;
    if (givenType === 'username') {
        const passwordField = cipFields.getPasswordField(fieldId, true);
        let passwordId = null;
        if (passwordField && passwordField.length > 0) {
            passwordId = cipFields.prepareId(passwordField.attr('data-cip-id'));
        }
        combination = {
            username: fieldId,
            password: passwordId
        };
        newCombi = true;
    }
    else if (givenType === 'password') {
        const usernameField = cipFields.getUsernameField(fieldId, true);
        let usernameId = null;
        if (usernameField && usernameField.length > 0) {
            usernameId = cipFields.prepareId(usernameField.attr('data-cip-id'));
        }
        combination = {
            username: usernameId,
            password: fieldId
        };
        newCombi = true;
    }

    if (combination.username || combination.password) {
        cipFields.combinations.push(combination);
    }

    if (combination.username) {
        if (cip.credentials.length > 0) {
            cip.preparePageForMultipleCredentials(cip.credentials);
        }
    }

    if (newCombi) {
        combination.isNew = true;
    }
    return combination;
};

/**
* return the username field or null if it not exists
*/
cipFields.getUsernameField = function(passwordId, checkDisabled) {
    const passwordField = _f(passwordId);
    if (!passwordField) {
        return null;
    }

    const form = passwordField.closest('form')[0];
    let usernameField = null;

    // search all inputs on this one form
    if (form) {
        jQuery(cipFields.inputQueryPattern, form).each(function() {
            cipFields.setUniqueId(jQuery(this));
            if (jQuery(this).attr('data-cip-id') === passwordId) {
                // break
                return false;
            }

            if (jQuery(this).attr('type') && jQuery(this).attr('type').toLowerCase() === 'password') {
                // continue
                return true;
            }

            usernameField = jQuery(this);
        });
    }
    // search all inputs on page
    else {
        const inputs = cipFields.getAllFields();
        cip.initPasswordGenerator(inputs);
        for (const i of inputs) {
            if (i.attr('data-cip-id') === passwordId) {
                break;
            }

            if (i.attr('type') && i.attr('type').toLowerCase() === 'password') {
                continue;
            }

            usernameField = i;
        }
    }

    if (usernameField && !checkDisabled) {
        const usernameId = usernameField.attr('data-cip-id');
        // check if usernameField is already used by another combination
        for (const c of cipFields.combinations) {
            if (c.username === usernameId) {
                usernameField = null;
                break;
            }
        }
    }

    cipFields.setUniqueId(usernameField);
    return usernameField;
};

/**
* return the password field or null if it not exists
*/
cipFields.getPasswordField = function(usernameId, checkDisabled) {
    const usernameField = _f(usernameId);
    if (!usernameField) {
        return null;
    }

    const form = usernameField.closest('form')[0];
    let passwordField = null;

    // search all inputs on this one form
    if (form) {
        passwordField = jQuery('input[type=\'password\']:first', form);
        if (passwordField && passwordField.length < 1) {
            passwordField = null;
        }

        if (cip.settings.usePasswordGenerator) {
            cipPassword.init();
            cipPassword.initField(passwordField);
        }
    }
    // search all inputs on page
    else {
        const inputs = cipFields.getAllFields();
        cip.initPasswordGenerator(inputs);

        let active = false;
        for (const i of inputs) {
            if (i.attr('data-cip-id') === usernameId) {
                active = true;
            }
            if (active && jQuery(i).attr('type') && jQuery(i).attr('type').toLowerCase() === 'password') {
                passwordField = i;
                break;
            }
        }
    }

    if (passwordField && !checkDisabled) {
        const passwordId = passwordField.attr('data-cip-id');
        // check if passwordField is already used by another combination
        for (const c of cipFields.combinations) {
            if (c.password === passwordId) {
                passwordField = null;
                break;
            }
        }
    }

    cipFields.setUniqueId(passwordField);

    return passwordField;
};

cipFields.prepareCombinations = function(combinations) {
    for (const c of combinations) {
        const pwField = _f(c.password);
        // needed for auto-complete: don't overwrite manually filled-in password field
        if (pwField && !pwField.data('cipFields-onChange')) {
            pwField.data('cipFields-onChange', true);
            pwField.change(function() {
                jQuery(this).data('unchanged', false);
            });
        }

        // initialize form-submit for remembering credentials
        const fieldId = c.password || c.username;
        const field = _f(fieldId);
        if (field) {
            const form = field.closest('form');
            if (form && form.length > 0) {
                cipForm.init(form, c);
            }
        }
    }
};

cipFields.useDefinedCredentialFields = function() {
    const location = cip.getDocumentLocation();
    if (cip.settings['defined-custom-fields'] && cip.settings['defined-custom-fields'][location]) {
        const creds = cip.settings['defined-custom-fields'][location];

        let $found = _f(creds.username) || _f(creds.password);
        for (const i of creds.fields) {
            if (_fs(i)) {
                $found = true;
                break;
            }
        }

        if ($found) {
            let fields = {
                username: creds.username,
                password: creds.password,
                fields: creds.fields
            };
            cipFields.combinations = [];
            cipFields.combinations.push(fields);

            return true;
        }
    }

    return false;
};


var cipObserverHelper = {};
cipObserverHelper.inputTypes = [
    'text',
    'email',
    'password',
    'tel',
    'number',
    null    // Input field can be without any type. Include these to the list.
];

// Ignores all nodes that doesn't contain elements
cipObserverHelper.ignoredNode = function(target) {
    if (target.nodeType === Node.ATTRIBUTE_NODE ||
        target.nodeType === Node.TEXT_NODE || 
        target.nodeType === Node.CDATA_SECTION_NODE ||
        target.nodeType === Node.PROCESSING_INSTRUCTION_NODE ||
        target.nodeType === Node.COMMENT_NODE ||
        target.nodeType === Node.DOCUMENT_TYPE_NODE ||
        target.nodeType === Node.NOTATION_NODE) {
        return true;
    }
    return false;
};

cipObserverHelper.getInputs = function(target) {
    // Ignores target element if it's not an element node
    if (cipObserverHelper.ignoredNode(target)) {
        return [];
    }

    // Filter out any input fields with type 'hidden' right away
    let inputFields = [];
    Array.from(target.getElementsByTagName('input')).forEach(e => { 
        if (e.type !== 'hidden') {
            inputFields.push(e);
        }
    });

    // Do not allow more visible inputs than _maximumInputs (default value: 100)
    if (inputFields.length === 0 || inputFields.length > _maximumInputs) {
        return [];
    }

    // Only include input fields that match with cipObserverHelper.inputTypes
    let inputs = [];
    for (const i of inputFields) {
        let type = i.getAttribute('type');
        if (type) {
            type = type.toLowerCase();
        }

        if (cipObserverHelper.inputTypes.includes(type)) {
            inputs.push(i);
        }
    }
    return inputs;
};

cipObserverHelper.getId = function(target) {
    return target.classList.length === 0 ? target.id : target.classList;
};

cipObserverHelper.ignoredElement = function(target) {
    // Ignore elements that do not have a className (including SVG)
    if (typeof target.className !== 'string') {
        return true;
    }

    // Ignore KeePassXC-Browser classes
    if (target.className && target.className !== undefined && 
        (target.className.includes('kpxc') || target.className.includes('ui-helper'))) {
        return true;
    }

    return false;
};

cipObserverHelper.handleObserverAdd = function(target) {
    if (cipObserverHelper.ignoredElement(target)) {
        return;
    }

    const inputs = cipObserverHelper.getInputs(target);
    if (inputs.length === 0) {
        return;
    }

    const neededLength = _detectedFields === 1 ? 0 : 1;
    const id = cipObserverHelper.getId(target);
    if (inputs.length > neededLength && !_observerIds.includes(id)) {
        // Save target element id for preventing multiple calls to initCredentialsFields()
        _observerIds.push(id);
        
        // Sometimes the settings haven't been loaded before new input fields are detected
        if (Object.keys(cip.settings).length === 0) {
            cip.init();
        } else {
            cip.initCredentialFields(true);
        }
    }
};

cipObserverHelper.handleObserverRemove = function(target) {
    if (cipObserverHelper.ignoredElement(target)) {
        return;
    }

    const inputs = cipObserverHelper.getInputs(target);
    if (inputs.length === 0) {
        return;
    }

    // Remove target element id from the list
    const id = cipObserverHelper.getId(target);
    if (_observerIds.includes(id)) {
        const index = _observerIds.indexOf(id);
        if (index >= 0) {
            _observerIds.splice(index, 1);
        }
    }
};

cipObserverHelper.detectURLChange = function() {
    if (_documentURL !== document.location.href) {
        _documentURL = document.location.href;
        cipEvents.clearCredentials();
        cip.initCredentialFields(true);
    }
};

MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

// Detects DOM changes in the document
let observer = new MutationObserver(function(mutations, observer) {
    if (document.visibilityState === 'hidden') {
        return;
    }

    for (const mut of mutations) {
        // Skip text nodes
        if (mut.target.nodeType === Node.TEXT_NODE) {
            continue;
        }

        // Check document URL change and detect new fields
        cipObserverHelper.detectURLChange();

        // Handle attributes only if CSS display is modified
        if (mut.type === 'attributes') {
            const newValue = mut.target.getAttribute(mut.attributeName);
            if (newValue && (newValue.includes('display') || newValue.includes('z-index'))) {
                if (mut.target.style.display !== 'none') {
                    cipObserverHelper.handleObserverAdd(mut.target);
                } else {
                    cipObserverHelper.handleObserverRemove(mut.target);
                }
            }
        } else if (mut.type === 'childList') {
            cipObserverHelper.handleObserverAdd((mut.addedNodes.length > 0) ? mut.addedNodes[0] : mut.target);
            cipObserverHelper.handleObserverRemove((mut.removedNodes.length > 0) ? mut.removedNodes[0] : mut.target);
        }
    }
});

// define what element should be observed by the observer
// and what types of mutations trigger the callback
observer.observe(document, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
    attributeFilter: ['style']
});


var cip = {};
cip.settings = {};
cip.u = null;
cip.p = null;
cip.url = null;
cip.submitUrl = null;
cip.credentials = [];

jQuery(function() {
    cip.init();
});

cip.init = function() {
    browser.runtime.sendMessage({
        action: 'load_settings',
    }).then((response) => {
        cip.settings = response;
        cip.initCredentialFields();
    });
};

// Switch credentials if database is changed or closed
cip.detectDatabaseChange = function(response) {
    if (document.visibilityState !== 'hidden') {
        if (response.new === '' && response.old !== '') {
            cipEvents.clearCredentials();

            browser.runtime.sendMessage({
                action: 'page_clear_logins'
            });

            // Switch back to default popup
            browser.runtime.sendMessage({
                action: 'get_status',
                args: [ true ]    // Set polling to true, this is an internal function call
            });
        } else if (response.new !== '' && response.new !== response.old) {
            _called.retrieveCredentials = false;
            browser.runtime.sendMessage({
                action: 'load_settings',
            }).then((response) => {
                cip.settings = response;
                cip.initCredentialFields(true);

                // If user has requested a manual fill through context menu the actual credential filling
                // is handled here when the opened database has been regognized. It's not a pretty hack.
                if (_called.manualFillRequested && _called.manualFillRequested !== 'none') {
                    cip.fillInFromActiveElement(false, _called.manualFillRequested === 'pass');
                    _called.manualFillRequested = 'none';
                }
            });
        }
    }
};

cip.initCredentialFields = function(forceCall) {
    if (_called.initCredentialFields && !forceCall) {
        return;
    }
    _called.initCredentialFields = true;

    browser.runtime.sendMessage({ 'action': 'page_clear_logins', args: [_called.clearLogins] }).then(() => {
        _called.clearLogins = true;

        // Check site preferences
        cip.initializeSitePreferences();
        if (cip.settings.sitePreferences) {
            for (const site of cip.settings.sitePreferences) {
                if (site.url === document.location.href || siteMatch(site.url, document.location.href)) {
                    if (site.ignore === IGNORE_FULL) {
                        return;
                    }

                    _singleInputEnabledForPage = site.usernameOnly;
                }
            }
        }
        
        const inputs = cipFields.getAllFields();
        if (inputs.length === 0) {
            return;
        }

        cipFields.prepareVisibleFieldsWithID('select');
        cip.initPasswordGenerator(inputs);

        if (!cipFields.useDefinedCredentialFields()) {
            // get all combinations of username + password fields
            cipFields.combinations = cipFields.getAllCombinations(inputs);
        }
        cipFields.prepareCombinations(cipFields.combinations);

        if (cipFields.combinations.length === 0 && inputs.length === 0) {
            browser.runtime.sendMessage({
                action: 'show_default_browseraction'
            });
            return;
        }

        cip.url = document.location.origin;
        cip.submitUrl = cip.getFormActionUrl(cipFields.combinations[0]);

        // Get submitUrl for a single input
        if (_singleInputEnabledForPage && !cip.submitUrl && cipFields.combinations.length === 1 && inputs.length === 1) {
            cip.submitUrl = cip.getFormActionUrlFromSingleInput(inputs[0]);
        }

        if (cip.settings.autoRetrieveCredentials && _called.retrieveCredentials === false && (cip.url && cip.submitUrl)) {
            _called.retrieveCredentials = true;
            browser.runtime.sendMessage({
                action: 'retrieve_credentials',
                args: [ cip.url, cip.submitUrl ]
            }).then(cip.retrieveCredentialsCallback).catch((e) => {
                console.log(e);
            });
        } else if (_singleInputEnabledForPage) {
            cip.preparePageForMultipleCredentials(cip.credentials);
        }
    });
};

cip.initPasswordGenerator = function(inputs) {
    if (cip.settings.usePasswordGenerator) {
        cipPassword.init();

        for (let i = 0; i < inputs.length; i++) {
            if (inputs[i] && inputs[i].attr('type') && inputs[i].attr('type').toLowerCase() === 'password') {
                cipPassword.initField(inputs[i], inputs, i);
            }
        }
    }
};

cip.receiveCredentialsIfNecessary = function() {
    return new Promise((resolve, reject) => {
        if (cip.credentials.length === 0 && _called.retrieveCredentials === false) {
            browser.runtime.sendMessage({
                action: 'retrieve_credentials',
                args: [ cip.url, cip.submitUrl, false, true ] // Sets triggerUnlock to true
            }).then((credentials) => {
                // If the database was locked, this is scope never met. In these cases the response is met at cip.detectDatabaseChange
                _called.manualFillRequested = 'none';
                cip.retrieveCredentialsCallback(credentials, false);
                resolve(credentials);
            });
        } else {
            resolve(cip.credentials);
        }
    });
};

cip.retrieveCredentialsCallback = function(credentials, dontAutoFillIn) {
    if (cipFields.combinations.length > 0) {
        cip.u = _f(cipFields.combinations[0].username);
        cip.p = _f(cipFields.combinations[0].password);
    }

    if (credentials && credentials.length > 0) {
        cip.credentials = credentials;
        cip.prepareFieldsForCredentials(!Boolean(dontAutoFillIn));
        _called.retrieveCredentials = true;
    }
};

cip.prepareFieldsForCredentials = function(autoFillInForSingle) {
    // only one login for this site
    if (autoFillInForSingle && cip.settings.autoFillSingleEntry && cip.credentials.length === 1) {
        let combination = null;
        if (!cip.p && !cip.u && cipFields.combinations.length > 0) {
            cip.u = _f(cipFields.combinations[0].username);
            cip.p = _f(cipFields.combinations[0].password);
            combination = cipFields.combinations[0];
        }
        if (cip.u) {
            cip.setValueWithChange(cip.u, cip.credentials[0].login);
            combination = cipFields.getCombination('username', cip.u);
        }
        if (cip.p) {
            cip.setValueWithChange(cip.p, cip.credentials[0].password);
            combination = cipFields.getCombination('password', cip.p);
        }

        if (combination) {
            let list = [];
            if (cip.fillInStringFields(combination.fields, cip.credentials[0].stringFields, list)) {
                cipForm.destroy(false, {'password': list.list[0], 'username': list.list[1]});
            }
        }

        // generate popup-list of usernames + descriptions
        browser.runtime.sendMessage({
            action: 'popup_login',
            args: [[cip.credentials[0].login + ' (' + cip.credentials[0].name + ')']]
        });
    }
    //multiple logins for this site
    else if (cip.credentials.length > 1 || (cip.credentials.length > 0 && (!cip.settings.autoFillSingleEntry || !autoFillInForSingle))) {
        cip.preparePageForMultipleCredentials(cip.credentials);
    }
};

cip.preparePageForMultipleCredentials = function(credentials) {
    // add usernames + descriptions to autocomplete-list and popup-list
    let usernames = [];
    cipAutocomplete.elements = [];
    let visibleLogin;
    for (let i = 0; i < credentials.length; i++) {
        visibleLogin = (credentials[i].login.length > 0) ? credentials[i].login : tr('credentialsNoUsername');
        usernames.push(visibleLogin + ' (' + credentials[i].name + ')');
        const item = {
            label: visibleLogin + ' (' + credentials[i].name + ')',
            value: credentials[i].login,
            loginId: i
        };
        cipAutocomplete.elements.push(item);
    }

    // generate popup-list of usernames + descriptions
    browser.runtime.sendMessage({
        action: 'popup_login',
        args: [usernames]
    });

    // initialize autocomplete for username fields
    if (cip.settings.autoCompleteUsernames) {
        for (const i of cipFields.combinations) {
            // Both username and password fields are visible
            if (_detectedFields >= 2) {
                if (_f(i.username)) {
                    cipAutocomplete.init(_f(i.username));
                }
            } else if (_detectedFields == 1) {
                if (_f(i.username)) {
                    cipAutocomplete.init(_f(i.username));
                }
                if (_f(i.password)) {
                    cipAutocomplete.init(_f(i.password));
                }
            }
        }
    }
};

cip.getFormActionUrl = function(combination) {
    if (!combination) {
        return null;
    }

    const field = _f(combination.password) || _f(combination.username);

    if (field === null) {
        return null;
    }

    const form = field.closest('form');
    let action = null;

    if (form && form.length > 0) {
        action = form[0].action;
    }

    if (typeof(action) !== 'string' || action === '') {
        action = document.location.origin + document.location.pathname;
    }

    return action;
};

cip.getFormActionUrlFromSingleInput = function(field) {
    if (!field) {
        return null;
    }

    let action = field.formAction;

    if (typeof(action) !== 'string' || action === '') {
        action = document.location.origin + document.location.pathname;
    }

    return action;
};

cip.fillInCredentials = function(combination, onlyPassword, suppressWarnings) {
    const action = cip.getFormActionUrl(combination);

    const u = _f(combination.username);
    const p = _f(combination.password);

    if (combination.isNew) {
        // initialize form-submit for remembering credentials
        const fieldId = combination.password || combination.username;
        const field = _f(fieldId);
        if (field) {
            const form2 = field.closest('form');
            if (form2 && form2.length > 0) {
                cipForm.init(form2, combination);
            }
        }
    }

    if (u) {
        cip.u = u;
    }
    if (p) {
        cip.p = p;
    }

    if (cip.url === document.location.origin && cip.submitUrl === action && cip.credentials.length > 0) {
        cip.fillIn(combination, onlyPassword, suppressWarnings);
    }
    else {
        cip.url = document.location.origin;
        cip.submitUrl = action;

        browser.runtime.sendMessage({
            action: 'retrieve_credentials',
            args: [ cip.url, cip.submitUrl, false, true ]
        }).then((credentials) => {
            cip.retrieveCredentialsCallback(credentials, true);
            cip.fillIn(combination, onlyPassword, suppressWarnings);
        });
    }
};

cip.fillInFromActiveElement = function(suppressWarnings, passOnly = false) {
    const el = document.activeElement;
    if (el.tagName.toLowerCase() !== 'input') {
        if (cipFields.combinations.length > 0) {
            cip.fillInCredentials(cipFields.combinations[0], false, suppressWarnings);
        }
        return;
    }

    cipFields.setUniqueId(jQuery(el));
    const fieldId = cipFields.prepareId(jQuery(el).attr('data-cip-id'));
    let combination = null;
    if ($(el).attr('type') === 'password') {
        combination = cipFields.getCombination('password', fieldId);
    }
    else {
        combination = cipFields.getCombination('username', fieldId);
    }

    if (passOnly) {
        if (!_f(combination.password)) {
            const message = tr('fieldsNoPasswordField');
            browser.runtime.sendMessage({
                action: 'show_notification',
                args: [message]
            });
            return;
        }
    }

    delete combination.loginId;

    cip.fillInCredentials(combination, passOnly, suppressWarnings);
};

cip.fillInFromActiveElementTOTPOnly = function(suppressWarnings) {
    const el = document.activeElement;
    cipFields.setUniqueId(jQuery(el));
    const fieldId = cipFields.prepareId(jQuery(el).attr('data-cip-id'));

    browser.runtime.sendMessage({
        action: 'page_get_login_id'
    }).then((pos) => {
        if (pos >= 0 && cip.credentials[pos]) {
            // Check the value from stringFields (to be removed)
            const currentField = _fs(fieldId);
            if (cip.credentials[pos].stringFields && cip.credentials[pos].stringFields.length > 0) {
                const stringFields = cip.credentials[pos].stringFields;
                for (const s of stringFields) {
                    const val = s["KPH: {TOTP}"];
                    if (val) {
                        cip.setValue(currentField, val);
                    }
                }
            } else if (cip.credentials[pos].totp && cip.credentials[pos].totp.length > 0) {
                cip.setValue(currentField, cip.credentials[pos].totp);
            }
        }
    });    
};

cip.setValue = function(field, value) {
    if (field.is('select')) {
        value = value.toLowerCase().trim();
        jQuery('option', field).each(function() {
            if (jQuery(this).text().toLowerCase().trim() === value) {
                cip.setValueWithChange(field, jQuery(this).val());
                return false;
            }
        });
    }
    else {
        cip.setValueWithChange(field, value);
        field.trigger('input');
    }
};

cip.fillInStringFields = function(fields, stringFields, filledInFields) {
    let filledIn = false;

    filledInFields.list = [];
    if (fields && stringFields && fields.length > 0 && stringFields.length > 0) {
        for (let i = 0; i < fields.length; i++) {
            const currentField = _fs(fields[i]);
            const stringFieldValue = Object.values(stringFields[i]);
            if (currentField && stringFieldValue[0]) {
                cip.setValue(currentField, stringFieldValue[0]);
                filledInFields.list.push(fields[i]);
                filledIn = true;
            }
        }
    }

    return filledIn;
};

cip.setValueWithChange = function(field, value) {
    if (cip.settings.respectMaxLength === true) {
        const attribute_maxlength = field.attr('maxlength');
        if (attribute_maxlength && !isNaN(attribute_maxlength) && attribute_maxlength > 0) {
            value = value.substr(0, attribute_maxlength);
        }
    }

    field.val(value);
    field[0].dispatchEvent(new Event('input', {'bubbles': true}));
    field[0].dispatchEvent(new Event('change', {'bubbles': true}));
};

cip.fillIn = function(combination, onlyPassword, suppressWarnings) {
    // no credentials available
    if (cip.credentials.length === 0 && !suppressWarnings) {
        const message = tr('credentialsNoLoginsFound');
        browser.runtime.sendMessage({
            action: 'show_notification',
            args: [message]
        });
        return;
    }

    const uField = _f(combination.username);
    const pField = _f(combination.password);

    // exactly one pair of credentials available
    if (cip.credentials.length === 1) {
        let filledIn = false;
        if (uField && (!onlyPassword || _singleInputEnabledForPage)) {
            cip.setValueWithChange(uField, cip.credentials[0].login);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [0]
            });
            filledIn = true;
        }
        if (pField) {
            pField.attr('type', 'password');
            cip.setValueWithChange(pField, cip.credentials[0].password);
            pField.data('unchanged', true);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [0]
            });
            filledIn = true;
        }

        let list = [];
        if (cip.fillInStringFields(combination.fields, cip.credentials[0].stringFields, list)) {
            cipForm.destroy(false, {'password': list.list[0], 'username': list.list[1]});
            filledIn = true;
        }

        if (!filledIn) {
            if (!suppressWarnings) {
                const message = tr('fieldsFill');
                browser.runtime.sendMessage({
                    action: 'show_notification',
                    args: [message]
                });
            }
        }
    }
    // specific login id given
    else if (combination.loginId !== undefined && cip.credentials[combination.loginId]) {
        let filledIn = false;
        if (uField) {
            cip.setValueWithChange(uField, cip.credentials[combination.loginId].login);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [combination.loginId]
            });
            filledIn = true;
        }

        if (pField) {
            cip.setValueWithChange(pField, cip.credentials[combination.loginId].password);
            pField.data('unchanged', true);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [combination.loginId]
            });
            filledIn = true;
        }

        let list = [];
        if (cip.fillInStringFields(combination.fields, cip.credentials[combination.loginId].stringFields, list)) {
            cipForm.destroy(false, {'password': list.list[0], 'username': list.list[1]});
            filledIn = true;
        }

        if (!filledIn) {
            if (!suppressWarnings) {
                const message = tr('fieldsFill');
                browser.runtime.sendMessage({
                    action: 'show_notification',
                    args: [message]
                });
            }
        }
    }
    // multiple credentials available
    else {
        // check if only one password for given username exists
        let countPasswords = 0;

        if (uField) {
            let valPassword = '';
            let valUsername = '';
            let valStringFields = [];
            const valQueryUsername = uField.val().toLowerCase();

            // find passwords to given username (even those with empty username)
            for (const c of cip.credentials) {
                if (c.login.toLowerCase() === valQueryUsername) {
                    countPasswords += 1;
                    valPassword = c.password;
                    valUsername = c.login;
                    valStringFields = c.stringFields;
                }
            }

            // for the correct notification message: 0 = no logins, X > 1 = too many logins
            if (countPasswords === 0) {
                countPasswords = cip.credentials.length;
            }

            // only one mapping username found
            if (countPasswords === 1) {
                if (!onlyPassword) {
                    cip.setValueWithChange(uField, valUsername);
                }

                if (pField) {
                    cip.setValueWithChange(pField, valPassword);
                    pField.data('unchanged', true);
                }

                let list = [];
                if (cip.fillInStringFields(combination.fields, valStringFields, list)) {
                    cipForm.destroy(false, {'password': list.list[0], 'username': list.list[1]});
                }
            }

            // user has to select correct credentials by himself
            if (countPasswords > 1) {
                if (!suppressWarnings) {
                    const $target = onlyPassword ? pField : uField;
                    cipAutocomplete.init($target);
                    $target.focus();
                    jQuery($target).autocomplete('search', jQuery($target).val());
                }
            }
            else if (countPasswords < 1) {
                if (!suppressWarnings) {
                    const message = tr('credentialsNoUsernameFound');
                    browser.runtime.sendMessage({
                        action: 'show_notification',
                        args: [message]
                    });
                }
            }
        }
        else {
            if (!suppressWarnings) {
                const $target = onlyPassword ? pField : uField;
                cipAutocomplete.init($target);
                $target.focus();
                jQuery($target).autocomplete('search', jQuery($target).val());
            }
        }
    }
};

cip.contextMenuRememberCredentials = function() {
    const el = document.activeElement;
    if (el.tagName.toLowerCase() !== 'input') {
        return;
    }

    cipFields.setUniqueId(jQuery(el));
    const fieldId = cipFields.prepareId(jQuery(el).attr('data-cip-id'));
    let combination = null;
    if ($(el).attr('type') === 'password') {
        combination = cipFields.getCombination('password', fieldId);
    }
    else {
        combination = cipFields.getCombination('username', fieldId);
    }

    let usernameValue = '';
    let passwordValue = '';

    const usernameField = _f(combination.username);
    const passwordField = _f(combination.password);

    if (usernameField) {
        usernameValue = usernameField.val();
    }
    if (passwordField) {
        passwordValue = passwordField.val();
    }

    if (!cip.rememberCredentials(usernameValue, passwordValue)) {
        const message = tr('rememberNothingChanged');
        browser.runtime.sendMessage({
            action: 'show_notification',
            args: [message]
        });
    }
};

cip.rememberCredentials = function(usernameValue, passwordValue) {
    // no password given or field cleaned by a site-running script
    // --> no password to save
    if (passwordValue === '') {
        return false;
    }

    let usernameExists = false;
    let nothingChanged = false;

    for (const c of cip.credentials) {
        if (c.login === usernameValue && c.password === passwordValue) {
            nothingChanged = true;
            break;
        }

        if (c.login === usernameValue) {
            usernameExists = true;
        }
    }

    if (!nothingChanged) {
        if (!usernameExists) {
            for (const c of cip.credentials) {
                if (c.login === usernameValue) {
                    usernameExists = true;
                    break;
                }
            }
        }
        let credentialsList = [];
        for (const c of cip.credentials) {
            credentialsList.push({
                login: c.login,
                name: c.name,
                uuid: c.uuid
            });
        }

        let url = jQuery(this)[0].action;
        if (!url) {
            url = cip.getDocumentLocation();
            if (url.indexOf('?') > 0) {
                url = url.substring(0, url.indexOf('?'));
                if (url.length < document.location.origin.length) {
                    url = document.location.origin;
                }
            }
        }

        browser.runtime.sendMessage({
            action: 'set_remember_credentials',
            args: [usernameValue, passwordValue, url, usernameExists, credentialsList]
        });

        return true;
    }

    return false;
};

cip.ignoreSite = function(sites) {
    if (!sites || sites.length === 0) {
        return;
    }

    let site = sites[0];
    cip.initializeSitePreferences();

    if (slashNeededForUrl(site)) {
        site += '/';
    }

    // Check if the site already exists
    let siteExists = false;
    for (const existingSite of cip.settings['sitePreferences']) {
        if (existingSite.url === site) {
            existingSite.ignore = IGNORE_NORMAL;
            siteExists = true;
        }
    }

    if (!siteExists) {
        cip.settings['sitePreferences'].push({
            url: site,
            ignore: IGNORE_NORMAL,
            usernameOnly: false
        });
    }

    browser.runtime.sendMessage({
        action: 'save_settings',
        args: [cip.settings]
    });
};

 // Delete previously created Object if it exists. It will be replaced by an Array
cip.initializeSitePreferences = function() {
    if (cip.settings['sitePreferences'] !== undefined && cip.settings['sitePreferences'].constructor === Object) {
        delete cip.settings['sitePreferences'];
    }

    if (!cip.settings['sitePreferences']) {
        cip.settings['sitePreferences'] = [];
    }
};

cip.getDocumentLocation = function() {
    return cip.settings.saveDomainOnly ? document.location.origin : document.location.href;
};

var cipEvents = {};

cipEvents.clearCredentials = function() {
    cip.credentials = [];
    cipAutocomplete.elements = [];
    _called.retrieveCredentials = false;

    if (cip.settings.autoCompleteUsernames) {
        for (const c of cipFields.combinations) {
            const uField = _f(c.username);
            if (uField) {
                if (uField.hasClass('ui-autocomplete-input')) {
                    uField.autocomplete('destroy');
                }
            }
        }
    }
};

cipEvents.triggerActivatedTab = function() {
    // doesn't run a second time because of _called.initCredentialFields set to true
    cip.init();
    $(this.target).find('input').autocomplete();

    // initCredentialFields calls also "retrieve_credentials", to prevent it
    // check of init() was already called
    if (_called.initCredentialFields && (cip.url && cip.submitUrl) && cip.settings.autoRetrieveCredentials) {
        browser.runtime.sendMessage({
            action: 'retrieve_credentials',
            args: [ cip.url, cip.submitUrl ]
        }).then(cip.retrieveCredentialsCallback).catch((e) => {
            console.log(e);
        });
    }
};
