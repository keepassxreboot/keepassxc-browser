var $ = jQuery.noConflict(true);

function updateAvailableResponse(available) {
	if (available) {
		$('#update-available').show();
	}
	else {
		$('#update-available').hide();
	}
}

function initSettings() {
	$ ('#settings #btn-options').click(function() {
		browser.runtime.openOptionsPage().then(close());
	});

	$ ('#settings #btn-choose-credential-fields').click(function() {
		browser.runtime.getBackgroundPage().then((global) => {
			browser.tabs.sendMessage(global.page.currentTabId, {
				action: 'choose_credential_fields'
			});
			close();
		});
	});
}


$(function() {
	initSettings();

	browser.runtime.sendMessage({
		action: 'update_available_keepassxc'
	}).then(updateAvailableResponse);
});
