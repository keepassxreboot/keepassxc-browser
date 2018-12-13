'use strict';

var kpxcUsernameField = {};
kpxcUsernameField.created = false;
kpxcUsernameField.icon = null;
kpxcUsernameField.inputField = null;
kpxcUsernameField.observedIcons = [];
kpxcUsernameField.observingLock = false;

kpxcUsernameField.init = function() {
    window.setInterval(function() {
        kpxcUsernameField.checkObservedElements();
    }, 400);
};

kpxcUsernameField.createIcon = function(target, databaseClosed = true) {
    if (kpxcUsernameField.created) {
        return;
    }
    kpxcUsernameField.created = true;

    const field = target[0]; // Remove for no_jquery
    const className = kpxcUsernameField.getIcon(databaseClosed);
    const size = (field.offsetHeight > 28) ? 24 : 16;
    let offset = Math.floor((field.offsetHeight - size) / 3);
    offset = (offset < 0) ? 0 : offset;

    const icon = document.createElement('div');
    icon.classList.add('kpxc');
    icon.classList.add('kpxc-username-icon');
    icon.classList.add(className);
    icon.setAttribute('size', size);
    icon.setAttribute('offset', offset);
    icon.setAttribute('kpxc-username-field-id', field.getAttribute('kpxc-id'));
    icon.style.zIndex = '9999';
    icon.style.width = String(size) + 'px';
    icon.style.height = String(size) + 'px';

    icon.addEventListener('click', function(e) {
        e.preventDefault();

        if (!cipFields.isVisible(field)) {
            document.body.removeChild(icon);
            field.removeAttribute('kpxc-username-field');
            return;
        }

        browser.runtime.sendMessage({
            action: 'get_status',
            args: [ false, true ] // Set forcePopup to true
        });
    });

    kpxcUsernameField.setIconPosition(icon, field);
    kpxcUsernameField.icon = icon;
    //kpxcUsernameField.observedIcons.push(icon); // Use with no_jquery
    document.body.appendChild(icon);
};

kpxcUsernameField.setIconPosition = function(icon, field) {
    const rect = field.getBoundingClientRect();
    const offset = Number(icon.getAttribute('offset'));
    const size = Number(icon.getAttribute('size'));
   
    icon.style.top = String((rect.top + document.body.scrollTop) + offset + 1) + 'px';
    icon.style.left = String((rect.left + document.body.scrollLeft) + field.offsetWidth - size - offset) + 'px';
};

kpxcUsernameField.checkObservedElements = function() {
    if (kpxcUsernameField.observingLock) {
        return;
    }

    kpxcUsernameField.observingLock = true;
    kpxcUsernameField.observedIcons.forEach(function(iconField, index) {
        if (iconField && iconField.length === 1) {
            const fieldId = iconField.getAttribute('kpxc-username-field-id');
            const field = $('input[data-kpxc-id=\''+fieldId+'\']');
            if (!field || field.length !== 1) {
                iconField.remove();
                kpxcUsernameField.observedIcons.splice(index, 1);
            }
            else if (!cipFields.isVisible(field)) {
                iconField.hide();
            }
            else if (cipFields.isVisible(field)) {
                iconField.show();
                kpxcUsernameField.setIconPosition(iconField, field);
                field.setAttribute('kpxc-username-field', true);
            }
        } else {
            kpxcUsernameField.observedIcons.splice(index, 1);
        }
    });
    kpxcUsernameField.observingLock = false;
};

kpxcUsernameField.switchIcon = function(locked) {
    const icons = $('.kpxc-username-icon');
    if (!icons || icons.length === 0) {
        return;
    }
    const icon = icons[0];

    if (locked) {
        icon.classList.remove(kpxcUsernameField.getIcon());
        icon.classList.add(kpxcUsernameField.getIcon(true));
    } else {
        icon.classList.remove(kpxcUsernameField.getIcon(true));
        icon.classList.add(kpxcUsernameField.getIcon());
    }
};

kpxcUsernameField.getIcon = function(locked = false) {
    if (locked) {
        return (isFirefox() ? 'lock-moz' : 'lock');
    }
    return (isFirefox() ? 'unlock-moz' : 'unlock');
};

// Handle icon position on window resize
window.addEventListener('resize', function(event) {
    if (kpxcUsernameField.inputField && kpxcUsernameField.icon) {
        kpxcUsernameField.setIconPosition(kpxcUsernameField.icon, kpxcUsernameField.inputField);
    }
});
