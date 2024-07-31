'use strict';

const kpxcPasswordIcons = {};
kpxcPasswordIcons.icons = [];

kpxcPasswordIcons.newIcon = function(field, databaseState = DatabaseState.DISCONNECTED) {
    kpxcPasswordIcons.icons.push(new PasswordIcon(field, databaseState));
};

kpxcPasswordIcons.switchIcon = function(state) {
    kpxcPasswordIcons.icons.forEach(u => u.switchIcon(state));
};

kpxcPasswordIcons.deleteHiddenIcons = function() {
    kpxcUI.deleteHiddenIcons(kpxcPasswordIcons.icons);
};

kpxcPasswordIcons.isValid = function(field) {
    if (!field
        || field.readOnly
        || field.offsetWidth < MIN_INPUT_FIELD_OFFSET_WIDTH
        || kpxcIcons.hasIcon(field)
        || !kpxcFields.isVisible(field)) {
        return false;
    }

    return true;
};


class PasswordIcon extends Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED) {
        super(field, databaseState);
        this.nextFieldExists = false;

        this.initField(field);
        kpxcUI.monitorIconPosition(this);
    }
}

PasswordIcon.prototype.initField = function(field) {
    // Observer the visibility
    if (this.observer) {
        this.observer.observe(field);
    }

    this.createIcon(field);
    this.inputField = field;
};

PasswordIcon.prototype.createIcon = function(field) {
    const className = (isFirefox() ? 'key-moz' : 'key');
    const size = (field.offsetHeight > 28) ? 24 : 16;
    const offset = kpxcUI.calculateIconOffset(field, size);

    const icon = kpxcUI.createElement('div', 'kpxc kpxc-pwgen-icon ' + className,
        {
            'title': tr('passwordGeneratorGenerateText'),
            'size': size,
            'offset': offset,
            'kpxc-pwgen-field-id': field.getAttribute('data-kpxc-id') // Needed?
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
        kpxcPasswordGenerator.showPasswordGenerator(field);
    });

    icon.addEventListener('mousedown', ev => ev.stopPropagation());
    icon.addEventListener('mouseup', ev => ev.stopPropagation());

    kpxcUI.setIconPosition(icon, field, this.rtl);
    this.icon = icon;

    const styleSheet = createStylesheet('css/pwgen.css');
    const wrapper = document.createElement('div');

    this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    this.shadowRoot.append(styleSheet);
    this.shadowRoot.append(icon);
    document.body.append(wrapper);
};


const kpxcPasswordGenerator = {};

kpxcPasswordGenerator.showPasswordGenerator = async function(field) {
    kpxcPasswordGenerator.generate(field ?? document.activeElement);
};

kpxcPasswordGenerator.generate = async function(field) {
    if (!await isPasswordGeneratorSupported()) {
        kpxcUI.createNotification('error', tr('passwordGeneratorNotSupported'));
        return;
    }

    kpxcPasswordGenerator.fill(field, await sendMessage('generate_password'));
};

kpxcPasswordGenerator.fill = function(elem, password) {
    if (!elem || !password) {
        return;
    }

    if (password.length === 0) {
        kpxcUI.createNotification('error', tr('usernameLockedFieldText'));
        return;
    }

    if (elem.getAttribute('maxlength')) {
        if (password.length > elem.getAttribute('maxlength')) {
            const message =
                tr('passwordGeneratorErrorTooLong') +
                '\r\n' +
                tr('passwordGeneratorErrorTooLongCut') +
                '\r\n' +
                tr('passwordGeneratorErrorTooLongRemember');
            message.style.whiteSpace = 'pre';
            kpxcUI.createNotification('error', message);
            return;
        }
    }

    elem.value = password;
    elem.dispatchEvent(new Event('input', { bubbles: true }));
    elem.dispatchEvent(new Event('change', { bubbles: true }));

    // Fill next password field if found
    if (kpxc.inputs.length > 0) {
        const index = kpxc.inputs.indexOf(elem);
        const next = kpxc.inputs[index + 1];

        const nextField = next && next.getLowerCaseAttribute('type') === 'password' ? next : undefined;
        if (nextField) {
            nextField.value = password;
            nextField.dispatchEvent(new Event('input', { bubbles: true }));
            nextField.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
};

const isPasswordGeneratorSupported = async function() {
    const response = await browser.runtime.sendMessage({
        action: 'get_keepassxc_versions'
    });

    const result = await browser.runtime.sendMessage({
        action: 'compare_version',
        args: [ '2.7.0', response.current ]
    });

    return result;
};
