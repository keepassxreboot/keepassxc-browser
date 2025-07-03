'use strict';

const options = {};

const $ = function(elem) {
    return document.querySelector(elem);
};

const initPage = async function() {
    const changeCheckboxValue = async function(e) {
        const name = e.currentTarget.name;
        let isChecked = e.currentTarget.checked;

        if (name === 'defaultPasswordManager') {
            const isDefaultPasswordManagerSet = await updateDefaultPasswordManager();
            isChecked = isDefaultPasswordManagerSet;
            e.target.checked = isDefaultPasswordManagerSet;
        }

        options.settings[name] = isChecked;
        await saveSettings();
    };

    // Switch/checkboxes
    const checkboxes = document.querySelectorAll('#tab-getting-started input[type=checkbox]');
    for (const checkbox of checkboxes) {
        checkbox.checked = options.settings[checkbox.name];
        checkbox.addEventListener('click', changeCheckboxValue);
    }

    // Color theme
    $('#tab-getting-started select#colorTheme').addEventListener('change', async function(e) {
        options.settings['colorTheme'] = e.currentTarget.value;
        await saveSettings();
        updateTheme(options.settings['colorTheme']);
    });
};

const saveSettings = async function() {
    await browser.storage.local.set({ 'settings': options.settings });
};

const updateTheme = function(theme) {
    if (theme === 'system') {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-bs-theme', theme);
};

(async() => {
    try {
        updateTheme('system');

        const settings = await browser.runtime.sendMessage({ action: 'load_settings' });
        options.settings = settings;

        await initPage();
    } catch (err) {
        console.log('Error loading getting started page: ' + err);
    }
})();
