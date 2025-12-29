'use strict';

const MIN_ICON_SIZE = 14;
const MAX_ICON_SIZE = 24;

// Basic icon class
class Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED, segmented = false) {
        this.databaseState = databaseState;
        this.icon = null;
        this.inputField = null;
        this.rtl = kpxcUI.isRTL(field);
        this.segmented = segmented;

        try {
            this.observer = new IntersectionObserver((entries) => {
                kpxcIcons.updateFromIntersectionObserver(this, entries);
            });
        } catch (err) {
            logError(err);
        }
    }

    // Size the icon dynamically, but not greater than 24 or smaller than 14
    calculateIconSize(field) {
        return Math.max(Math.min(MAX_ICON_SIZE, field.offsetHeight - 4), MIN_ICON_SIZE);
    }

    // Creates a wrapper div that has the icon in Shadow DOM
    createWrapper(styleSheetFilename) {
        const styleSheet = createStylesheet(styleSheetFilename);
        const wrapper = document.createElement('div');
        wrapper.style.all = 'unset';
        wrapper.style.display = 'none';

        // Make sure the wrapper is positioned correctly without CSS styles affecting to it
        wrapper.style.position = 'absolute';
        wrapper.style.top = Pixels(0);
        wrapper.style.left = Pixels(0);

        // Waits for stylesheet to load before displaying the element
        styleSheet.addEventListener('load', () => wrapper.style.display = 'block');

        this.shadowRoot = wrapper.attachShadow({ mode: 'closed' });
        this.shadowRoot.append(styleSheet);
        this.shadowRoot.append(this.icon);
        document.body.append(wrapper);
        kpxcUI.observeWrapper(wrapper);
    }

    removeIcon() {
        this.shadowRoot.removeChild(this.icon);
        document.body.removeChild(this.shadowRoot.host);
    }

    switchIcon(state, uuid) {
        if (!this.icon) {
            return;
        }

        if (state === DatabaseState.UNLOCKED) {
            this.icon.style.filter = kpxc.credentials.length === 0 && !uuid ? 'saturate(0%)' : 'saturate(100%)';
        } else {
            this.icon.style.filter = 'saturate(0%)';
        }
    }
}
