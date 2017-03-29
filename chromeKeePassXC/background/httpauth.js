var httpAuth = httpAuth || {};

httpAuth.pendingCallbacks = [];
httpAuth.requestId = "";
httpAuth.callback = null;
httpAuth.tabId = 0;
httpAuth.url = null;
httpAuth.isProxy = false;
httpAuth.proxyUrl = null;


httpAuth.handleRequest = function (details, callback) {
	if(httpAuth.requestId == details.requestId || !page.tabs[details.tabId]) {
		callback({});
	}
	else {
		httpAuth.requestId = details.requestId;
		httpAuth.pendingCallbacks.push(callback);
		httpAuth.processPendingCallbacks(details);
	}
}

httpAuth.processPendingCallbacks = function(details) {
	httpAuth.callback = httpAuth.pendingCallbacks.pop();
	httpAuth.tabId = details.tabId;
	httpAuth.url = details.url;
	httpAuth.isProxy = details.isProxy;

	if(details.challenger){
		httpAuth.proxyUrl = details.challenger.host;
	}

	// WORKAROUND: second parameter should be tab, but is an own object with tab-id
	// but in background.js only tab.id is used. To get tabs we could use
	// chrome.tabs.get(tabId, callback) <-- but what should callback be?

	var url = (httpAuth.isProxy && httpAuth.proxyUrl) ? httpAuth.proxyUrl : httpAuth.url;

	keepass.retrieveCredentials(httpAuth.loginOrShowCredentials, { "id" : details.tabId }, url, url, true);
}

httpAuth.loginOrShowCredentials = function(logins) {
	// at least one login found --> use first to login
	if (logins.length > 0) {
		var url = (httpAuth.isProxy && httpAuth.proxyUrl) ? httpAuth.proxyUrl : httpAuth.url;
		event.onHTTPAuthPopup(null, {"id": httpAuth.tabId}, {"logins": logins, "url": url});
		//generate popup-list for HTTP Auth usernames + descriptions

		if(page.settings.autoFillAndSend) {
			httpAuth.callback({
				authCredentials: {
					username: logins[0].Login,
					password: logins[0].Password
				}
			});
		}
		else {
			httpAuth.callback({});
		}
	}
	// no logins found
	else {
		httpAuth.callback({});
	}
}
