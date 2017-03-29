/*
 * cryptoHelpers.js: implements AES - Advanced Encryption Standard
 * from the SlowAES project, http://code.google.com/p/slowaes/
 *
 * Copyright (c) 2008 	Josh Davis ( http://www.josh-davis.org ),
 *						Mark Percival ( http://mpercival.com ),
 *						Johan Sundstrom ( http://ecmanaut.blogspot.com ),
 *			 			John Resig ( http://ejohn.org )
 *
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/
 */

var cryptoHelpers = {
	// encodes a unicode string to UTF8 (8 bit characters are critical to AES functioning properly)
	encode_utf8:function(s)
	{
		try{return unescape(encodeURIComponent(s));}
		catch(e){throw 'error during utf8 encoding: cryptoHelpers.encode_utf8.';}
	},

	// decodes a UTF8 string back to unicode
	decode_utf8:function(s)
	{
		try{return decodeURIComponent(escape(s));}
		catch(e){throw('error during utf8 decoding: cryptoHelpers.decode_utf8.');}
	},

	//convert a number array to a hex string
	toHex:function()
	{
		var array = [];
		if(arguments.length == 1 && arguments[0].constructor == Array)
			array = arguments[0];
		else
			array = arguments;
		var ret = '';
		for(var i = 0;i < array.length;i++)
			ret += (array[i] < 16 ? '0' : '') + array[i].toString(16);
		return ret.toLowerCase();
	},

	//convert a hex string to a number array
	toNumbers:function(s)
	{
		var ret = [];
		s.replace(/(..)/g,function(s){
			ret.push(parseInt(s,16));
		});
		return ret;
	},

	// get a random number in the range [min,max]
	getRandom:function(min,max)
	{
		if(min === null)
			min = 0;
		if(max === null)
			max = 1;
		return Math.floor(Math.random()*(max+1)) + min;
	},

	generateSharedKey:function(len)
	{
		if(len === null)
			len = 16;
		var key = [];
		for(var i = 0; i < len*2; i++)
			key.push(this.getRandom(0,255));
		return key;
	},

	generatePrivateKey:function(s,size)
	{
		var sha = jsHash.sha2.arr_sha256(s);
		return sha.slice(0,size);
	},

	convertStringToByteArray: function(s)
	{
		var byteArray = [];
		for(var i = 0;i < s.length;i++)
				{
						byteArray.push(s.charCodeAt(i));
				}
		return byteArray;
	},

	convertByteArrayToString: function(byteArray)
	{
		var s = '';
		for(var i = 0;i < byteArray.length;i++)
				{
						s += String.fromCharCode(byteArray[i])
				}
		return s;
	},

	base64: {
		// Takes a Nx16x1 byte array and converts it to Base64
		chars: [
		'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
		'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
		'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X',
		'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f',
		'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n',
		'o', 'p', 'q', 'r', 's', 't', 'u', 'v',
		'w', 'x', 'y', 'z', '0', '1', '2', '3',
		'4', '5', '6', '7', '8', '9', '+', '/',
		'=', // for decoding purposes
		],

		encode_line: function(flatArr){
			var b64 = '';

			for (var i = 0; i < flatArr.length; i += 3){
				b64 += this.chars[flatArr[i] >> 2];
				b64 += this.chars[((flatArr[i] & 3) << 4) | (flatArr[i + 1] >> 4)];
				if (!(flatArr[i + 1] == null)){
					b64 += this.chars[((flatArr[i + 1] & 15) << 2) | (flatArr[i + 2] >> 6)];
				}else{
					b64 += '=';
				}
				if (!(flatArr[i + 2] == null)){
					b64 += this.chars[flatArr[i + 2] & 63];
				}else{
					b64 += '=';
				}
			}
			return b64;
		},

		encode: function(flatArr)
		{
			var b64 = this.encode_line(flatArr);
			// OpenSSL is super particular about line breaks
			var broken_b64 = b64.slice(0, 64) + '\n';
			for (var i = 1; i < (Math.ceil(b64.length / 64)); i++)
			{
				broken_b64 += b64.slice(i * 64, i * 64 + 64) + (Math.ceil(b64.length / 64) == i + 1 ? '': '\n');
			}
			return broken_b64;
		},

	    decode: function(string)
		{
			string = string.replace(/[\r\n\t ]+/g, '') + '===='; // drop all whitespaces and pad with '=' (end of b64 marker)
			var flatArr = [];
			var c = [];
			var b = [];
			for (var i = 0; ; i = i + 4){
				c[0] = this.chars.indexOf(string.charAt(i));
				if(c[0] == 64){
					return flatArr;
				}
				c[1] = this.chars.indexOf(string.charAt(i + 1));
				c[2] = this.chars.indexOf(string.charAt(i + 2));
				c[3] = this.chars.indexOf(string.charAt(i + 3));

				if(
					(c[0] < 0) || // char1 is wrong
					(c[1] < 0) || (c[1] == 64) || // char2 is wrong
					(c[2] < 0) || // char3 is neither an valid char nor '='
					(c[3] < 0)    // char4 is neither an valid char nor '='
				){
					throw 'error during base64 decoding at pos '+i+': cryptoHelpers.base64.decode.';
				}

				flatArr.push((c[0] << 2) | (c[1] >> 4));
				if(c[2] >= 0 && c[2] < 64){
					flatArr.push(((c[1] & 15) << 4) | (c[2] >> 2));
					if(c[3] >= 0 && c[2] < 64){
						flatArr.push(((c[2] & 3) << 6) | c[3]);
					}
				}
			}
		},

	},

};
