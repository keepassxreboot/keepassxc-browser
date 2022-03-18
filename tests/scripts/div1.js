'use script';

document.getElementById('toggle1').addEventListener('click', function(e) {
    const loginForm = document.getElementById('loginForm1');

    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
    } else {
        loginForm.style.display = 'none';
    }
});
