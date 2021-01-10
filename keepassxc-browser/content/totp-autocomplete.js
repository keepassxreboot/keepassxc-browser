'use strict';

class TOTPAutocomplete extends Autocomplete {}
TOTPAutocomplete.prototype.click = async function(e, input) {
    if (!e.isTrusted) {
        return;
    }

    await kpxc.updateTOTPList();
    this.showList(input, true);
};

TOTPAutocomplete.prototype.itemClick = async function(e, item, input, uuid) {
    if (!e.isTrusted) {
        return;
    }

    const index = Array.prototype.indexOf.call(e.currentTarget.parentElement.childNodes, e.currentTarget);
    this.fillTotp(index, uuid);

    this.closeList();
    input.focus();
};

TOTPAutocomplete.prototype.itemEnter = async function(index, elements) {
    this.fillTotp(index, elements[index].uuid);
};

TOTPAutocomplete.prototype.fillTotp = async function(index, uuid) {
    const combination = await kpxcFields.getCombination(this.input);
    combination.loginId = index;
    kpxc.fillTOTPFromUuid(this.input, uuid);
};

const kpxcTOTPAutocomplete = new TOTPAutocomplete();
