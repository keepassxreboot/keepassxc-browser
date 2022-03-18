'use script';

document.getElementById('toggle').addEventListener('click', function(e) {
    const loginForm = document.getElementById('loginForm');

    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
    } else {
        loginForm.style.display = 'none';
    }
});
