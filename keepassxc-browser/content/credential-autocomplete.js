'use strict';

class CredentialAutocomplete extends Autocomplete {}
CredentialAutocomplete.prototype.click = async function(e, input) {
    if (!e.isTrusted) {
        return;
    }

    e.stopPropagation();

    if (input.value !== '') {
        input.select();
    }

    const field = this.autocompleteList.find(a => a === input);
    if (field) {
        this.showList(field);
    }
};

CredentialAutocomplete.prototype.itemClick = async function(e, item, input, uuid) {
    if (!e.isTrusted) {
        return;
    }

    e.stopPropagation();

    const index = Array.prototype.indexOf.call(e.currentTarget.parentElement.childNodes, e.currentTarget);
    const usernameValue = item.getElementsByTagName('input')[0].value;
    await this.fillPassword(usernameValue, index, uuid);

    this.closeList();
    input.focus();
};

CredentialAutocomplete.prototype.itemEnter = async function(index, elements) {
    const usernameValue = elements[index].value;
    this.fillPassword(usernameValue, index, elements[index].uuid);
};

CredentialAutocomplete.prototype.fillPassword = async function(value, index, uuid) {
    const combination = await kpxcFields.getCombination(this.input);
    combination.loginId = index;

    await sendMessage('page_set_login_id', uuid);

    const manualFill = await sendMessage('page_get_manual_fill');
    await kpxc.fillInCredentials(combination, value, uuid, manualFill === ManualFill.PASSWORD);
    this.input.setAttribute('fetched', true);
};

const kpxcUserAutocomplete = new CredentialAutocomplete();
