var httpAuth = httpAuth || {};

httpAuth.requests = [];
httpAuth.pendingCallbacks = [];

httpAuth.requestCompleted = function(details) {
	let index = httpAuth.requests.indexOf(details.requestId);
	if (index > -1) {
		httpAuth.requests.splice(index, 1);
	}
};

httpAuth.handleRequestPromise = function(details) {
	return new Promise((resolve, reject) => {
		httpAuth.processPendingCallbacks(details, resolve, reject);
	});
};

httpAuth.handleRequestCallback = function(details, callback) {
	httpAuth.processPendingCallbacks(details, callback, callback);
};

httpAuth.processPendingCallbacks = function(details, resolve, reject) {
	if (httpAuth.requests.indexOf(details.requestId) >= 0 || !page.tabs[details.tabId]) {
		reject({});
	}

	httpAuth.requests.push(details.requestId);

	if (details.challenger) {
		details.proxyUrl = details.challenger.host;
	}

	details.searchUrl = (details.isProxy && details.proxyUrl) ? details.proxyUrl : details.url;

	keepass.retrieveCredentials((logins) => {
		httpAuth.loginOrShowCredentials(logins, details, resolve, reject);
	}, { "id": details.tabId }, details.searchUrl, details.searchUrl, true);
};

httpAuth.loginOrShowCredentials = function(logins, details, resolve, reject) {
	// at least one login found --> use first to login
	if (logins.length > 0) {
		kpxcEvent.onHTTPAuthPopup(null, { "id": details.tabId }, { "logins": logins, "url": details.searchUrl });
		//generate popup-list for HTTP Auth usernames + descriptions

		if (page.settings.autoFillAndSend) {
			resolve({
				authCredentials: {
					username: logins[0].login,
					password: logins[0].password
				}
			});
		} else {
			reject({});
		}
	}
	// no logins found
	else {
		reject({});
	}
};
