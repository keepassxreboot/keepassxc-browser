'use strict';

const kpxcAutocomplete = {};
kpxcAutocomplete.autoSubmit = false;
kpxcAutocomplete.elements = [];
kpxcAutocomplete.started = false;
kpxcAutocomplete.index = -1;
kpxcAutocomplete.input = undefined;
kpxcAutocomplete.shadowRoot = undefined;
kpxcAutocomplete.wrapper = undefined;

kpxcAutocomplete.create = function(input, showListInstantly = false, autoSubmit = false) {
    kpxcAutocomplete.autoSubmit = autoSubmit;
    kpxcAutocomplete.input = input;
    kpxcAutocomplete.started = true;

    input.addEventListener('click', function(e) {
        if (!e.isTrusted) {
            return;
        }

        if (input.value !== '') {
            input.select();
        }
        kpxcAutocomplete.showList(input);
    });

    input.addEventListener('keydown', kpxcAutocomplete.keyPress);
    input.setAttribute('autocomplete', 'off');

    if (showListInstantly) {
        kpxcAutocomplete.showList(input);
    }
};

kpxcAutocomplete.showList = function(inputField) {
    kpxcAutocomplete.closeList();
    kpxcAutocomplete.input = inputField;

    const div = kpxcUI.createElement('div', 'kpxcAutocomplete-items', { 'id': 'kpxcAutocomplete-list' });
    initColorTheme(div);

    kpxcAutocomplete.updatePosition(inputField, div);
    div.style.zIndex = '2147483646';

    const styleSheet = createStylesheet('css/autocomplete.css');
    const colorStyleSheet = createStylesheet('css/colors.css');
    const wrapper = kpxcUI.createElement('div');

    kpxcAutocomplete.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
    kpxcAutocomplete.shadowRoot.append(colorStyleSheet);
    kpxcAutocomplete.shadowRoot.append(styleSheet);
    kpxcAutocomplete.shadowRoot.append(div);
    kpxcAutocomplete.wrapper = wrapper;
    document.body.append(wrapper);

    for (const c of kpxcAutocomplete.elements) {
        const item = document.createElement('div');
        item.textContent += c.label;
        const itemInput = kpxcUI.createElement('input', '', { 'type': 'hidden', 'value': c.value });
        item.append(itemInput);
        item.addEventListener('click', function(e) {
            if (!e.isTrusted) {
                return;
            }

            // Save index for combination.loginId
            const index = Array.prototype.indexOf.call(e.currentTarget.parentElement.childNodes, e.currentTarget);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: index
            });

            inputField.value = this.getElementsByTagName('input')[0].value;
            kpxcAutocomplete.fillPassword(inputField.value, index);
            kpxcAutocomplete.closeList();
            inputField.focus();
            document.body.removeChild(wrapper);
        });

        // These events prevent the double hover effect if both keyboard and mouse are used
        item.addEventListener('mouseover', function(e) {
            kpxcAutocomplete.removeItem(kpxcAutocomplete.getAllItems());
            item.classList.add('kpxcAutocomplete-active');
            kpxcAutocomplete.index = Array.from(div.childNodes).indexOf(item);
        });
        item.addEventListener('mouseout', function(e) {
            item.classList.remove('kpxcAutocomplete-active');
        });

        div.appendChild(item);
    }

    // Add a footer message for auto-submit
    if (kpxcAutocomplete.autoSubmit) {
        const footer = kpxcUI.createElement('footer', '', {}, tr('autocompleteSubmitMessage'));
        div.appendChild(footer);
    }

    // Activate the first item automatically
    const items = kpxcAutocomplete.getAllItems();
    kpxcAutocomplete.index = 0;
    kpxcAutocomplete.activateItem(items);
};

kpxcAutocomplete.activateItem = function(item) {
    if (!item || item.length === 0) {
        return;
    }

    kpxcAutocomplete.removeItem(item);
    if (kpxcAutocomplete.index >= item.length) {
        kpxcAutocomplete.index = 0;
    }

    if (kpxcAutocomplete.index < 0) {
        kpxcAutocomplete.index = item.length - 1;
    }

    if (item[kpxcAutocomplete.index] !== undefined) {
        item[kpxcAutocomplete.index].classList.add('kpxcAutocomplete-active');
    }
};

kpxcAutocomplete.removeItem = function(items) {
    for (const item of items) {
        item.classList.remove('kpxcAutocomplete-active');
    }
};

kpxcAutocomplete.closeList = function(elem) {
    if (!kpxcAutocomplete.shadowRoot) {
        return;
    }

    const items = kpxcAutocomplete.shadowSelectorAll('.kpxcAutocomplete-items');
    if (!items) {
        return;
    }

    for (const item of items) {
        if (elem !== item && kpxcAutocomplete.input) {
            item.parentNode.removeChild(item);
        }
    }
};

kpxcAutocomplete.getAllItems = function() {
    const list = kpxcAutocomplete.shadowSelector('#kpxcAutocomplete-list');
    if (!list) {
        return [];
    }
    return list.getElementsByTagName('div');
};

/**
 * Keyboard shortcuts for autocomplete menu:
 * - ArrowDown shows the list or selects item below, or the first item (last is active)
 * - ArrowUp selects item above, or the last item (first is active)
 * - Enter or Tab selects the item
 * - Backspace and Delete shows the list if input field is empty. First item is activated
*/
kpxcAutocomplete.keyPress = function(e) {
    if (!e.isTrusted) {
        return;
    }

    const items = kpxcAutocomplete.getAllItems();
    if (e.key === 'ArrowDown') {
        // If the list is not visible, show it
        if (items.length === 0) {
            kpxcAutocomplete.index = -1;
            kpxcAutocomplete.showList(kpxcAutocomplete.input);
        } else {
            // Activate next item
            ++kpxcAutocomplete.index;
            kpxcAutocomplete.activateItem(items);
        }
    } else if (e.key === 'ArrowUp') {
        --kpxcAutocomplete.index;
        kpxcAutocomplete.activateItem(items);
    } else if (e.key === 'Enter') {
        if (kpxcAutocomplete.input.value === '') {
            e.preventDefault();
        }

        if (kpxcAutocomplete.index >= 0 && items && items[kpxcAutocomplete.index] !== undefined) {
            e.preventDefault();
            kpxcAutocomplete.input.value = e.currentTarget.value;
            kpxcAutocomplete.fillPassword(kpxcAutocomplete.input.value, kpxcAutocomplete.index);
            kpxcAutocomplete.closeList();
        }
    } else if (e.key === 'Tab') {
        // Return if value is not in the list
        if (kpxcAutocomplete.input.value !== '' && !kpxcAutocomplete.elements.some(c => c.value === kpxcAutocomplete.input.value)) {
            kpxcAutocomplete.closeList();
            return;
        }

        kpxcAutocomplete.index = kpxcAutocomplete.elements.findIndex(c => c.value === kpxcAutocomplete.input.value);
        kpxcAutocomplete.fillPassword(kpxcAutocomplete.input.value, kpxcAutocomplete.index);
        kpxcAutocomplete.closeList();
    } else if (e.key === 'Escape') {
        kpxcAutocomplete.closeList();
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && kpxcAutocomplete.input.value === '') {
        // Show menu when input field has no value and backspace is pressed
        kpxcAutocomplete.index = -1;
        kpxcAutocomplete.showList(kpxcAutocomplete.input);
    }
};

kpxcAutocomplete.fillPassword = function(value, index) {
    const fieldId = kpxcAutocomplete.input.getAttribute('data-kpxc-id');
    kpxcFields.prepareId(fieldId);

    const givenType = kpxcAutocomplete.input.type === 'password' ? 'password' : 'username';
    const combination = kpxcFields.getCombination(givenType, fieldId);
    combination.loginId = index;

    kpxc.fillInCredentials(combination, givenType === 'password', false);
    kpxcAutocomplete.input.setAttribute('fetched', true);
};

kpxcAutocomplete.updatePosition = function(inputField, elem) {
    const div = elem || kpxcAutocomplete.shadowSelector('.kpxcAutocomplete-items');
    if (!div) {
        return;
    }

    const rect = inputField.getBoundingClientRect();
    div.style.minWidth = Pixels(inputField.offsetWidth);
    const bodyRect = document.body.getBoundingClientRect();
    const bodyStyle = getComputedStyle(document.body);

    if (bodyStyle.position.toLowerCase() === 'relative') {
        div.style.top = Pixels(rect.top - bodyRect.top + document.scrollingElement.scrollTop + inputField.offsetHeight);
        div.style.left = Pixels(rect.left - bodyRect.left + document.scrollingElement.scrollLeft);
    } else {
        div.style.top = Pixels(rect.top + document.scrollingElement.scrollTop + inputField.offsetHeight);
        div.style.left = Pixels(rect.left + document.scrollingElement.scrollLeft);
    }

};

// Detect click outside autocomplete
document.addEventListener('click', function(e) {
    if (!e.isTrusted) {
        return;
    }

    const list = kpxcAutocomplete.shadowRoot ? kpxcAutocomplete.shadowSelector('#kpxcAutocomplete-list') : undefined;
    if (!list) {
        return;
    }

    if (e.target !== kpxcAutocomplete.input
        && !e.target.classList.contains('kpxc-username-icon')
        && e.target.nodeName !== kpxcAutocomplete.input.nodeName) {
        kpxcAutocomplete.closeList(e.target);

        if (kpxcAutocomplete.wrapper) {
            document.body.removeChild(kpxcAutocomplete.wrapper);
        }
    }
});

// Handle autocomplete position on window resize
window.addEventListener('resize', function() {
    if (!kpxc.settings.autoCompleteUsernames) {
        return;
    }

    if (kpxcAutocomplete.input) {
        kpxcAutocomplete.updatePosition(kpxcAutocomplete.input);
    }
});

// Handle autocomplete position on scroll
window.addEventListener('scroll', function() {
    if (!kpxc.settings.autoCompleteUsernames) {
        return;
    }

    if (kpxcAutocomplete.input) {
        kpxcAutocomplete.updatePosition(kpxcAutocomplete.input);
    }
});
