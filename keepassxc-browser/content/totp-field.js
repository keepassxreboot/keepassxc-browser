'use strict';

const MINIMUM_SIZE = 60;
const ignoreRegex = /(zip|postal).*code/i;
const ignoredTypes = [ 'email', 'password', 'username' ];

var kpxcTOTPIcons = {};
kpxcTOTPIcons.icons = [];

kpxcTOTPIcons.newIcon = function(field, databaseState = DatabaseState.DISCONNECTED, forced = false) {
    kpxcTOTPIcons.icons.push(new TOTPFieldIcon(field, databaseState, forced));
};

kpxcTOTPIcons.switchIcon = function(state) {
    kpxcTOTPIcons.icons.forEach(u => u.switchIcon(state));
};


class TOTPFieldIcon extends Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED, forced = false) {
        super();
        this.icon = null;
        this.inputField = null;
        this.databaseState = databaseState;

        this.initField(field, forced);
        kpxcUI.monitorIconPosition(this);
    }
}

TOTPFieldIcon.prototype.initField = function(field, forced) {
    if (!field) {
        return;
    }

    if (!forced) {
        if (ignoredTypes.some(t => t === field.type)
            || ignoredTypes.some(t => t === field.autocomplete)
            || field.getAttribute('kpxc-totp-field') === 'true'
            || (field.hasAttribute('kpxc-defined') && field.getAttribute('kpxc-defined') !== 'totp')
            || field.offsetWidth < MINIMUM_SIZE
            || field.size < 2
            || (field.maxLength > 0 && (field.maxLength < 6 || field.maxLength > 8))
            || field.id.match(ignoreRegex)
            || field.name.match(ignoreRegex)
            || field.readOnly) {
            return;
        }
    } else {
        if (field.getAttribute('kpxc-totp-field') === 'true') {
            return;
        }
    }

    field.setAttribute('kpxc-totp-field', 'true');

    // Observer the visibility
    if (this.observer) {
        this.observer.observe(field);
    }

    this.createIcon(field);
    this.inputField = field;
};

TOTPFieldIcon.prototype.createIcon = function(field) {
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
    }

    icon.addEventListener('click', async function(e) {
        if (!e.isTrusted) {
            return;
        }

        e.preventDefault();
        await kpxc.receiveCredentialsIfNecessary();
        kpxc.fillInFromActiveElementTOTPOnly(field);
    });

    kpxcUI.setIconPosition(icon, field);
    this.icon = icon;

    const styleSheet = document.createElement('link');
    styleSheet.setAttribute('rel', 'stylesheet');
    styleSheet.setAttribute('href', browser.runtime.getURL('css/totp.css'));

    const wrapper = document.createElement('div');
    this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    this.shadowRoot.append(styleSheet);
    this.shadowRoot.append(icon);
    document.body.append(wrapper);
};
