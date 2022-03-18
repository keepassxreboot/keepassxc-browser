'use script';

document.getElementById('toggle4').addEventListener('click', function(e) {
    const loginForm = document.getElementById('loginForm4');

    if (!loginForm) {
        const dialog = document.createElement('div');
        dialog.setAttribute('id', 'loginForm4');
        dialog.style.position = 'fixed';
        dialog.style.zIndex = '1002';

        const wrapper = document.createElement('div');
        wrapper.setAttribute('tabIndex', '-1');
        wrapper.style.height = '100%';
        wrapper.style.width = '100%';
        wrapper.style.outline = '0px';
        wrapper.style.overflow = 'visible';

        const innerDiv = document.createElement('div');
        innerDiv.setAttribute('id', 'innerDiv');

        const contentDiv = document.createElement('div');
        contentDiv.setAttribute('id', 'contentDiv');

        const form = document.createElement('form');
        form.setAttribute('action', 'loginUser');
        form.setAttribute('method', 'post');

        const divUsernameWithLabel = document.createElement('div');
        const divPasswordWithLabel = document.createElement('div');

        const usernameInput = document.createElement('input');
        usernameInput.setAttribute('type', 'text');
        usernameInput.setAttribute('name', 'loginField');
        usernameInput.setAttribute('placeholder', 'username');
        divUsernameWithLabel.append(usernameInput);

        const passwordInput = document.createElement('input');
        passwordInput.setAttribute('type', 'password');
        passwordInput.setAttribute('name', 'passwordField');
        passwordInput.setAttribute('placeholder', 'password');
        divPasswordWithLabel.append(passwordInput);

        form.append(divUsernameWithLabel);
        form.append(divPasswordWithLabel);
        contentDiv.append(form);
        innerDiv.append(contentDiv);
        wrapper.append(innerDiv);
        dialog.append(wrapper);

        e.currentTarget.parentElement.appendChild(dialog);
    }
});
