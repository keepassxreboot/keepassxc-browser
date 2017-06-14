window.browser = (function () {
  return window.msBrowser ||
    window.browser ||
    window.chrome;
})();

function status_response(r) {
	console.log(r);
	$('#initial-state').hide();
	$('#error-encountered').hide();
	$('#need-reconfigure').hide();
	$('#not-configured').hide();
	$('#configured-and-associated').hide();
	$('#configured-not-associated').hide();

	if(!r.keePassXCAvailable || r.databaseClosed) {
		$('#error-message').html(r.error);
		$('#error-encountered').show();
	}
	else if(!r.configured) {
		$('#not-configured').show();
	}
	else if(r.encryptionKeyUnrecognized) {
		$('#need-reconfigure').show();
		$('#need-reconfigure-message').html(r.error);
	}
	else if(!r.associated) {
		$('#need-reconfigure').show();
		$('#need-reconfigure-message').html(r.error);
	}
	else if (r.error != null) {
		$('#error-encountered').show();
		$('#error-message').html(r.error);
	}
	else {
		$('#configured-and-associated').show();
		$('#associated-identifier').html(r.identifier);
	}
}

$(function() {
	$("#connect-button").click(function() {
		browser.runtime.sendMessage({
			action: "associate"
		});
		close();
	});

	$("#reconnect-button").click(function() {
		browser.runtime.sendMessage({
			action: "associate"
		});
		close();
	});

	$("#reload-status-button").click(function() {
		browser.runtime.sendMessage({
			action: "reconnect"
		}, status_response);
	});

	$("#redetect-fields-button").click(function() {
		browser.tabs.query({"active": true, "windowId": browser.windows.WINDOW_ID_CURRENT}, function(tabs) {
			if (tabs.length === 0)
				return; // For example: only the background devtools or a popup are opened
			var tab = tabs[0];

			browser.tabs.sendMessage(tab.id, {
				action: "redetect_fields"
			});
		});
	});

	chrome.runtime.sendMessage({
		action: "get_status"
	}, status_response);
});