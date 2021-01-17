'use strict';

const MAX_AUTOCOMPLETE_NAME_LEN = 50;

class Autocomplete {
    constructor() {
        this.autoSubmit = false;
        this.elements = [];
        this.started = false;
        this.index = -1;
        this.input = undefined;
        this.shadowRoot = undefined;
        this.wrapper = undefined;
    }

    clear() {
        this.elements = [];
    }

    async click(e, input) {

    }

    async itemClick(e, item, input, uuid) {

    }

    async itemEnter(index, elements) {

    }

    async create(input, showListInstantly = false, autoSubmit = false) {
        if (input.readOnly) {
            return;
        }

        this.autoSubmit = autoSubmit;
        this.input = input;
        this.started = true;

        input.addEventListener('click', ev => this.click(ev, this.input));
        input.addEventListener('keydown', ev => this.keyPress(ev));
        input.setAttribute('autocomplete', 'off');

        if (showListInstantly) {
            this.showList(input);
        }
    }

    mouseOver(e, div, item) {
        this.removeItem(this.getAllItems());
        item.classList.add('kpxcAutocomplete-active');
        this.index = Array.from(div.childNodes).indexOf(item);
    }

    mouseOut(e, item) {
        item.classList.remove('kpxcAutocomplete-active');
    }

    async showList(inputField) {
        this.closeList();
        this.input = inputField;
        this.input.select();

        const div = kpxcUI.createElement('div', 'kpxcAutocomplete-items', { 'id': 'kpxcAutocomplete-list' });
        initColorTheme(div);

        this.updatePosition(inputField, div);
        div.style.zIndex = '2147483646';

        const styleSheet = createStylesheet('css/autocomplete.css');
        const colorStyleSheet = createStylesheet('css/colors.css');
        const wrapper = kpxcUI.createElement('div');

        this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
        this.shadowRoot.append(colorStyleSheet);
        this.shadowRoot.append(styleSheet);
        this.shadowRoot.append(div);
        this.wrapper = wrapper;
        document.body.append(wrapper);

        await kpxc.updateTOTPList();
        for (const c of this.elements) {
            const item = document.createElement('div');
            item.textContent += c.label;
            const itemInput = kpxcUI.createElement('input', '', { 'type': 'hidden', 'value': c.value });
            item.append(itemInput);
            item.addEventListener('click', ev => this.itemClick(ev, item, inputField, c.uuid));

            // These events prevent the double hover effect if both keyboard and mouse are used
            item.addEventListener('mouseover', ev => this.mouseOver(ev, div, item));
            item.addEventListener('mouseout', ev => this.mouseOut(ev, item));

            div.appendChild(item);
        }

        // Add a footer message for auto-submit
        if (this.autoSubmit) {
            const footer = kpxcUI.createElement('footer', '', {}, tr('autocompleteSubmitMessage'));
            div.appendChild(footer);
        }

        // Activate the first item automatically
        const items = this.getAllItems();
        this.index = 0;
        this.activateItem(items);
    }

    activateItem(item) {
        if (!item || item.length === 0) {
            return;
        }

        this.removeItem(item);
        if (this.index >= item.length) {
            this.index = 0;
        }

        if (this.index < 0) {
            this.index = item.length - 1;
        }

        if (item[this.index] !== undefined) {
            item[this.index].classList.add('kpxcAutocomplete-active');
        }
    }

    removeItem(items) {
        for (const item of items) {
            item.classList.remove('kpxcAutocomplete-active');
        }
    }

    closeList(elem) {
        if (!this.shadowRoot) {
            return;
        }

        const items = this.shadowSelectorAll('.kpxcAutocomplete-items');
        if (!items) {
            return;
        }

        for (const item of items) {
            if (elem !== item && this.input) {
                item.parentNode.removeChild(item);
            }
        }
    }

    getAllItems() {
        const list = this.shadowSelector('#kpxcAutocomplete-list');
        if (!list) {
            return [];
        }

        return list.getElementsByTagName('div');
    }

    /**
     * Keyboard shortcuts for autocomplete menu:
     * - ArrowDown shows the list or selects item below, or the first item (last is active)
     * - ArrowUp selects item above, or the last item (first is active)
     * - Enter or Tab selects the item
     * - Backspace and Delete shows the list if input field is empty. First item is activated
    */
    keyPress(e) {
        if (!e.isTrusted) {
            return;
        }

        const items = this.getAllItems();
        if (e.key === 'ArrowDown') {
            // If the list is not visible, show it
            if (items.length === 0) {
                this.index = -1;
                this.showList(this.input);
            } else {
                // Activate next item
                ++this.index;
                this.activateItem(items);
            }
        } else if (e.key === 'ArrowUp') {
            --this.index;
            this.activateItem(items);
        } else if (e.key === 'Enter') {
            if (this.input.value === '') {
                e.preventDefault();
            }

            if (this.index >= 0 && items && items[this.index] !== undefined) {
                e.preventDefault();

                this.itemEnter(this.index, this.elements);
                this.closeList();
            }
        } else if (e.key === 'Tab') {
            // Return if value is not in the list
            if (this.input.value !== '' && !this.elements.some(c => c.value === this.input.value)) {
                this.closeList();
                return;
            }

            this.index = this.elements.findIndex(c => c.value === this.input.value);
            if (this.index >= 0) {
                this.fillPassword(this.input.value, this.index, this.elements[this.index].uuid);
            }

            this.closeList();
        } else if (e.key === 'Escape') {
            this.closeList();
        } else if ((e.key === 'Backspace' || e.key === 'Delete') && this.input.value === '') {
            // Show menu when input field has no value and backspace is pressed
            this.index = -1;
            this.showList(this.input);
        }
    }

    updatePosition(inputField, elem) {
        const div = elem || this.shadowSelector('.kpxcAutocomplete-items');
        if (!div) {
            return;
        }

        const rect = inputField.getBoundingClientRect();
        div.style.minWidth = Pixels(inputField.offsetWidth);

        if (kpxcUI.bodyStyle.position.toLowerCase() === 'relative') {
            div.style.top = Pixels(rect.top - kpxcUI.bodyRect.top + document.scrollingElement.scrollTop + inputField.offsetHeight);
            div.style.left = Pixels(rect.left - kpxcUI.bodyRect.left + document.scrollingElement.scrollLeft);
        } else {
            div.style.top = Pixels(rect.top + document.scrollingElement.scrollTop + inputField.offsetHeight);
            div.style.left = Pixels(rect.left + document.scrollingElement.scrollLeft);
        }
    }
}


// Global handlers
const handleOutsideClick = function(e, autocompleteMenu) {
    const list = autocompleteMenu.shadowRoot ? autocompleteMenu.shadowSelector('#kpxcAutocomplete-list') : undefined;
    if (!list) {
        return;
    }

    if (e.target !== autocompleteMenu.input
        && !e.target.classList.contains('kpxc-username-icon')
        && e.target.nodeName !== autocompleteMenu.input.nodeName) {
        autocompleteMenu.closeList(e.target);

        if (autocompleteMenu.wrapper) {
            document.body.removeChild(autocompleteMenu.wrapper);
        }
    }
};

const updatePosition = function(autocompleteMenu) {
    if (autocompleteMenu.input) {
        autocompleteMenu.updatePosition(autocompleteMenu.input);
    }
};

// Detect click outside autocomplete
document.addEventListener('click', function(e) {
    if (!e.isTrusted) {
        return;
    }

    handleOutsideClick(e, kpxcUserAutocomplete);
    handleOutsideClick(e, kpxcTOTPAutocomplete);
});

// Handle autocomplete position on window resize
window.addEventListener('resize', function() {
    if (!kpxc.settings.autoCompleteUsernames) {
        return;
    }

    updatePosition(kpxcUserAutocomplete);
    updatePosition(kpxcTOTPAutocomplete);
});

// Handle autocomplete position on scroll
window.addEventListener('scroll', function() {
    if (!kpxc.settings.autoCompleteUsernames) {
        return;
    }

    updatePosition(kpxcUserAutocomplete);
    updatePosition(kpxcTOTPAutocomplete);
});
