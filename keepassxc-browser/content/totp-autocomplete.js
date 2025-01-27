'use strict';

class TOTPAutocomplete extends Autocomplete {}
TOTPAutocomplete.prototype.click = async function(e, input) {
    if (!e.isTrusted) {
        return;
    }

    await kpxc.updateTOTPList();
    this.showList(input, true);
};

TOTPAutocomplete.prototype.itemClick = async function(e, input, uuid) {
    if (!e.isTrusted) {
        return;
    }

    const index = Array.prototype.indexOf.call(e.currentTarget.parentElement.childNodes, e.currentTarget);
    await this.fillTotp(index, uuid, input);

    this.closeList();
    input.focus();
};

TOTPAutocomplete.prototype.itemEnter = async function(index, item) {
    const uuid = item?.getAttribute('uuid');
    this.fillTotp(index, uuid);
};

TOTPAutocomplete.prototype.fillTotp = async function(index, uuid, currentInput) {
    const combination = await kpxcFields.getCombination(this.input, 'totp')
                     || await kpxcFields.getCombination(this.input, 'totpInputs');
    if (combination) {
        combination.loginId = index;
    }

    kpxcFill.fillTOTPFromUuid(this.input || currentInput, uuid);
};

const kpxcTOTPAutocomplete = new TOTPAutocomplete();
