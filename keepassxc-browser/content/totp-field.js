'use strict';

const ignoreRegex = /(bank|coupon|postal|user|zip).*code|comment|author|error/i;
const ignoredTypes = [ 'email', 'password', 'username' ];

const acceptedOTPFields = [
    '2fa',
    '2fpin',
    'auth',
    'challenge',
    'code',
    'idvpin',
    'mfa',
    'one_time_password',
    'otp',
    'token',
    'twofa',
    'two-factor',
    'twofactor',
    'verification_pin'
];

const acceptedParents = [
    '.mfa-verify',
];

var kpxcTOTPIcons = {};
kpxcTOTPIcons.icons = [];

kpxcTOTPIcons.newIcon = function(field, databaseState = DatabaseState.DISCONNECTED, segmented = false) {
    kpxcTOTPIcons.icons.push(new TOTPFieldIcon(field, databaseState, segmented));
};

kpxcTOTPIcons.switchIcon = function(state, uuid) {
    kpxcTOTPIcons.icons.forEach(u => u.switchIcon(state, uuid));
};

kpxcTOTPIcons.deleteHiddenIcons = function() {
    kpxcUI.deleteHiddenIcons(kpxcTOTPIcons.icons, 'kpxc-totp-field');
};

kpxcTOTPIcons.autoCompleteIsOneTimeCode = function(field) {
    if (!field) {
        return false;
    }

    return field.getLowerCaseAttribute('autocomplete') === 'one-time-code';
};

// Quick check for a valid TOTP field
kpxcTOTPIcons.isAcceptedTOTPField = function(field) {
    const id = field.getLowerCaseAttribute('id');
    const name = field.getLowerCaseAttribute('name');
    const placeholder = field.getLowerCaseAttribute('placeholder');

    // Checks if the field id, name or placeholder includes some of the acceptedOTPFields but not any from ignoredTypes
    if ((acceptedOTPFields.some(f => (id && id.includes(f)) || (name && name.includes(f) || placeholder && placeholder.includes(f))) || acceptedParents.some(s => field.closest(s)))
        && !ignoredTypes.some(f => (id && id.includes(f)) || (name && name.includes(f) || placeholder && placeholder.includes(f)))) {
        return true;
    }

    if (kpxcSites.totpExceptionFound(field)) {
        return true;
    }

    return false;
};

kpxcTOTPIcons.isValid = function(field, forced) {
    // Always accept 'one-time-code'
    if (kpxcTOTPIcons.autoCompleteIsOneTimeCode(field)) {
        return true;
    }

    if (!field || !kpxcTOTPIcons.isAcceptedTOTPField(field)) {
        return false;
    }

    if (!forced) {
        if (ignoredTypes.some(t => t === field.type)
            || field.offsetWidth < MIN_INPUT_FIELD_OFFSET_WIDTH
            || field.size < 2
            || (field.maxLength > 0 && (field.maxLength < MIN_TOTP_INPUT_LENGTH || field.maxLength > kpxcSites.expectedTOTPMaxLength()))
            || ignoredTypes.some(t => t === field.autocomplete)
            || field.id.match(ignoreRegex)
            || field.name.match(ignoreRegex)
            || field.placeholder.match(ignoreRegex)
            || field.readOnly
            || field.inputMode === 'email') {
            logDebug('Error: TOTP field found but it is not valid:', field);
            return false;
        }
    } else {
        if (field.getAttribute('kpxc-totp-field') === 'true') {
            return false;
        }
    }

    return true;
};

class TOTPFieldIcon extends Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED, segmented = false) {
        super(field, databaseState, segmented);

        this.initField(field, segmented);
        kpxcUI.monitorIconPosition(this);
    }
}

TOTPFieldIcon.prototype.initField = function(field, segmented) {
    // Observer the visibility
    if (this.observer) {
        this.observer.observe(field);
    }

    this.createIcon(field, segmented);
    this.inputField = field;
};

TOTPFieldIcon.prototype.createIcon = function(field, segmented = false) {
    const className = (isFirefox() ? 'moz' : 'default');

    // Size the icon dynamically, but not greater than 24 or smaller than 14
    const size = Math.max(Math.min(24, field.offsetHeight - 4), 14);
    const offset = kpxcUI.calculateIconOffset(field, size);

    const icon = kpxcUI.createElement('div', 'kpxc kpxc-totp-icon ' + className,
        {
            'title': tr('totpFieldText'),
            'alt': tr('totpFieldIcon'),
            'size': size,
            'offset': offset
        });
    icon.style.zIndex = '10000000';
    icon.style.width = Pixels(size);
    icon.style.height = Pixels(size);

    if (this.databaseState === DatabaseState.DISCONNECTED || this.databaseState === DatabaseState.LOCKED) {
        icon.style.filter = 'saturate(0%)';
    } else {
        icon.style.filter = 'saturate(100%)';
    }

    icon.addEventListener('click', async function(e) {
        if (!e.isTrusted) {
            return;
        }

        e.stopPropagation();
        await kpxc.receiveCredentialsIfNecessary();
        kpxcFill.fillFromTOTP(field);
    });

    icon.addEventListener('mousedown', ev => ev.stopPropagation());
    icon.addEventListener('mouseup', ev => ev.stopPropagation());

    kpxcUI.setIconPosition(icon, field, this.rtl, segmented);
    this.icon = icon;

    const styleSheet = createStylesheet('css/totp.css');
    const wrapper = document.createElement('div');
    wrapper.style.display = 'none';
    styleSheet.addEventListener('load', () => wrapper.style.display = 'block');

    this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    this.shadowRoot.append(styleSheet);
    this.shadowRoot.append(icon);
    document.body.append(wrapper);
};
