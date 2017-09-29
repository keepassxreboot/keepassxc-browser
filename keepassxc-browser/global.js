var isFirefox = function() {
	if (!(/Chrome/.test(navigator.userAgent) && /Google/.test(navigator.vendor))) {
		return true;
	}
	return false;
};
