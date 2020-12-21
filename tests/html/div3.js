'use script';

document.getElementById('toggle').addEventListener('click', function(e) {
    const loginForm = document.getElementById('loginForm');

    if (!loginForm) {
        const dialog = document.createElement('div');
        dialog.setAttribute('id', 'loginForm');

        const usernameInput = document.createElement('input');
        usernameInput.setAttribute('type', 'text');
        usernameInput.setAttribute('name', 'loginField');
        usernameInput.setAttribute('placeholder', 'username');
        dialog.append(usernameInput);

        const passwordInput = document.createElement('input');
        passwordInput.setAttribute('type', 'password');
        passwordInput.setAttribute('name', 'passwordField');
        passwordInput.setAttribute('placeholder', 'password');
        dialog.append(passwordInput);

        document.body.appendChild(dialog);
    } else {
        document.body.removeChild(loginForm);
    }
});
