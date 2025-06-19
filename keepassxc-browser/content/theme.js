window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    sendMessage('theme_changed');
});
