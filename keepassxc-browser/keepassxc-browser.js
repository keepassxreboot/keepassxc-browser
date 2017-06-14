var isFirefox = false;
if (typeof browser !== 'undefined') {
	isFirefox = true;
}

window.browser = (function () {
  return window.msBrowser ||
    window.browser ||
    window.chrome;
})();

// Initialize autocomplete feature
$(this.target).find('input').autocomplete();

// contains already called method names
var _called = {};

browser.runtime.onMessage.addListener(function(req, sender, callback) {
	if ('action' in req) {
		if(req.action == "fill_user_pass_with_specific_login") {
			if(cip.credentials[req.id]) {
				var combination = null;
				if (cip.u) {
					cip.setValueWithChange(cip.u, cip.credentials[req.id].login);
					combination = cipFields.getCombination("username", cip.u);
					cip.u.focus();
				}
				if (cip.p) {
					cip.setValueWithChange(cip.p, cip.credentials[req.id].password);
					combination = cipFields.getCombination("password", cip.p);
				}

                var list = {};
				if(cip.fillInStringFields(combination.fields, cip.credentials[req.id].stringFields, list)) {
                    cipForm.destroy(false, {"password": list.list[0], "username": list.list[1]});
                }
			}
			// wish I could clear out _logins and _u, but a subsequent
			// selection may be requested.
		}
		else if (req.action == "fill_user_pass") {
			cip.receiveCredentialsIfNecessary();
			cip.fillInFromActiveElement(false);
		}
		else if (req.action == "fill_pass_only") {
			cip.receiveCredentialsIfNecessary();
			cip.fillInFromActiveElementPassOnly(false);
		}
		else if (req.action == "activate_password_generator") {
			cip.initPasswordGenerator(cipFields.getAllFields());
		}
		else if (req.action == "remember_credentials") {
			cip.contextMenuRememberCredentials();
		}
		else if (req.action == "choose_credential_fields") {
			cipDefine.init();
		}
		else if (req.action == "clear_credentials") {
			cipEvents.clearCredentials();
		}
		else if (req.action == "activated_tab") {
			cipEvents.triggerActivatedTab();
		}
		else if (req.action == "redetect_fields") {
			browser.runtime.sendMessage({
				"action": "get_settings",
			}, function(response) {
				cip.settings = response.data;
				cip.initCredentialFields(true);
			});
		}
	}
});

function _f(fieldId) {
	var field = (fieldId) ? jQuery("input[data-cip-id='"+fieldId+"']:first") : [];
	return (field.length > 0) ? field : null;
}

function _fs(fieldId) {
	var field = (fieldId) ? jQuery("input[data-cip-id='"+fieldId+"']:first,select[data-cip-id='"+fieldId+"']:first").first() : [];
	return (field.length > 0) ? field : null;
}



var cipAutocomplete = {};

// objects of username + description for autocomplete
cipAutocomplete.elements = [];

cipAutocomplete.init = function(field) {
	if (field.hasClass("ui-autocomplete-input")) {
		//_f(credentialInputs[i].username).autocomplete("source", autocompleteSource);
		field.autocomplete("destroy");
	}

	field
		.autocomplete({
			minLength: 0,
			source: cipAutocomplete.onSource,
			select: cipAutocomplete.onSelect,
			open: cipAutocomplete.onOpen
		});
	field
		.click(cipAutocomplete.onClick)
		.blur(cipAutocomplete.onBlur)
		.focus(cipAutocomplete.onFocus);
}

cipAutocomplete.onClick = function() {
	jQuery(this).autocomplete("search", jQuery(this).val());
}

cipAutocomplete.onOpen = function(event, ui) {
	// NOT BEAUTIFUL!
	// modifies ALL ui-autocomplete menus of class .cip-ui-menu
	jQuery("ul.ui-autocomplete.ui-menu").css("z-index", 2147483636);
}

cipAutocomplete.onSource = function (request, callback) {
	var matches = jQuery.map( cipAutocomplete.elements, function(tag) {
		if (tag.label.toUpperCase().indexOf(request.term.toUpperCase()) === 0) {
			return tag;
		}
	});
	callback(matches);
}

cipAutocomplete.onSelect = function (e, ui) {
	e.preventDefault();
	cip.setValueWithChange(jQuery(this), ui.item.value);
	var fieldId = cipFields.prepareId(jQuery(this).attr("data-cip-id"));
	var combination = cipFields.getCombination("username", fieldId);
	combination.loginId = ui.item.loginId;
	cip.fillInCredentials(combination, true, false);
	jQuery(this).data("fetched", true);
}

cipAutocomplete.onBlur = function() {
	if (jQuery(this).data("fetched") == true) {
		jQuery(this).data("fetched", false);
	}
	else {
		var fieldId = cipFields.prepareId(jQuery(this).attr("data-cip-id"));
		var fields = cipFields.getCombination("username", fieldId);
		if (_f(fields.password) && _f(fields.password).data("unchanged") != true && jQuery(this).val() != "") {
			cip.fillInCredentials(fields, true, true);
		}
	}
}

cipAutocomplete.onFocus = function() {
	cip.u = jQuery(this);

	if (jQuery(this).val() == "") {
		jQuery(this).autocomplete("search", "");
	}
}



var cipPassword = {};

cipPassword.observedIcons = [];
cipPassword.observingLock = false;

cipPassword.init = function() {
	if ("initPasswordGenerator" in _called) {
		return;
	}

	_called.initPasswordGenerator = true;

	window.setInterval(function() {
		cipPassword.checkObservedElements();
	}, 400);
}

cipPassword.initField = function(field, inputs, pos) {
	if (!field || field.length != 1) {
		return;
	}
	if (field.data("cip-password-generator")) {
		return;
	}

	field.data("cip-password-generator", true);

	cipPassword.createIcon(field);
	cipPassword.createDialog();

	var $found = false;
	if (inputs) {
		for (var i = pos + 1; i < inputs.length; i++) {
			if (inputs[i] && inputs[i].attr("type") && inputs[i].attr("type").toLowerCase() == "password") {
				field.data("cip-genpw-next-field-id", inputs[i].data("cip-id"));
				field.data("cip-genpw-next-is-password-field", (i == 0));
				$found = true;
				break;
			}
		}
	}

	field.data("cip-genpw-next-field-exists", $found);
}

cipPassword.createDialog = function() {
	if ("passwordCreateDialog" in _called) {
		return;
	}

	_called.passwordCreateDialog = true;

	var $dialog = jQuery("<div>")
		.addClass("dialog-form")
		.attr("id", "cip-genpw-dialog");
	
	var $inputDiv = jQuery("<div>").addClass("form-group");
	var $inputGroup = jQuery("<div>").addClass("genpw-input-group");
	var $textfieldPassword = jQuery("<input>")
		.attr("id", "cip-genpw-textfield-password")
		.attr("type", "text")
		.attr("aria-describedby", "cip-genpw-quality")
		.attr("placeholder", "Generated password")
		.addClass("genpw-text ui-widget-content ui-corner-all")
		.on('change keypress paste textInput input', function() {
			jQuery("#cip-genpw-btn-clipboard:first").removeClass("btn-success");
		});
	var $quality = jQuery("<span>")
		.addClass("genpw-input-group-addon")
		.addClass("b2c-add-on")
		.attr("id", "cip-genpw-quality")
		.text("123 Bits");
	$inputGroup.append($textfieldPassword).append($quality);
	
	var $checkGroup = jQuery("<div>").addClass("genpw-input-group");
	var $checkboxNextField = jQuery("<input>")
		.attr("id", "cip-genpw-checkbox-next-field")
		.attr("type", "checkbox")
		.addClass("cip-genpw-checkbox");
	var $labelNextField = jQuery("<label>")
		.append($checkboxNextField)
		.addClass("cip-genpw-label")
		.append(" also fill in the next password-field");
	$checkGroup.append($labelNextField);

	$inputDiv.append($inputGroup).append($checkGroup);
	$dialog.append($inputDiv);

	$dialog.hide();
	jQuery("body").append($dialog);
	$dialog.dialog({
		autoOpen: false,
		modal: true,
		resizable: false,
		minWidth: 300,
		minHeight: 80,
		title: "Password Generator",
		classes: {"ui-dialog": "ui-corner-all"},
		buttons: {
			"Generate": 
			{
				text: "Generate",
				id: "cip-genpw-btn-generate",
				click: function(e) {
					e.preventDefault();
					browser.runtime.sendMessage({
						action: "generate_password"
					}, cipPassword.callbackGeneratedPassword);
				}
			},
			"Copy": function(e) {
				e.preventDefault();
				browser.runtime.sendMessage({
					action: "copy_password",
					args: [jQuery("input#cip-genpw-textfield-password").val()]
				}, cipPassword.callbackPasswordCopied);
			},
			"Fill & copy": function(e) {
				e.preventDefault();

				var fieldId = jQuery("#cip-genpw-dialog:first").data("cip-genpw-field-id");
				var field = jQuery("input[data-cip-id='"+fieldId+"']:first");
				if (field.length == 1) {
					var $password = jQuery("input#cip-genpw-textfield-password:first").val();

					if (field.attr("maxlength")) {
						if ($password.length > field.attr("maxlength")) {
							$password = $password.substring(0, field.attr("maxlength"));
							jQuery("input#cip-genpw-textfield-password:first").val($password);
							jQuery("#cip-genpw-btn-clipboard:first").removeClass("b2c-btn-success");
							alert("The generated password is longer than the allowed length!\nIt has been cut to fit the length.\n\nPlease remember the new password!");
						}
					}

					field.val($password);
					if (jQuery("input#cip-genpw-checkbox-next-field:checked").length == 1) {
						if(field.data("cip-genpw-next-field-exists")) {
							var nextFieldId = field.data("cip-genpw-next-field-id");
							var nextField = jQuery("input[data-cip-id='"+nextFieldId+"']:first");
							if(nextField.length == 1) {
								nextField.val($password);
							}
						}
					}

					// Copy password to clipboard
					browser.runtime.sendMessage({
						action: "copy_password",
						args: [$password]
					}, cipPassword.callbackPasswordCopied);
				}
			}
		},
		open: function(event, ui) {
			jQuery(".ui-widget-overlay").click(function() {
				jQuery("#cip-genpw-dialog:first").dialog("close");
			});

			if (jQuery("input#cip-genpw-textfield-password:first").val() == "") {
				jQuery("button#cip-genpw-btn-generate:first").click();
			}
		}
	});
}

cipPassword.createIcon = function(field) {
	var $className = (field.outerHeight() > 28) ? (isFirefox ? "cip-icon-key-big-moz" : "cip-icon-key-big") : (isFirefox ? "cip-icon-key-small-moz" : "cip-icon-key-small");
	var $size = (field.outerHeight() > 28) ? 24 : 16;
	var $offset = Math.floor((field.outerHeight() - $size) / 3);
	$offset = ($offset < 0) ? 0 : $offset;

	var $zIndex = 0;
	var $zIndexField = field;
	var z;
	var c = 0;
	while ($zIndexField.length > 0) {
		if( c > 100 || $zIndexField[0].nodeName == "#document") {
			break;
		}
		z = $zIndexField.css("z-index");
		if (!isNaN(z) && parseInt(z) > $zIndex) {
			$zIndex = parseInt(z);
		}
		$zIndexField = $zIndexField.parent();
		c++;
	}

	if (isNaN($zIndex) || $zIndex < 1) {
		$zIndex = 1;
	}
	$zIndex += 1;

	var $icon = jQuery("<div>").addClass("cip-genpw-icon")
		.addClass($className)
		.css("z-index", $zIndex)
		.data("size", $size)
		.data("offset", $offset)
		.data("cip-genpw-field-id", field.data("cip-id"));
	cipPassword.setIconPosition($icon, field);
	$icon.click(function(e) {
		e.preventDefault();

		if (!field.is(":visible")) {
			$icon.remove();
			field.removeData("cip-password-generator");
			return;
		}

		var $dialog = jQuery("#cip-genpw-dialog");
		if ($dialog.dialog("isOpen")) {
			$dialog.dialog("close");
		}
		$dialog.dialog("option", "position", { my: "left-10px top", at: "center bottom", of: jQuery(this) });
		$dialog.data("cip-genpw-field-id", field.data("cip-id"));
		$dialog.data("cip-genpw-next-field-id", field.data("cip-genpw-next-field-id"));
		$dialog.data("cip-genpw-next-is-password-field", field.data("cip-genpw-next-is-password-field"));

		var $bool = Boolean(field.data("cip-genpw-next-field-exists"));
		jQuery("input#cip-genpw-checkbox-next-field:first")
			.attr("checked", $bool)
			.attr("disabled", !$bool);

		$dialog.dialog("open");
	});

	cipPassword.observedIcons.push($icon);

	jQuery("body").append($icon);
}

cipPassword.setIconPosition = function($icon, $field) {
	$icon.css("top", $field.offset().top + $icon.data("offset") + 1)
		.css("left", $field.offset().left + $field.outerWidth() - $icon.data("size") - $icon.data("offset"))
}

cipPassword.callbackPasswordCopied = function(bool) {
	if (bool) {
		jQuery("#cip-genpw-btn-clipboard").addClass("btn-success");
	}
}

cipPassword.callbackGeneratedPassword = function(entries) {
	if (entries && entries.length >= 1) {
		console.log(entries[0]);
		jQuery("#cip-genpw-btn-clipboard:first").removeClass("btn-success");
		jQuery("input#cip-genpw-textfield-password:first").val(entries[0].password);
		if (isNaN(entries[0].login)) {
			jQuery("#cip-genpw-quality:first").text("??? Bits");
		}
		else {
			jQuery("#cip-genpw-quality:first").text(entries[0].login + " Bits");
		}
	}
	else {
		if (jQuery("div#cip-genpw-error:first").length == 0) {
			jQuery("button#cip-genpw-btn-generate:first").after("<div style='block' id='cip-genpw-error'>Cannot receive generated password.<br />Is your version of KeePassXC up-to-date?<br /><br /><a href='https://keepassxc.org'>Please visit the KeePassXC homepage</a></div>");
			jQuery("input#cip-genpw-textfield-password:first").parent().hide();
			jQuery("input#cip-genpw-checkbox-next-field:first").parent("label").hide();
			jQuery("button#cip-genpw-btn-generate").hide();
			jQuery("button#cip-genpw-btn-clipboard").hide();
			jQuery("button#cip-genpw-btn-fillin").hide();
		}
	}
}

cipPassword.onRequestPassword = function() {
	browser.runtime.sendMessage({
		'action': 'generate_password'
	}, cipPassword.callbackGeneratedPassword);
}

cipPassword.checkObservedElements = function() {
	if (cipPassword.observingLock) {
		return;
	}

	cipPassword.observingLock = true;
	jQuery.each(cipPassword.observedIcons, function(index, iconField) {
		if (iconField && iconField.length == 1) {
			var fieldId = iconField.data("cip-genpw-field-id");
			var field = jQuery("input[data-cip-id='"+fieldId+"']:first");
			if (!field || field.length != 1) {
				iconField.remove();
				cipPassword.observedIcons.splice(index, 1);
			}
			else if (!field.is(":visible")) {
				iconField.hide();
				//field.removeData("cip-password-generator");
			}
			else if (field.is(":visible")) {
				iconField.show();
				cipPassword.setIconPosition(iconField, field);
				field.data("cip-password-generator", true);
			}
		}
		else {
			cipPassword.observedIcons.splice(index, 1);
		}
	});
	cipPassword.observingLock = false;
}



var cipForm = {};

cipForm.init = function(form, credentialFields) {
	// TODO: could be called multiple times --> update credentialFields

	// not already initialized && password-field is not null
	if (!form.data("cipForm-initialized") && credentialFields.password) {
		form.data("cipForm-initialized", true);
		cipForm.setInputFields(form, credentialFields);
		form.submit(cipForm.onSubmit);
	}
}

cipForm.destroy = function(form, credentialFields) {
    if (form === false && credentialFields) {
        var field = _f(credentialFields.password) || _f(credentialFields.username);
		if(field) {
			form = field.closest("form");
		}
    }

    if (form && jQuery(form).length > 0) {
        jQuery(form).unbind('submit', cipForm.onSubmit);
    }
}

cipForm.setInputFields = function(form, credentialFields) {
	form.data("cipUsername", credentialFields.username);
	form.data("cipPassword", credentialFields.password);
}

cipForm.onSubmit = function() {
	var usernameId = jQuery(this).data("cipUsername");
	var passwordId = jQuery(this).data("cipPassword");

	var usernameValue = "";
	var passwordValue = "";

	var usernameField = _f(usernameId);
	var passwordField = _f(passwordId);

	if (usernameField) {
		usernameValue = usernameField.val();
	}
	if (passwordField) {
		passwordValue = passwordField.val();
	}

	cip.rememberCredentials(usernameValue, passwordValue);
};



var cipDefine = {};

cipDefine.selection = {
	"username": null,
	"password": null,
	"fields": {}
};
cipDefine.eventFieldClick = null;

cipDefine.init = function () {
	var $backdrop = jQuery("<div>").attr("id", "b2c-backdrop").addClass("b2c-modal-backdrop");
	jQuery("body").append($backdrop);

	var $chooser = jQuery("<div>").attr("id", "b2c-cipDefine-fields");
	jQuery("body").append($chooser);

	var $description = jQuery("<div>").attr("id", "b2c-cipDefine-description");
	$backdrop.append($description);

	cipFields.getAllFields();
	cipFields.prepareVisibleFieldsWithID("select");

	cipDefine.initDescription();

	cipDefine.resetSelection();
	cipDefine.prepareStep1();
	cipDefine.markAllUsernameFields($chooser);
}

cipDefine.initDescription = function() {
	var $description = jQuery("div#b2c-cipDefine-description");
	var $h1 = jQuery("<div>").addClass("b2c-chooser-headline");
	$description.append($h1);
	var $help = jQuery("<div>").addClass("b2c-chooser-help").attr("id", "b2c-help");
	$description.append($help);

	var $btnDismiss = jQuery("<button>").text("Dismiss").attr("id", "b2c-btn-dismiss")
		.addClass("btn").addClass("btn-danger")
		.click(function(e) {
			jQuery("div#b2c-backdrop").remove();
			jQuery("div#b2c-cipDefine-fields").remove();
		});
	var $btnSkip = jQuery("<button>").text("Skip").attr("id", "b2c-btn-skip")
		.addClass("btn").addClass("btn-info")
		.css("margin-right", "5px")
		.click(function() {
			if (jQuery(this).data("step") == 1) {
				cipDefine.selection.username = null;
				cipDefine.prepareStep2();
				cipDefine.markAllPasswordFields(jQuery("#b2c-cipDefine-fields"));
			}
			else if (jQuery(this).data("step") == 2) {
				cipDefine.selection.password = null;
				cipDefine.prepareStep3();
				cipDefine.markAllStringFields(jQuery("#b2c-cipDefine-fields"));
			}
		});
	var $btnAgain = jQuery("<button>").text("Again").attr("id", "b2c-btn-again")
		.addClass("btn").addClass("btn-warning")
		.css("margin-right", "5px")
		.click(function(e) {
			cipDefine.resetSelection();
			cipDefine.prepareStep1();
			cipDefine.markAllUsernameFields(jQuery("#b2c-cipDefine-fields"));
		})
		.hide();
	var $btnConfirm = jQuery("<button>").text("Confirm").attr("id", "b2c-btn-confirm")
		.addClass("btn").addClass("btn-primary")
		.css("margin-right", "15px")
		.click(function(e) {
			if (!cip.settings["defined-credential-fields"]) {
				cip.settings["defined-credential-fields"] = {};
			}

			if (cipDefine.selection.username) {
				cipDefine.selection.username = cipFields.prepareId(cipDefine.selection.username);
			}

			var passwordId = jQuery("div#b2c-cipDefine-fields").data("password");
			if (cipDefine.selection.password) {
				cipDefine.selection.password = cipFields.prepareId(cipDefine.selection.password);
			}

			var fieldIds = [];
			var fieldKeys = Object.keys(cipDefine.selection.fields);
			for (var i = 0; i < fieldKeys.length; i++) {
				fieldIds.push(cipFields.prepareId(fieldKeys[i]));
			}

			cip.settings["defined-credential-fields"][document.location.origin] = {
				"username": cipDefine.selection.username,
				"password": cipDefine.selection.password,
				"fields": fieldIds
			};

			browser.runtime.sendMessage({
				action: 'save_settings',
				args: [cip.settings]
			});

			jQuery("button#b2c-btn-dismiss").click();
		})
		.hide();

	$description.append($btnConfirm);
	$description.append($btnSkip);
	$description.append($btnAgain);
	$description.append($btnDismiss);

	if (cip.settings["defined-credential-fields"] && cip.settings["defined-credential-fields"][document.location.origin]) {
		var $p = jQuery("<p>").html("For this page credential fields are already selected and will be overwritten.<br />");
		var $btnDiscard = jQuery("<button>")
			.attr("id", "btn-warning")
			.text("Discard selection")
			.css("margin-top", "5px")
			.addClass("btn")
			.addClass("btn-sm")
			.addClass("btn-danger")
			.click(function(e) {
				delete cip.settings["defined-credential-fields"][document.location.origin];

				browser.runtime.sendMessage({
					action: 'save_settings',
					args: [cip.settings]
				});

				browser.runtime.sendMessage({
					action: 'load_settings'
				});

				jQuery(this).parent("p").remove();
			});
		$p.append($btnDiscard);
		$description.append($p);
	}

	jQuery("div#b2c-cipDefine-description").draggable();
}

cipDefine.resetSelection = function() {
	cipDefine.selection = {
		username: null,
		password: null,
		fields: {}
	};
}

cipDefine.isFieldSelected = function($cipId) {
	return (
		$cipId == cipDefine.selection.username ||
		$cipId == cipDefine.selection.password ||
		$cipId in cipDefine.selection.fields
	);
}

cipDefine.markAllUsernameFields = function($chooser) {
	cipDefine.eventFieldClick = function(e) {
		cipDefine.selection.username = jQuery(this).data("cip-id");
		jQuery(this).addClass("b2c-fixed-username-field").text("Username").unbind("click");
		cipDefine.prepareStep2();
		cipDefine.markAllPasswordFields(jQuery("#b2c-cipDefine-fields"));
	};
	cipDefine.markFields($chooser, cipFields.inputQueryPattern);
}

cipDefine.markAllPasswordFields = function($chooser) {
	cipDefine.eventFieldClick = function(e) {
		cipDefine.selection.password = jQuery(this).data("cip-id");
		jQuery(this).addClass("b2c-fixed-password-field").text("Password").unbind("click");
		cipDefine.prepareStep3();
		cipDefine.markAllStringFields(jQuery("#b2c-cipDefine-fields"));
	};
	cipDefine.markFields($chooser, "input[type='password']");
}

cipDefine.markAllStringFields = function($chooser) {
	cipDefine.eventFieldClick = function(e) {
		cipDefine.selection.fields[jQuery(this).data("cip-id")] = true;
		var count = Object.keys(cipDefine.selection.fields).length;
		jQuery(this).addClass("b2c-fixed-string-field").text("String field #"+count.toString()).unbind("click");

		jQuery("button#b2c-btn-confirm:first").addClass("b2c-btn-primary").attr("disabled", false);
	};
	cipDefine.markFields($chooser, cipFields.inputQueryPattern + ", select");
}

cipDefine.markFields = function ($chooser, $pattern) {
	//var $found = false;
	jQuery($pattern).each(function() {
		if (cipDefine.isFieldSelected(jQuery(this).data("cip-id"))) {
			//continue
			return true;
		}

		if (jQuery(this).is(":visible") && jQuery(this).css("visibility") != "hidden" && jQuery(this).css("visibility") != "collapsed") {
			var $field = jQuery("<div>").addClass("b2c-fixed-field")
				.css("top", jQuery(this).offset().top)
				.css("left", jQuery(this).offset().left)
				.css("width", jQuery(this).outerWidth())
				.css("height", jQuery(this).outerHeight())
				.attr("data-cip-id", jQuery(this).attr("data-cip-id"))
				.click(cipDefine.eventFieldClick)
				.hover(function() {jQuery(this).addClass("b2c-fixed-hover-field");}, function() {jQuery(this).removeClass("b2c-fixed-hover-field");});
			$chooser.append($field);
			//$found = true;
		}
	});

	/* skip step if no entry was found
	if(!$found) {
		alert("No username field found.\nContinue with choosing a password field.");
		jQuery("button#b2c-btn-skip").click();
	}
	*/
}

cipDefine.prepareStep1 = function() {
	jQuery("div#b2c-help").text("").css("margin-bottom", 0);
	jQuery("div#b2c-cipDefine-fields").removeData("username");
	jQuery("div#b2c-cipDefine-fields").removeData("password");
	jQuery("div.b2c-fixed-field", jQuery("div#b2c-cipDefine-fields")).remove();
	jQuery("div:first", jQuery("div#b2c-cipDefine-description")).text("1. Choose a username field");
	jQuery("button#b2c-btn-skip:first").data("step", "1").show();
	jQuery("button#b2c-btn-confirm:first").hide();
	jQuery("button#b2c-btn-again:first").hide();
}

cipDefine.prepareStep2 = function() {
	jQuery("div#b2c-help").text("").css("margin-bottom", 0);
	jQuery("div.b2c-fixed-field:not(.b2c-fixed-username-field)", jQuery("div#b2c-cipDefine-fields")).remove();
	jQuery("div:first", jQuery("div#b2c-cipDefine-description")).text("2. Now choose a password field");
	jQuery("button#b2c-btn-skip:first").data("step", "2");
	jQuery("button#b2c-btn-again:first").show();
}

cipDefine.prepareStep3 = function() {
	/* skip step if no entry was found
	if(!jQuery("div#b2c-cipDefine-fields").data("username") && !jQuery("div#b2c-cipDefine-fields").data("password")) {
		alert("Neither an username field nor a password field were selected.\nNothing will be changed and chooser will be closed now.");
		jQuery("button#b2c-btn-dismiss").click();
		return;
	}
	 */

	if (!cipDefine.selection.username && !cipDefine.selection.password) {
		jQuery("button#b2c-btn-confirm:first").removeClass("b2c-btn-primary").attr("disabled", true);
	}

	jQuery("div#b2c-help").html("Please confirm your selection or choose more fields as <em>String fields</em>.").css("margin-bottom", "5px");
	jQuery("div.b2c-fixed-field:not(.b2c-fixed-password-field,.b2c-fixed-username-field)", jQuery("div#b2c-cipDefine-fields")).remove();
	jQuery("button#b2c-btn-confirm:first").show();
	jQuery("button#b2c-btn-skip:first").data("step", "3").hide();
	jQuery("div:first", jQuery("div#b2c-cipDefine-description")).text("3. Confirm selection");
}



var cipFields = {}

cipFields.inputQueryPattern = "input[type='text'], input[type='email'], input[type='password'], input[type='tel'], input[type='number'], input:not([type])";
// unique number as new IDs for input fields
cipFields.uniqueNumber = 342845638;
// objects with combination of username + password fields
cipFields.combinations = [];

cipFields.setUniqueId = function(field) {
	if (field && !field.attr("data-cip-id")) {
		// use ID of field if it is unique
		// yes, it should be, but there are many bad developers outside...
		var fieldId = field.attr("id");
		if (fieldId) {
			var foundIds = jQuery("input#" + cipFields.prepareId(fieldId));
			if (foundIds.length == 1) {
				field.attr("data-cip-id", fieldId);
				return;
			}
		}

		// create own ID if no ID is set for this field
		cipFields.uniqueNumber += 1;
		field.attr("data-cip-id", "jQuery"+String(cipFields.uniqueNumber));
	}
}

cipFields.prepareId = function(id) {
	return id.replace(/[:#.,\[\]\(\)' "]/g, function(m) {
												return "\\"+m
											});
}

cipFields.getAllFields = function() {
	var fields = [];
	// get all input fields which are text, email or password and visible
	jQuery(cipFields.inputQueryPattern).each(function() {
		if (jQuery(this).is(":visible") && jQuery(this).css("visibility") != "hidden" && jQuery(this).css("visibility") != "collapsed") {
			cipFields.setUniqueId(jQuery(this));
			fields.push(jQuery(this));
		}
	});

	return fields;
}

cipFields.prepareVisibleFieldsWithID = function($pattern) {
	jQuery($pattern).each(function() {
		if (jQuery(this).is(":visible") && jQuery(this).css("visibility") != "hidden" && jQuery(this).css("visibility") != "collapsed") {
			cipFields.setUniqueId(jQuery(this));
		}
	});
}

cipFields.getAllCombinations = function(inputs) {
	var fields = [];
	var uField = null;
	for (var i = 0; i < inputs.length; i++) {
		if (!inputs[i] || inputs[i].length < 1) {
			continue;
		}

		if (inputs[i].attr("type") && inputs[i].attr("type").toLowerCase() == "password") {
			var uId = (!uField || uField.length < 1) ? null : cipFields.prepareId(uField.attr("data-cip-id"));

			var combination = {
				"username": uId,
				"password": cipFields.prepareId(inputs[i].attr("data-cip-id"))
			};
			fields.push(combination);

			// reset selected username field
			uField = null;
		}
		else {
			// username field
			uField = inputs[i];
		}
	}

	return fields;
}

cipFields.getCombination = function(givenType, fieldId) {
	if (cipFields.combinations.length == 0) {
		if( cipFields.useDefinedCredentialFields()) {
			return cipFields.combinations[0];
		}
	}
	// use defined credential fields (already loaded into combinations)
	if (cip.settings["defined-credential-fields"] && cip.settings["defined-credential-fields"][document.location.origin]) {
		return cipFields.combinations[0];
	}

	for (var i = 0; i < cipFields.combinations.length; i++) {
		if (cipFields.combinations[i][givenType] == fieldId) {
			return cipFields.combinations[i];
		}
	}

	// find new combination
	var combination = {
		"username": null,
		"password": null
	};

    var newCombi = false;
	if (givenType == "username") {
		var passwordField = cipFields.getPasswordField(fieldId, true);
		var passwordId = null;
		if (passwordField && passwordField.length > 0) {
			passwordId = cipFields.prepareId(passwordField.attr("data-cip-id"));
		}
		combination = {
			"username": fieldId,
			"password": passwordId
		};
        newCombi = true;
	}
	else if (givenType == "password") {
		var usernameField = cipFields.getUsernameField(fieldId, true);
		var usernameId = null;
		if (usernameField && usernameField.length > 0) {
			usernameId = cipFields.prepareId(usernameField.attr("data-cip-id"));
		}
		combination = {
			"username": usernameId,
			"password": fieldId
		};
        newCombi = true;
	}

	if (combination.username || combination.password) {
		cipFields.combinations.push(combination);
	}

	if (combination.username) {
		if (cip.credentials.length > 0) {
			cip.preparePageForMultipleCredentials(cip.credentials);
		}
	}

    if (newCombi) {
        combination.isNew = true;
    }
	return combination;
}

/**
* return the username field or null if it not exists
*/
cipFields.getUsernameField = function(passwordId, checkDisabled) {
	var passwordField = _f(passwordId);
	if (!passwordField) {
		return null;
	}

	var form = passwordField.closest("form")[0];
	var usernameField = null;

	// search all inputs on this one form
	if (form) {
		jQuery(cipFields.inputQueryPattern, form).each(function() {
			cipFields.setUniqueId(jQuery(this));
			if (jQuery(this).attr("data-cip-id") == passwordId) {
				// break
				return false;
			}

			if (jQuery(this).attr("type") && jQuery(this).attr("type").toLowerCase() == "password") {
				// continue
				return true;
			}

			usernameField = jQuery(this);
		});
	}
	// search all inputs on page
	else {
		var inputs = cipFields.getAllFields();
		cip.initPasswordGenerator(inputs);
		for (var i = 0; i < inputs.length; i++) {
			if (inputs[i].attr("data-cip-id") == passwordId) {
				break;
			}

			if (inputs[i].attr("type") && inputs[i].attr("type").toLowerCase() == "password") {
				continue;
			}

			usernameField = inputs[i];
		}
	}

	if (usernameField && !checkDisabled) {
		var usernameId = usernameField.attr("data-cip-id");
		// check if usernameField is already used by another combination
		for (var i = 0; i < cipFields.combinations.length; i++) {
			if(cipFields.combinations[i].username == usernameId) {
				usernameField = null;
				break;
			}
		}
	}

	cipFields.setUniqueId(usernameField);

	return usernameField;
}

/**
* return the password field or null if it not exists
*/
cipFields.getPasswordField = function(usernameId, checkDisabled) {
	var usernameField = _f(usernameId);
	if (!usernameField) {
		return null;
	}

	var form = usernameField.closest("form")[0];
	var passwordField = null;

	// search all inputs on this one form
	if (form) {
		passwordField = jQuery("input[type='password']:first", form);
		if (passwordField.length < 1) {
			passwordField = null;
		}

		if (cip.settings.usePasswordGenerator) {
			cipPassword.init();
			cipPassword.initField(passwordField);
		}
	}
	// search all inputs on page
	else {
		var inputs = cipFields.getAllFields();
		cip.initPasswordGenerator(inputs);

		var active = false;
		for (var i = 0; i < inputs.length; i++) {
			if (inputs[i].attr("data-cip-id") == usernameId) {
				active = true;
			}
			if (active && jQuery(inputs[i]).attr("type") && jQuery(inputs[i]).attr("type").toLowerCase() == "password") {
				passwordField = inputs[i];
				break;
			}
		}
	}

	if (passwordField && !checkDisabled) {
		var passwordId = passwordField.attr("data-cip-id");
		// check if passwordField is already used by another combination
		for (var i = 0; i < cipFields.combinations.length; i++) {
			if (cipFields.combinations[i].password == passwordId) {
				passwordField = null;
				break;
			}
		}
	}

	cipFields.setUniqueId(passwordField);

	return passwordField;
}

cipFields.prepareCombinations = function(combinations) {
	for (var i = 0; i < combinations.length; i++) {
		var pwField = _f(combinations[i].password);
		// needed for auto-complete: don't overwrite manually filled-in password field
		if (pwField && !pwField.data("cipFields-onChange")) {
			pwField.data("cipFields-onChange", true);
			pwField.change(function() {
				jQuery(this).data("unchanged", false);
			});
		}

		// initialize form-submit for remembering credentials
		var fieldId = combinations[i].password || combinations[i].username;
		var field = _f(fieldId);
		if (field) {
			var form = field.closest("form");
			if (form && form.length > 0) {
				cipForm.init(form, combinations[i]);
			}
		}
	}
}

cipFields.useDefinedCredentialFields = function() {
	if (cip.settings["defined-credential-fields"] && cip.settings["defined-credential-fields"][document.location.origin]) {
		var creds = cip.settings["defined-credential-fields"][document.location.origin];

		var $found = _f(creds.username) || _f(creds.password);
		for (var i = 0; i < creds.fields.length; i++) {
			if (_fs(creds.fields[i])) {
				$found = true;
				break;
			}
		}

		if ($found) {
			var fields = {
				"username": creds.username,
				"password": creds.password,
				"fields": creds.fields
			};
			cipFields.combinations = [];
			cipFields.combinations.push(fields);

			return true;
		}
	}

	return false;
}



var cip = {};

// settings of keepassxc-browser
cip.settings = {};
// username field which will be set on focus
cip.u = null;
// password field which will be set on focus
cip.p = null;
// document.location
cip.url = null;
// request-url of the form in which the field is located
cip.submitUrl = null;
// received credentials from KeePassXC
cip.credentials = [];

jQuery(function() {
	cip.init();
});

cip.init = function() {
	browser.runtime.sendMessage({
		"action": "get_settings",
	}, function(response) {
		cip.settings = response.data;
		cip.initCredentialFields();
	});
}

cip.initCredentialFields = function(forceCall) {
	if (_called.initCredentialFields && !forceCall) {
		return;
	}
	_called.initCredentialFields = true;

	var inputs = cipFields.getAllFields();
	cipFields.prepareVisibleFieldsWithID("select");
	cip.initPasswordGenerator(inputs);

	if (!cipFields.useDefinedCredentialFields()) {
		// get all combinations of username + password fields
		cipFields.combinations = cipFields.getAllCombinations(inputs);
	}
	cipFields.prepareCombinations(cipFields.combinations);

	if (cipFields.combinations.length == 0) {
		browser.runtime.sendMessage({
			'action': 'show_default_browseraction'
		});
		return;
	}

	cip.url = document.location.origin;
	cip.submitUrl = cip.getFormActionUrl(cipFields.combinations[0]);

	if (cip.settings.autoRetrieveCredentials) {
    	browser.runtime.sendMessage({
    		'action': 'retrieve_credentials',
    		'args': [ cip.url, cip.submitUrl ]
		}, cip.retrieveCredentialsCallback);
	}
} // end function init

cip.initPasswordGenerator = function(inputs) {
	if (cip.settings.usePasswordGenerator) {
		cipPassword.init();

		for (var i = 0; i < inputs.length; i++) {
			if (inputs[i] && inputs[i].attr("type") && inputs[i].attr("type").toLowerCase() == "password") {
				cipPassword.initField(inputs[i], inputs, i);
			}
		}
	}
}

cip.receiveCredentialsIfNecessary = function () {
	if (cip.credentials.length == 0) {
		browser.runtime.sendMessage({
			'action': 'retrieve_credentials',
			'args': [ cip.url, cip.submitUrl ]
		}, cip.retrieveCredentialsCallback);
	}
}

cip.retrieveCredentialsCallback = function (credentials, dontAutoFillIn) {
	if (cipFields.combinations.length > 0) {
		cip.u = _f(cipFields.combinations[0].username);
		cip.p = _f(cipFields.combinations[0].password);
	}

	if (credentials.length > 0) {
		cip.credentials = credentials;
		cip.prepareFieldsForCredentials(!Boolean(dontAutoFillIn));
	}
}

cip.prepareFieldsForCredentials = function(autoFillInForSingle) {
	// only one login for this site
	if (autoFillInForSingle && cip.settings.autoFillSingleEntry && cip.credentials.length == 1) {
		var combination = null;
		if (!cip.p && !cip.u && cipFields.combinations.length > 0) {
			cip.u = _f(cipFields.combinations[0].username);
			cip.p = _f(cipFields.combinations[0].password);
			combination = cipFields.combinations[0];
		}
		if (cip.u) {
			cip.setValueWithChange(cip.u, cip.credentials[0].login);
			combination = cipFields.getCombination("username", cip.u);
		}
		if (cip.p) {
			cip.setValueWithChange(cip.p, cip.credentials[0].password);
			combination = cipFields.getCombination("password", cip.p);
		}

		if (combination) {
			var list = {};
			if (cip.fillInStringFields(combination.fields, cip.credentials[0].stringFields, list)) {
				cipForm.destroy(false, {"password": list.list[0], "username": list.list[1]});
			}
		}

		// generate popup-list of usernames + descriptions
		browser.runtime.sendMessage({
			'action': 'popup_login',
			'args': [[cip.credentials[0].login + " (" + cip.credentials[0].name + ")"]]
		});
	}
	//multiple logins for this site
	else if (cip.credentials.length > 1 || (cip.credentials.length > 0 && (!cip.settings.autoFillSingleEntry || !autoFillInForSingle))) {
		cip.preparePageForMultipleCredentials(cip.credentials);
	}
}

cip.preparePageForMultipleCredentials = function(credentials) {
	// add usernames + descriptions to autocomplete-list and popup-list
	var usernames = [];
	cipAutocomplete.elements = [];
	var visibleLogin;
	for (var i = 0; i < credentials.length; i++) {
		visibleLogin = (credentials[i].login.length > 0) ? credentials[i].login : "- no username -";
		usernames.push(visibleLogin + " (" + credentials[i].name + ")");
		var item = {
			"label": visibleLogin + " (" + credentials[i].name + ")",
			"value": credentials[i].login,
			"loginId": i
		};
		cipAutocomplete.elements.push(item);
	}

	// generate popup-list of usernames + descriptions
	browser.runtime.sendMessage({
		'action': 'popup_login',
		'args': [usernames]
	});

	// initialize autocomplete for username fields
	if (cip.settings.autoCompleteUsernames) {
		for (var i = 0; i < cipFields.combinations.length; i++) {
			if (_f(cipFields.combinations[i].username)) {
				cipAutocomplete.init(_f(cipFields.combinations[i].username));
			}
		}
	}
}

cip.getFormActionUrl = function(combination) {
	var field = _f(combination.password) || _f(combination.username);

    if (field == null) {
        return null;
    }

	var form = field.closest("form");
	var action = null;

	if (form && form.length > 0) {
		action = form[0].action;
	}

	if (typeof(action) != "string" || action == "") {
		action = document.location.origin + document.location.pathname;
	}

	return action;
}

cip.fillInCredentials = function(combination, onlyPassword, suppressWarnings) {
	var action = cip.getFormActionUrl(combination);

	var u = _f(combination.username);
	var p = _f(combination.password);

	if (combination.isNew) {
		// initialize form-submit for remembering credentials
		var fieldId = combination.password || combination.username;
		var field = _f(fieldId);
		if (field) {
			var form2 = field.closest("form");
			if (form2 && form2.length > 0) {
				cipForm.init(form2, combination);
			}
		}
	}

	if (u) {
		cip.u = u;
	}
	if (p) {
		cip.p = p;
	}

	if (cip.url == document.location.origin && cip.submitUrl == action && cip.credentials.length > 0) {
		cip.fillIn(combination, onlyPassword, suppressWarnings);
	}
	else {
		cip.url = document.location.origin;
		cip.submitUrl = action;

		browser.runtime.sendMessage({
			'action': 'retrieve_credentials',
			'args': [ cip.url, cip.submitUrl, false, true ]
		}, function(credentials) {
			cip.retrieveCredentialsCallback(credentials, true);
			cip.fillIn(combination, onlyPassword, suppressWarnings);
		});
	}
}

cip.fillInFromActiveElement = function(suppressWarnings) {
	var el = document.activeElement;
	if (el.tagName.toLowerCase() != "input") {
		if (cipFields.combinations.length > 0) {
			cip.fillInCredentials(cipFields.combinations[0], false, suppressWarnings);
		}
		return;
	}

	cipFields.setUniqueId(jQuery(el));
	var fieldId = cipFields.prepareId(jQuery(el).attr("data-cip-id"));
	var combination = null;
	if (el.type && el.type.toLowerCase() == "password") {
		combination = cipFields.getCombination("password", fieldId);
	}
	else {
		combination = cipFields.getCombination("username", fieldId);
	}
	delete combination.loginId;

	cip.fillInCredentials(combination, false, suppressWarnings);
}

cip.fillInFromActiveElementPassOnly = function(suppressWarnings) {
	var el = document.activeElement;
	if (el.tagName.toLowerCase() != "input") {
		if (cipFields.combinations.length > 0) {
			cip.fillInCredentials(cipFields.combinations[0], false, suppressWarnings);
		}
		return;
	}

	cipFields.setUniqueId(jQuery(el));
	var fieldId = cipFields.prepareId(jQuery(el).attr("data-cip-id"));
	var combination = null;
	if (el.type && el.type.toLowerCase() == "password") {
		combination = cipFields.getCombination("password", fieldId);
	}
	else {
		combination = cipFields.getCombination("username", fieldId);
	}

	if (!_f(combination.password)) {
		var message = "Unable to find a password field";
		browser.runtime.sendMessage({
			action: 'alert',
			args: [message]
		});
		return;
	}

	delete combination.loginId;

	cip.fillInCredentials(combination, true, suppressWarnings);
}

cip.setValue = function(field, value) {
	if (field.is("select")) {
		value = value.toLowerCase().trim();
		jQuery("option", field).each(function() {
			if (jQuery(this).text().toLowerCase().trim() == value) {
				cip.setValueWithChange(field, jQuery(this).val());
				return false;
			}
		});
	}
	else {
		cip.setValueWithChange(field, value);
		field.trigger('input');
	}
}

cip.fillInStringFields = function(fields, StringFields, filledInFields) {
	var $filledIn = false;

    filledInFields.list = [];
	if (fields && StringFields && fields.length > 0 && StringFields.length > 0) {
        for (var i = 0; i < fields.length; i++) {
			var $sf = _fs(fields[i]);
			if ($sf && StringFields[i]) {
				//$sf.val(StringFields[i].Value);
				cip.setValue($sf, StringFields[i].Value);
                filledInFields.list.push(fields[i]);
				$filledIn = true;
			}
		}
	}

	return $filledIn;
}

cip.setValueWithChange = function(field, value) {

	if (cip.settings.respectMaxLength === true) {
		var attribute_maxlength = field.attr('maxlength');
		if (typeof attribute_maxlength !== typeof undefined &&
			$.isNumeric(attribute_maxlength) === true &&
			attribute_maxlength > 0) {

			value = value.substr(0, attribute_maxlength);
		}
	}

	field.val(value);
	field[0].dispatchEvent(new Event('input', {'bubbles': true}));
	field[0].dispatchEvent(new Event('change', {'bubbles': true}));
}

cip.fillIn = function(combination, onlyPassword, suppressWarnings) {
	// no credentials available
	if (cip.credentials.length == 0 && !suppressWarnings) {
		var message = "No logins found.";
		browser.runtime.sendMessage({
			action: 'alert',
			args: [message]
		});
		return;
	}

	var uField = _f(combination.username);
	var pField = _f(combination.password);

	// exactly one pair of credentials available
	if (cip.credentials.length == 1) {
		var filledIn = false;
		if (uField && !onlyPassword) {
			cip.setValueWithChange(uField, cip.credentials[0].login);
			filledIn = true;
		}
		if (pField) {
			pField.attr("type", "password");
			cip.setValueWithChange(pField, cip.credentials[0].password);
			pField.data("unchanged", true);
			filledIn = true;
		}

        var list = {};
		if (cip.fillInStringFields(combination.fields, cip.credentials[0].stringFields, list)) {
            cipForm.destroy(false, {"password": list.list[0], "username": list.list[1]});
            filledIn = true;
        }

		if (!filledIn) {
			if (!suppressWarnings) {
				var message = "Error #101\nCannot find fields to fill in.";
				browser.runtime.sendMessage({
					action: 'alert',
					args: [message]
				});
			}
		}
	}
	// specific login id given
	else if (combination.loginId != undefined && cip.credentials[combination.loginId]) {
		var filledIn = false;
		if (uField) {
			cip.setValueWithChange(uField, cip.credentials[combination.loginId].login);
			filledIn = true;
		}

		if (pField) {
			cip.setValueWithChange(pField, cip.credentials[combination.loginId].password);
			pField.data("unchanged", true);
			filledIn = true;
		}

        var list = {};
		if (cip.fillInStringFields(combination.fields, cip.credentials[combination.loginId].stringFields, list)) {
            cipForm.destroy(false, {"password": list.list[0], "username": list.list[1]});
            filledIn = true;
        }

		if (!filledIn) {
			if (!suppressWarnings) {
				var message = "Error #102\nCannot find fields to fill in.";
				browser.runtime.sendMessage({
					action: 'alert',
					args: [message]
				});
			}
		}
	}
	// multiple credentials available
	else {
		// check if only one password for given username exists
		var countPasswords = 0;

		if (uField) {
			var valPassword = "";
			var valUsername = "";
			var valStringFields = [];
			var valQueryUsername = uField.val().toLowerCase();

			// find passwords to given username (even those with empty username)
			for (var i = 0; i < cip.credentials.length; i++) {
				if (cip.credentials[i].login.toLowerCase() == valQueryUsername) {
					countPasswords += 1;
					valPassword = cip.credentials[i].password;
					valUsername = cip.credentials[i].login;
					valStringFields = cip.credentials[i].stringFields;
				}
			}

			// for the correct alert message: 0 = no logins, X > 1 = too many logins
			if (countPasswords == 0) {
				countPasswords = cip.credentials.length;
			}

			// only one mapping username found
			if (countPasswords == 1) {
				if (!onlyPassword) {
					cip.setValueWithChange(uField, valUsername);
				}
				if (pField) {
					cip.setValueWithChange(pField, valPassword);
					pField.data("unchanged", true);
				}

                var list = {};
				if (cip.fillInStringFields(combination.fields, valStringFields, list)) {
                    cipForm.destroy(false, {"password": list.list[0], "username": list.list[1]});
                }
			}

			// user has to select correct credentials by himself
			if (countPasswords > 1) {
				if (!suppressWarnings) {
					var message = "Error #105\nMore than one login was found in KeePassXC!\n" +
					"Press the keepassxc-browser icon for more options.";
					browser.runtime.sendMessage({
						action: 'alert',
						args: [message]
					});
				}
			}
			else if (countPasswords < 1) {
				if (!suppressWarnings) {
					var message = "Error #103\nNo credentials for given username found.";
					browser.runtime.sendMessage({
						action: 'alert',
						args: [message]
					});
				}
			}
		}
		else {
			if (!suppressWarnings) {
					var message = "Error #104\nMore than one login was found in KeePassXC!\n" +
					"Press the keepassxc-browser icon for more options.";
				browser.runtime.sendMessage({
					action: 'alert',
					args: [message]
				});
			}
		}
	}
}

cip.contextMenuRememberCredentials = function() {
	var el = document.activeElement;
	if (el.tagName.toLowerCase() != "input") {
		return;
	}

	cipFields.setUniqueId(jQuery(el));
	var fieldId = cipFields.prepareId(jQuery(el).attr("data-cip-id"));
	var combination = null;
	if (el.type && el.type.toLowerCase() == "password") {
		combination = cipFields.getCombination("password", fieldId);
	}
	else {
		combination = cipFields.getCombination("username", fieldId);
	}

	var usernameValue = "";
	var passwordValue = "";

	var usernameField = _f(combination.username);
	var passwordField = _f(combination.password);

	if (usernameField) {
		usernameValue = usernameField.val();
	}
	if (passwordField) {
		passwordValue = passwordField.val();
	}

	if (!cip.rememberCredentials(usernameValue, passwordValue)) {
		alert("Could not detect changed credentials.");
	}
};

cip.rememberCredentials = function(usernameValue, passwordValue) {
	// no password given or field cleaned by a site-running script
	// --> no password to save
	if (passwordValue == "") {
		return false;
	}

	var usernameExists = false;

	var nothingChanged = false;
	for (var i = 0; i < cip.credentials.length; i++) {
		if (cip.credentials[i].login == usernameValue && cip.credentials[i].password == passwordValue) {
			nothingChanged = true;
			break;
		}

		if (cip.credentials[i].login == usernameValue) {
			usernameExists = true;
		}
	}

	if (!nothingChanged) {
		if (!usernameExists) {
			for (var i = 0; i < cip.credentials.length; i++) {
				if (cip.credentials[i].login == usernameValue) {
					usernameExists = true;
					break;
				}
			}
		}
		var credentialsList = [];
		for (var i = 0; i < cip.credentials.length; i++) {
			credentialsList.push({
				"Login": cip.credentials[i].login,
				"Name": cip.credentials[i].name,
				"Uuid": cip.credentials[i].uuid
			});
		}

		var url = jQuery(this)[0].action;
		if (!url) {
			url = document.location.href;
			if (url.indexOf("?") > 0) {
				url = url.substring(0, url.indexOf("?"));
				if (url.length < document.location.origin.length) {
					url = document.location.origin;
				}
			}
		}

		browser.runtime.sendMessage({
			'action': 'set_remember_credentials',
			'args': [usernameValue, passwordValue, url, usernameExists, credentialsList]
		});

		return true;
	}

	return false;
};



var cipEvents = {};

cipEvents.clearCredentials = function() {
	cip.credentials = [];
	cipAutocomplete.elements = [];

	if (cip.settings.autoCompleteUsernames) {
		for (var i = 0; i < cipFields.combinations.length; i++) {
			var uField = _f(cipFields.combinations[i].username);
			if (uField) {
				if (uField.hasClass("ui-autocomplete-input")) {
					uField.autocomplete("destroy");
				}
			}
		}
	}
}

cipEvents.triggerActivatedTab = function() {
	// doesn't run a second time because of _called.initCredentialFields set to true
	cip.init();

	// initCredentialFields calls also "retrieve_credentials", to prevent it
	// check of init() was already called
	if (_called.initCredentialFields && (cip.url || cip.submitUrl) && cip.settings.autoRetrieveCredentials) {
		browser.runtime.sendMessage({
			'action': 'retrieve_credentials',
			'args': [ cip.url, cip.submitUrl ]
		}, cip.retrieveCredentialsCallback);
	}
}
