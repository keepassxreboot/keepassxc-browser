'use script';

document.getElementById('toggle').addEventListener('click', function(e) {
    const dialog = document.getElementById('dialog');
    const outer = document.getElementById('outer');
    const inner = document.getElementById('inner');

    if (dialog.style.zIndex === 'auto') {
        dialog.style.zIndex = 9999;
        inner.style.margin = '0px';
        outer.style.height = 'auto';

    } else {
        dialog.style.zIndex = 'auto';
        inner.style.margin = '-197px';
        outer.style.height = '0px';
    }
});
