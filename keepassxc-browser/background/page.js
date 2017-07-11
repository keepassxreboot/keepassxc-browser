window.browser = (function () {
  return window.msBrowser ||
    window.browser ||
    window.chrome;
})();

var page = {};
page.tabs = {};

page.currentTabId = -1;
page.settings = (typeof(localStorage.settings) === 'undefined') ? {} : JSON.parse(localStorage.settings);
page.blockedTabs = {};

page.initSettings = function() {
	event.onLoadSettings();
	if (!('checkUpdateKeePassXC' in page.settings)) {
		page.settings.checkUpdateKeePassXC = 3;
	}
	if (!('autoCompleteUsernames' in page.settings)) {
		page.settings.autoCompleteUsernames = true;
	}
	if (!('autoFillAndSend' in page.settings)) {
		page.settings.autoFillAndSend = true;
	}
	if (!('usePasswordGenerator' in page.settings)) {
		page.settings.usePasswordGenerator = true;
	}
	if (!('autoFillSingleEntry' in page.settings)) {
		page.settings.autoFillSingleEntry = false;
	}
	if (!('autoRetrieveCredentials' in page.settings)) {
		page.settings.autoRetrieveCredentials = true;
	}
	if (!('port' in page.settings)) {
		page.settings.port = '19700';
	}
	localStorage.settings = JSON.stringify(page.settings);
}

page.initOpenedTabs = function() {
	browser.tabs.query({}, (tabs) => {
		for (const i of tabs) {
			page.createTabEntry(i.id);
		}
	});
}

page.isValidProtocol = function(url) {
	let protocol = url.substring(0, url.indexOf(':'));
	protocol = protocol.toLowerCase();
	return !(url.indexOf('.') === -1 || (protocol !== 'http' && protocol !== 'https' && protocol !== 'ftp' && protocol !== 'sftp'));
}

page.switchTab = function(callback, tab) {
	browserAction.showDefault(null, tab);
	browser.tabs.sendMessage(tab.id, {action: 'activated_tab'});
}

page.clearCredentials = function(tabId, complete) {
	if (!page.tabs[tabId]) {
		return;
	}

	page.tabs[tabId].credentials = {};
	delete page.tabs[tabId].credentials;

    if (complete) {
        page.tabs[tabId].loginList = [];

        browser.tabs.sendMessage(tabId, {
            action: 'clear_credentials'
        });
    }
}

page.createTabEntry = function(tabId) {
	//console.log("page.createTabEntry("+tabId+")");
	page.tabs[tabId] = {
		'stack': [],
		'errorMessage': null,
		'loginList': {}
	};
}

page.removePageInformationFromNotExistingTabs = function() {
	let rand = Math.floor(Math.random()*1001);
	if (rand === 28) {
		browser.tabs.query({}, (tabs) => {
			let $tabIds = {};
			const $infoIds = Object.keys(page.tabs);

			for (const t of tabs) {
				$tabIds[t.id] = true;
			}

			for (const i of $infoIds) {
				if (!(i in $tabIds)) {
					delete page.tabs[i];
				}
			}
		});
	}
};

page.debugConsole = function() {
	if (arguments.length > 1) {
		console.log(page.sprintf(arguments[0], arguments));
	}
	else {
		console.log(arguments[0]);
	}
};

page.sprintf = function(input, args) {
	return input.replace(/{(\d+)}/g, (match, number) => {
      return typeof args[number] !== 'undefined'
        ? (typeof args[number] === 'object' ? JSON.stringify(args[number]) : args[number])
        : match
      ;
    });
}

page.debugDummy = function() {};

page.debug = page.debugDummy;

page.setDebug = function(bool) {
	if (bool) {
		page.debug = page.debugConsole;
		return 'Debug mode enabled';
	}
	else {
		page.debug = page.debugDummy;
		return 'Debug mode disabled';
	}
};
