window.browser = (function () {
  return window.msBrowser ||
    window.browser ||
    window.chrome;
})();

$(function() {
	browser.runtime.getBackgroundPage(function(global) {
		browser.tabs.query(null, (tab) => {
			//var data = global.tab_httpauth_list["tab" + tab.id];
			const data = global.page.tabs[tab.id].loginList;
			let ul = document.getElementById('login-list');
			for (let i = 0; i < data.logins.length; i++) {
				const li = document.createElement('li');
				const a = document.createElement('a');
				a.textContent = data.logins[i].login + ' (' + data.logins[i].name + ')';
				li.appendChild(a);
				$(a).data('url', data.url.replace(/:\/\//g, '://' + data.logins[i].login + ':' + data.logins[i].password + '@'));
				$(a).click(() => {
					browser.tabs.update(tab.id, {'url': $(this).data('url')});
					close();
				});
				ul.appendChild(li);
			}
		});
	});
});