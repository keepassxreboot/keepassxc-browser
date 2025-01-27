'use strict';

class CredentialAutocomplete extends Autocomplete {}
CredentialAutocomplete.prototype.click = async function(e) {
    if (!e.isTrusted) {
        return;
    }

    e.stopPropagation();

    const field = this.autocompleteList.find(a => a === e.target);
    if (field) {
        await this.showList(field);
        this.updateSearch();
    }
};

CredentialAutocomplete.prototype.itemClick = async function(e, input, uuid) {
    if (!e.isTrusted) {
        return;
    }

    e.stopPropagation();

    const index = Array.prototype.indexOf.call(e.currentTarget.parentElement.childNodes, e.currentTarget);
    const usernameValue = e.currentTarget.getElementsByTagName('input')[0]?.value;
    await this.fillPassword(usernameValue, index, uuid);

    this.closeList();
    input.focus();
};

CredentialAutocomplete.prototype.itemEnter = async function(index, item) {
    const usernameValue = item?.getElementsByTagName('input')[0].value;
    const uuid = item?.getAttribute('uuid');
    this.fillPassword(usernameValue, index, uuid);
};

CredentialAutocomplete.prototype.fillPassword = async function(value, index, uuid) {
    const combination = await kpxcFields.getCombination(this.input);
    combination.loginId = index;

    await sendMessage('page_set_login_id', uuid);

    const manualFill = await sendMessage('page_get_manual_fill');
    await kpxcFill.fillInCredentials(combination, value, uuid, manualFill === ManualFill.PASSWORD);
};

const kpxcUserAutocomplete = new CredentialAutocomplete();
