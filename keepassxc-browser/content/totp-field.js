'use strict';

const MINIMUM_SIZE = 60;
const ignoreRegex = /(zip|postal).*code/i;
const ignoredTypes = [ 'email', 'password', 'username' ];

var kpxcTOTPIcons = {};
kpxcTOTPIcons.icons = [];

kpxcTOTPIcons.newIcon = function(field, databaseClosed = true) {
    kpxcTOTPIcons.icons.push(new TOTPFieldIcon(field, databaseClosed));
};

kpxcTOTPIcons.switchIcon = function(locked) {
    kpxcTOTPIcons.icons.forEach(u => u.switchIcon(locked));
};


class TOTPFieldIcon extends Icon {
    constructor(field, databaseClosed = true) {
        super();
        this.icon = null;
        this.inputField = null;
        this.databaseClosed = databaseClosed;

        this.initField(field);
        kpxcUI.monitorIconPosition(this);
    }
}

TOTPFieldIcon.prototype.initField = function(field) {
    if (!field
        || ignoredTypes.some(t => t === field.type)
        || field.getAttribute('kpxc-totp-field') === 'true'
        || field.offsetWidth < MINIMUM_SIZE
        || field.size < 2
        || (field.maxLength > 0 && (field.maxLength < 6 || field.maxLength > 8))
        || field.id.match(ignoreRegex)
        || field.name.match(ignoreRegex)) {
        return;
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
    let offset = Math.floor((field.offsetHeight - size) / 3);
    offset = (offset < 0) ? 0 : offset;

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

    if (this.databaseClosed) {
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
