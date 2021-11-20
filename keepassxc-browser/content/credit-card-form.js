'use strict';

const cardNameRegex = /(cc|card|cardholder).*-name|name/i;
const cardNumberRegex = /(cc|card).*-(num|number|no)|number|card-no/i;
const cardTypeRegex = /(cc|card|cb).*-type|brand/i;
const cardCCVRegex = /(cc|card|security|verification).*-(code|cvv|cvc|csc)|cvv|cvc|csc/i;
const cardExpirationRegex = /(cc|card).*-(exp|expiry|mm-yy|mm-yyyy)|expiration-date/i;
const cardExpirationMonthRegex = /(cc-exp|card-exp|card-expiration|card-expire|expire|expiry).*-(month|mm|mo)/i;
const cardExpirationYearRegex = /(cc-exp|card-exp|card-expiration|card-expire|expire|expiry).*-(year|yr|yy|yyyy)/i;

var kpxcCCIcons = {};
kpxcCCIcons.icons = [];

kpxcCCIcons.ccForm = {
    ccName: undefined,
    ccNumber: undefined,
    ccExpMonth: undefined,
    ccExpYear: undefined,
    ccExp: undefined,
    ccType: undefined,
    ccCcv: undefined
};

kpxcCCIcons.newIcon = function(field, databaseState = DatabaseState.DISCONNECTED) {
    kpxcCCIcons.icons.push(new CCFieldIcon(field, databaseState));
};

kpxcCCIcons.switchIcon = function(state) {
    kpxcCCIcons.icons.forEach(u => u.switchIcon(state));
};

kpxcCCIcons.deleteHiddenIcons = function() {
    kpxcUI.deleteHiddenIcons(kpxcCCIcons.icons, 'kpxc-totp-field');
};

kpxcCCIcons.regexMatch = function(field, regex) {
    const id = field.getLowerCaseAttribute('id');
    const name = field.getLowerCaseAttribute('name');
    const autocomplete = field.getLowerCaseAttribute('autocomplete');
    const placeholder = field.getLowerCaseAttribute('placeholder');

    if ((id && id.match(regex))
        || (name && name.match(regex))
        || (autocomplete && autocomplete.match(regex))
        || (placeholder && placeholder.match(regex))) {
        return true;
    }

    return false;
};

kpxcCCIcons.detectCreditCardForm = function(field, allInputs) {
    if (!field || !allInputs || allInputs.length === 0) {
        return false;
    }

    kpxcCCIcons.ccForm.ccName = allInputs.find(i => kpxcCCIcons.regexMatch(i, cardNameRegex));
    kpxcCCIcons.ccForm.ccNumber = allInputs.find(i => kpxcCCIcons.regexMatch(i, cardNumberRegex));
    kpxcCCIcons.ccForm.ccExpMonth = allInputs.find(i => kpxcCCIcons.regexMatch(i, cardExpirationMonthRegex));
    kpxcCCIcons.ccForm.ccExpYear = allInputs.find(i => kpxcCCIcons.regexMatch(i, cardExpirationYearRegex));
    kpxcCCIcons.ccForm.ccExp = allInputs.find(i => kpxcCCIcons.regexMatch(i, cardExpirationRegex));
    kpxcCCIcons.ccForm.ccType = allInputs.find(i => kpxcCCIcons.regexMatch(i, cardTypeRegex));
    kpxcCCIcons.ccForm.ccCcv = allInputs.find(i => kpxcCCIcons.regexMatch(i, cardCCVRegex));

    if (!kpxcCCIcons.ccForm.ccName || !kpxcCCIcons.ccForm.ccCcv) {
        return false;
    }

    console.log(kpxcCCIcons.ccForm);

    return true;
};

// TODO: Adjust this function. Do we need a regex checks here? Those are also used the function above,
// so this function could just be a raw check.
kpxcCCIcons.isValid = function(field, forced) {
    if (!forced) {
        if (ignoredTypes.some(t => t === field.type)
            || field.offsetWidth < MIN_INPUT_FIELD_OFFSET_WIDTH
            || field.size < 2
            || ignoredTypes.some(t => t === field.autocomplete)
            || field.readOnly
            || field.inputMode === 'email'
            || field.getAttribute('kpxc-totp-field') === 'true') {
            return false;
        }
    }

    return true;
};

class CCFieldIcon extends Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED) {
        super(field, databaseState);

        this.initField(field);
        kpxcUI.monitorIconPosition(this);
    }
}

CCFieldIcon.prototype.initField = function(field) {
    // Observer the visibility
    if (this.observer) {
        this.observer.observe(field);
    }

    this.createIcon(field);
    this.inputField = field;
};

CCFieldIcon.prototype.createIcon = function(field, segmented = false) {
    const className = (isFirefox() ? 'moz' : 'default');

    // Size the icon dynamically, but not greater than 24 or smaller than 14
    const size = Math.max(Math.min(24, field.offsetHeight - 4), 14);
    const offset = kpxcUI.calculateIconOffset(field, size);

    const icon = kpxcUI.createElement('div', 'kpxc kpxc-cc-icon ' + className,
        {
            'title': tr('ccFieldText'),
            'alt': tr('ccFieldIcon'),
            'size': size,
            'offset': offset
        });
    icon.style.zIndex = '10000000';
    icon.style.width = Pixels(size);
    icon.style.height = Pixels(size);

    if (this.databaseState === DatabaseState.DISCONNECTED || this.databaseState === DatabaseState.LOCKED) {
        icon.style.filter = 'saturate(0%)';
    }

    icon.addEventListener('click', async function(e) {
        if (!e.isTrusted) {
            return;
        }

        e.stopPropagation();
        await kpxc.receiveCredentialsIfNecessary();
        kpxcFill.fillFromCreditCardForm(field);
    });

    icon.addEventListener('mousedown', ev => ev.stopPropagation());
    icon.addEventListener('mouseup', ev => ev.stopPropagation());

    kpxcUI.setIconPosition(icon, field, this.rtl, segmented);
    this.icon = icon;

    const styleSheet = createStylesheet('css/credit-card.css');
    const wrapper = document.createElement('div');

    this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    this.shadowRoot.append(styleSheet);
    this.shadowRoot.append(icon);
    document.body.append(wrapper);
};
