'use strict';

const MAX_AUTOCOMPLETE_NAME_LEN = 50;

function cancelEvent(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
}

class Autocomplete {
    constructor() {
        this.afterFillSort = SORT_BY_MATCHING_CREDENTIALS_SETTING;
        this.autocompleteList = [];
        this.autoSubmit = false;
        this.elements = [];
        this.index = -1;
        this.input = undefined;
        this.wrapper = undefined;
        this.shadowRoot = undefined;
        this.container = undefined;
    }

    clear() {
        this.elements = [];
    }

    async click(e) {

    }

    async itemClick(e, input, uuid) {

    }

    async itemEnter(index, item) {

    }

    async create(input, showListInstantly = false, autoSubmit = false, afterFillSort = SORT_BY_MATCHING_CREDENTIALS_SETTING) {
        if (input.readOnly) {
            return;
        }

        this.autoSubmit = autoSubmit;
        this.afterFillSort = afterFillSort;

        if (!this.autocompleteList.includes(input)) {
            input.addEventListener('click', e => this.click(e));
            input.addEventListener('keydown', e => this.keyDown(e));
            input.addEventListener('keyup', e => this.keyUp(e));
            input.setAttribute('autocomplete', 'off');
            this.autocompleteList.push(input);
        }

        if (showListInstantly) {
            this.showList(input);
        }
    }

    mouseMove(e) {
        if (e.movementX === 0 && e.movementY === 0) {
            return;
        }
        this.deselectItem();
        e.target.classList.add('kpxcAutocomplete-active');
        const items = this.getAllItems();
        this.index = Array.from(items).indexOf(e.target);
    }

    async showList(inputField) {
        if (this.input === inputField) {
            return;
        }

        this.closeList();

        // Return if there are no credentials
        if (this.elements.length === 0) {
            return;
        }

        this.input = inputField;

        // Create the Autocomplete Menu if needed
        if (!this.wrapper) {
            const styleSheet = createStylesheet('css/autocomplete.css');
            const colorStyleSheet = createStylesheet('css/colors.css');
            this.wrapper = kpxcUI.createElement('div');
            this.wrapper.style.display = 'none';
            styleSheet.addEventListener('load', () => this.wrapper.style.display = 'block');
            this.container = kpxcUI.createElement('div', 'kpxcAutocomplete-container', { 'id': 'kpxcAutocomplete-container' });

            this.shadowRoot = this.wrapper.attachShadow({ mode: 'closed' });
            this.shadowRoot.append(colorStyleSheet);
            this.shadowRoot.append(styleSheet);

            this.list = kpxcUI.createElement('div', 'kpxcAutocomplete-items', { 'id': 'kpxcAutocomplete-list' });
            initColorTheme(this.container);

            this.container.append(this.list);
            this.shadowRoot.append(this.container);
            document.body.append(this.wrapper);

            // Add a footer message for auto-submit
            if (this.autoSubmit) {
                const footer = kpxcUI.createElement('footer', '', {}, tr('autocompleteSubmitMessage'));
                this.container.appendChild(footer);
            }
        }

        this.updateList();
        this.container.style.display = 'block';
        this.updatePosition();
    }

    async updateList() {
        // Try to detect a username from the webpage in order to show it first in the list
        // This is useful when a website prompts you to enter the password again, and the username is already filled in
        // It also helps with multi-page login flows
        const username = kpxcSites.detectUsernameFromPage();

        const pageUuid = await sendMessage('page_get_login_id');
        await kpxc.updateTOTPList();

        // Clear the login items from div
        while (this.list.hasChildNodes()) {
            this.list.removeChild(this.list.lastChild);
        }

        // Update credentials to menu div
        for (const c of this.elements) {
            const item = document.createElement('div');
            item.textContent = c.label;
            item.setAttribute('uuid', c.uuid);

            const itemInput = kpxcUI.createElement('input', '', { 'type': 'hidden', 'value': c.value });
            item.append(itemInput);
            item.addEventListener('click', e => this.itemClick(e, this.input, c.uuid));

            // These events prevent the double hover effect if both keyboard and mouse are used
            item.addEventListener('mousemove', e => this.mouseMove(e));

            item.addEventListener('mousedown', e => e.stopPropagation());
            item.addEventListener('mouseup', e => e.stopPropagation());

            // If this page has an associated uuid and it matches this credential, then put it on top of the list
            if (username === c.value
                || (this.afterFillSort === SORT_BY_RELEVANT_ENTRY && c.uuid === pageUuid)) {
                this.list.prepend(item);
            } else {
                this.list.appendChild(item);
            }
        }
    }

    selectItem() {
        this.deselectItem();
        const items = this.getAllItems();
        const item = items[this.index];
        if (item !== undefined) {
            item.classList.add('kpxcAutocomplete-active');
            item.scrollIntoView({ block: 'nearest' });
        }
    }

    deselectItem() {
        const items = this.list.querySelectorAll('div.kpxcAutocomplete-active');
        items.forEach(item => item.classList.remove('kpxcAutocomplete-active'));
    }

    closeList() {
        this.input = undefined;
        if (!this.shadowRoot) {
            return;
        }

        this.container.style.display = 'none';
    }

    getAllItems() {
        return this.list.getElementsByTagName('div');
    }

    /**
     * Keyboard shortcuts for autocomplete menu:
     * - ArrowDown shows the list or selects item below, or the first item (last is active)
     * - ArrowUp selects item above, or the last item (first is active)
     * - Enter or Tab selects the item
     * - Backspace and Delete shows the list if input field is empty. First item is activated
    */
    async keyDown(e) {
        if (!e.isTrusted) {
            return;
        }

        const inputField = e.target;
        if (e.key === 'ArrowDown') {
            cancelEvent(e);
            // If the list is not visible, show it
            if (!this.input) {
                await this.showList(inputField);
                this.index = 0;
                if (inputField.value !== '') {
                    this.updateSearch();
                }
                requestAnimationFrame(() => this.selectItem());
            } else {
                // Activate next item
                const items = this.getAllItems();
                this.index = (this.index+1) % items.length;
                this.selectItem();
            }
        } else if (e.key === 'ArrowUp' && this.list) {
            cancelEvent(e);
            const items = this.getAllItems();
            this.index = (this.index > 0 ? this.index : items.length) - 1;
            this.selectItem();
        } else if (e.key === 'Enter' && this.input) {
            const items = this.getAllItems();
            if (this.index >= 0 && items[this.index] !== undefined) {
                cancelEvent(e);

                await this.itemEnter(this.index, items[this.index]);
                this.closeList();
            }
        } else if (e.key === 'Tab' && this.input) {
            // Return if value is not in the list
            if (inputField.value !== '' && !this.elements.some(c => c.value === inputField.value)) {
                this.closeList();
                return;
            }

            this.index = this.elements.findIndex(c => c.value === inputField.value);
            if (this.index >= 0) {
                this.fillPassword(inputField.value, this.index, this.elements[this.index].uuid);
            }

            this.closeList();
        } else if (e.key === 'Escape') {
            this.closeList();
        } else if ((e.key === 'Backspace' || e.key === 'Delete') && inputField.value === '') {
            // Show menu when input field has no value and backspace is pressed
            this.showList(inputField);
            this.index = 0;
            this.selectItem();
        }
    }

    keyUp(e) {
        if (!this.input || !e.isTrusted || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            return;
        }

        this.updateSearch();
        this.selectItem();
    }

    updateSearch() {
        if (this.index !== -1 && this.elements[this.index]?.value?.includes(this.input.value)) {
            return;
        }
        this.index = this.elements.findIndex(c => c.value.startsWith(this.input.value));
        if (this.index === -1) {
            this.index = this.elements.findIndex(c => c.value.includes(this.input.value));
        }
    }

    updatePosition() {
        if (!this.container || !this.input) {
            return;
        }

        const rect = this.input.getBoundingClientRect();
        this.container.style.minWidth = Pixels(this.input.offsetWidth);

        // Calculate Y offset if menu does not fit to the bottom of the screen -> show it at the top of the input field
        const menuRect = this.container.getBoundingClientRect();
        const totalHeight = menuRect.height + rect.height;
        const menuOffset = (totalHeight + rect.y) > window.self.visualViewport.height ? totalHeight : 0;
        if (menuOffset > 0) {
            this.container.classList.add('kpxcAutocomplete-container-on-top');
        } else {
            this.container.classList.remove('kpxcAutocomplete-container-on-top');
        }

        const scrollTop = kpxcUI.getScrollTop();
        const scrollLeft = kpxcUI.getScrollLeft();
        if (kpxcUI.bodyStyle.position.toLowerCase() === 'relative') {
            this.container.style.top = Pixels(rect.top - kpxcUI.bodyRect.top + scrollTop + this.input.offsetHeight - menuOffset);
            this.container.style.left = Pixels(rect.left - kpxcUI.bodyRect.left + scrollLeft);
        } else {
            this.container.style.top = Pixels(rect.top + scrollTop + this.input.offsetHeight - menuOffset);
            this.container.style.left = Pixels(rect.left + scrollLeft);
        }
    }
}


// Global handlers
const handleOutsideClick = function(e, autocompleteMenu) {
    if (e.target !== autocompleteMenu.input
        && !e.target.classList.contains('kpxc-username-icon')
        && e.target !== autocompleteMenu.input) {
        autocompleteMenu.closeList();
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

    kpxcUserAutocomplete.updatePosition();
    kpxcTOTPAutocomplete.updatePosition();
});

// Handle autocomplete position on scroll
window.addEventListener('scroll', function() {
    if (!kpxc.settings.autoCompleteUsernames) {
        return;
    }

    kpxcUserAutocomplete.updatePosition();
    kpxcTOTPAutocomplete.updatePosition();
});
