window.browser = (function () {
  return window.msBrowser ||
    window.browser ||
    window.chrome;
})();

if (jQuery) {
	var $ = jQuery.noConflict(true);
}

$(function() {
	options.initMenu();
	options.initGeneralSettings();
	options.initConnectedDatabases();
	options.initSpecifiedCredentialFields();
	options.initAbout();
});

var options = options || {};

options.settings = typeof(localStorage.settings) === 'undefined' ? {} : JSON.parse(localStorage.settings);
options.keyRing = typeof(localStorage.keyRing) === 'undefined' ? {} : JSON.parse(localStorage.keyRing);

options.initMenu = function() {
	$('.navbar:first ul.nav:first li a').click(function(e) {
		e.preventDefault();
		$('.navbar:first ul.nav:first li').removeClass('active');
		$(this).parent('li').addClass('active');
		$('div.tab').hide();
		$('div.tab#tab-' + $(this).attr('href').substring(1)).fadeIn();
	});

	$('div.tab:first').show();
}

options.saveSetting = function(name) {
	const $id = '#' + name;
	$($id).closest('.control-group').removeClass('error').addClass('success');
	setTimeout(() => { $($id).closest('.control-group').removeClass('success') }, 2500);

	localStorage.settings = JSON.stringify(options.settings);

	chrome.extension.sendMessage({
		action: 'load_settings'
	});
}

options.initGeneralSettings = function() {
	$('#tab-general-settings input[type=checkbox]').each(function() {
		$(this).attr('checked', options.settings[$(this).attr('name')]);
	});

	$('#tab-general-settings input[type=checkbox]').change(function() {
		options.settings[$(this).attr('name')] = $(this).is(':checked');
		localStorage.settings = JSON.stringify(options.settings);

        browser.runtime.sendMessage({
            action: 'load_settings'
        });
	});

	$('#tab-general-settings input[type=radio]').each(function() {
		if($(this).val() === options.settings[$(this).attr('name')]) {
			$(this).attr('checked', options.settings[$(this).attr('name')]);
		}
	});

	$('#tab-general-settings input[type=radio]').change(function() {
		options.settings[$(this).attr('name')] = $(this).val();
		localStorage.settings = JSON.stringify(options.settings);

        browser.runtime.sendMessage({
            action: 'load_settings'
        });
	});

	browser.runtime.sendMessage({
		action: 'get_keepassxc_versions'
	}, options.showKeePassXCVersions);

	$('#tab-general-settings button.checkUpdateKeePassXC:first').click(function(e) {
		e.preventDefault();
		$(this).attr('disabled', true);
		browser.runtime.sendMessage({
			action: 'check_update_keepassxc'
		}, options.showKeePassXCVersions);
	});

	$('#port').val(options.settings['port']);
	$('#blinkTimeout').val(options.settings['blinkTimeout']);
	$('#blinkMinTimeout').val(options.settings['blinkMinTimeout']);
	$('#allowedRedirect').val(options.settings['allowedRedirect']);

	$('#portButton').click(function() {
		const port = $.trim($('#port').val());
	 	const portNumber = Number(port);
		if (isNaN(port) || portNumber < 1025 || portNumber > 99999) {
			$('#port').closest('.control-group').addClass('error');
			alert('The port number has to be in range 1025 - 99999.\nNothing saved!');
			return;
		}

		options.settings['port'] = String(portNumber);
		options.saveSetting('port');
	});

	$('#blinkTimeoutButton').click(function(){
		const blinkTimeout = $.trim($('#blinkTimeout').val());
		const blinkTimeoutval = Number(blinkTimeout);
		
        options.settings['blinkTimeout'] = String(blinkTimeoutval);
		options.saveSetting('blinkTimeout');
	});

	$('#blinkMinTimeoutButton').click(function(){
		const blinkMinTimeout = $.trim($('#blinkMinTimeout').val());
		const blinkMinTimeoutval = Number(blinkMinTimeout);
		
        options.settings['blinkMinTimeout'] = String(blinkMinTimeoutval);
		options.saveSetting('blinkMinTimeout');
	});

	$('#allowedRedirectButton').click(function(){
		const allowedRedirect = $.trim($('#allowedRedirect').val());
		const allowedRedirectval = Number(allowedRedirect);
		
        options.settings['allowedRedirect'] = String(allowedRedirectval);
		options.saveSetting('allowedRedirect');
	});
};

options.showKeePassXCVersions = function(response) {
	if (response.current <= 0) {
		response.current = 'unknown';
	}
	if (response.latest <= 0) {
		response.latest = 'unknown';
	}
	$('#tab-general-settings .kphVersion:first em.yourVersion:first').text(response.current);
	$('#tab-general-settings .kphVersion:first em.latestVersion:first').text(response.latest);
	$('#tab-about em.versionKPH').text(response.current);
	$('#tab-general-settings button.checkUpdateKeePassXC:first').attr('disabled', false);
}

options.initConnectedDatabases = function() {
	$('#dialogDeleteConnectedDatabase').modal({keyboard: true, show: false, backdrop: true});
	$('#tab-connected-databases tr.clone:first button.delete:first').click(function(e) {
		e.preventDefault();
		$('#dialogDeleteConnectedDatabase').data('hash', $(this).closest('tr').data('hash'));
		$('#dialogDeleteConnectedDatabase .modal-body:first span:first').text($(this).closest('tr').children('td:first').text());
		$('#dialogDeleteConnectedDatabase').modal('show');
	});

	$('#dialogDeleteConnectedDatabase .modal-footer:first button.yes:first').click(function(e) {
		$('#dialogDeleteConnectedDatabase').modal('hide');

		const $hash = $('#dialogDeleteConnectedDatabase').data('hash');
		$('#tab-connected-databases #tr-cd-' + $hash).remove();

		delete options.keyRing[$hash];
		localStorage.keyRing = JSON.stringify(options.keyRing);

        browser.runtime.sendMessage({
            action: 'load_keyring'
        });

		if ($('#tab-connected-databases table tbody:first tr').length > 2) {
			$('#tab-connected-databases table tbody:first tr.empty:first').hide();
		}
		else {
			$('#tab-connected-databases table tbody:first tr.empty:first').show();
		}
	});

	$('#tab-connected-databases tr.clone:first .dropdown-menu:first').width('230px');

	const $trClone = $('#tab-connected-databases table tr.clone:first').clone(true);
	$trClone.removeClass('clone');
	for (let hash in options.keyRing) {
		const $tr = $trClone.clone(true);
		$tr.data('hash', hash);
		$tr.attr('id', 'tr-cd-' + hash);

		$('a.dropdown-toggle:first img:first', $tr).attr('src', '/icons/19x19/icon_normal_19x19.png');

		$tr.children('td:first').text(options.keyRing[hash].id);
		$tr.children('td:eq(1)').text(options.keyRing[hash].key);
		const lastUsed = (options.keyRing[hash].lastUsed) ? new Date(options.keyRing[hash].lastUsed).toLocaleString() : 'unknown';
		$tr.children('td:eq(2)').text(lastUsed);
		const date = (options.keyRing[hash].created) ? new Date(options.keyRing[hash].created).toLocaleDateString() : 'unknown';
		$tr.children('td:eq(3)').text(date);
		$('#tab-connected-databases table tbody:first').append($tr);
	}

	if ($('#tab-connected-databases table tbody:first tr').length > 2) {
		$('#tab-connected-databases table tbody:first tr.empty:first').hide();
	}
	else {
		$('#tab-connected-databases table tbody:first tr.empty:first').show();
	}

	$('#connect-button').click(function() {
		browser.runtime.sendMessage({
			action: 'associate'
		});
	});
}

options.initSpecifiedCredentialFields = function() {
	$('#dialogDeleteSpecifiedCredentialFields').modal({keyboard: true, show: false, backdrop: true});
	$('#tab-specified-fields tr.clone:first button.delete:first').click(function(e) {
		e.preventDefault();
		$('#dialogDeleteSpecifiedCredentialFields').data('url', $(this).closest('tr').data('url'));
		$('#dialogDeleteSpecifiedCredentialFields').data('tr-id', $(this).closest('tr').attr('id'));
		$('#dialogDeleteSpecifiedCredentialFields .modal-body:first strong:first').text($(this).closest('tr').children('td:first').text());
		$('#dialogDeleteSpecifiedCredentialFields').modal('show');
	});

	$('#dialogDeleteSpecifiedCredentialFields .modal-footer:first button.yes:first').click(function(e) {
		$('#dialogDeleteSpecifiedCredentialFields').modal('hide');

		const $url = $('#dialogDeleteSpecifiedCredentialFields').data('url');
		const $trId = $('#dialogDeleteSpecifiedCredentialFields').data('tr-id');
		$('#tab-specified-fields #' + $trId).remove();

		delete options.settings['defined-credential-fields'][$url];
		localStorage.settings = JSON.stringify(options.settings);

        browser.runtime.sendMessage({
            action: 'load_settings'
        });

		if($('#tab-specified-fields table tbody:first tr').length > 2) {
			$('#tab-specified-fields table tbody:first tr.empty:first').hide();
		}
		else {
			$('#tab-specified-fields table tbody:first tr.empty:first').show();
		}
	});

	const $trClone = $('#tab-specified-fields table tr.clone:first').clone(true);
	$trClone.removeClass('clone');
	let counter = 1;
	for(let url in options.settings['defined-credential-fields']) {
		const $tr = $trClone.clone(true);
		$tr.data('url', url);
		$tr.attr('id', 'tr-scf' + counter);
		counter += 1;

		$tr.children('td:first').text(url);
		$('#tab-specified-fields table tbody:first').append($tr);
	}

	if($('#tab-specified-fields table tbody:first tr').length > 2) {
		$('#tab-specified-fields table tbody:first tr.empty:first').hide();
	}
	else {
		$('#tab-specified-fields table tbody:first tr.empty:first').show();
	}
}

options.initAbout = function() {
	$('#tab-about em.versionCIP').text(browser.runtime.getManifest().version);
}
