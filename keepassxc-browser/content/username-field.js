'use strict';

const kpxcUsernameIcons = {};
kpxcUsernameIcons.icons = [];
kpxcUsernameIcons.detectedFields = [];

kpxcUsernameIcons.newIcon = function(field, databaseState = DatabaseState.DISCONNECTED) {
    kpxcUsernameIcons.icons.push(new UsernameFieldIcon(field, databaseState));
};

kpxcUsernameIcons.switchIcon = function(state) {
    kpxcUsernameIcons.icons.forEach(u => u.switchIcon(state));
};

kpxcUsernameIcons.deleteHiddenIcons = function() {
    kpxcUI.deleteHiddenIcons(kpxcUsernameIcons.icons, 'kpxc-username-field');
};

kpxcUsernameIcons.isValid = function(field) {
    if (!field
        || field.offsetWidth < MINIMUM_INPUT_FIELD_WIDTH
        || field.readOnly
        || kpxcIcons.hasIcon(field)
        || !kpxcFields.isVisible(field)) {
        return false;
    }

    return true;
};


class UsernameFieldIcon extends Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED) {
        super(field, databaseState);

        this.initField(field);
        kpxcUI.monitorIconPosition(this);
    }

    switchIcon(state) {
        if (!this.icon) {
            return;
        } else {
            this.observer.disconnect();
        }

        this.icon.classList.remove('lock', 'lock-moz', 'unlock', 'unlock-moz', 'disconnected', 'disconnected-moz');
        this.icon.classList.add(getIconClassName(state));
        this.icon.title = getIconText(state);
    }
}

UsernameFieldIcon.prototype.initField = function(field) {
    // Observer the visibility
    if (this.observer) {
        this.observer.observe(field);
    }

    this.createIcon(field);
    this.inputField = field;
};

UsernameFieldIcon.prototype.createIcon = function(field) {
    const className = getIconClassName(this.databaseState);

    // Size the icon dynamically, but not greater than 24 or smaller than 14
    const size = Math.max(Math.min(24, field.offsetHeight - 4), 14);

    // Don't create the icon if the input field is too small
    if (field.offsetWidth < (size * 1.5) || field.offsetHeight < size) {
        this.observer.unobserve(field);
        return;
    }

    const offset = kpxcUI.calculateIconOffset(field, size);

    const icon = kpxcUI.createElement('div', 'kpxc kpxc-username-icon ' + className,
        {
            'title': getIconText(this.databaseState),
            'alt': tr('usernameFieldIcon'),
            'size': size,
            'offset': offset,
            'kpxc-pwgen-field-id': field.getAttribute('data-kpxc-id')
        });
    icon.style.zIndex = '10000000';
    icon.style.width = Pixels(size);
    icon.style.height = Pixels(size);

    icon.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }

        e.preventDefault();
        iconClicked(field, icon);
    });

    kpxcUI.setIconPosition(icon, field, this.rtl);
    this.icon = icon;

    const styleSheet = document.createElement('link');
    styleSheet.setAttribute('rel', 'stylesheet');
    styleSheet.setAttribute('href', browser.runtime.getURL('css/username.css'));

    const wrapper = document.createElement('div');
    this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    this.shadowRoot.append(styleSheet);
    this.shadowRoot.append(icon);
    document.body.append(wrapper);
};

const iconClicked = async function(field, icon) {
    if (!kpxcFields.isVisible(field)) {
        document.body.removeChild(icon);
        field.removeAttribute('kpxc-username-field');
        return;
    }

    const connected = await sendMessage('is_connected');
    if (!connected) {
        kpxcUI.createNotification('error', tr('errorNotConnected'));
        return;
    }

    const databaseHash = await sendMessage('check_database_hash');
    if (databaseHash === '') {
        // Triggers database unlock
        await sendMessage('page_set_manual_fill', ManualFill.BOTH);
        await sendMessage('get_database_hash', [ false, true ]); // Set triggerUnlock to true
        field.focus();
    }

    if (icon.className.includes('unlock')) {
        fillCredentials(field);
    }
};

const getIconClassName = function(state = DatabaseState.UNLOCKED) {
    if (state === DatabaseState.LOCKED) {
        return (isFirefox() ? 'lock-moz' : 'lock');
    } else if (state === DatabaseState.DISCONNECTED) {
        return (isFirefox() ? 'lock-disconnected' : 'disconnected');
    }
    return (isFirefox() ? 'unlock-moz' : 'unlock');
};

const getIconText = function(state) {
    if (state === DatabaseState.LOCKED) {
        return tr('usernameLockedFieldText');
    } else if (state === DatabaseState.DISCONNECTED) {
        return tr('usernameDisconnectedFieldText');
    }

    return tr('usernameFieldText');
};

const fillCredentials = async function(field) {
    const combination = await kpxcFields.getCombination(field);
    kpxc.fillFromUsernameIcon(combination);
};
