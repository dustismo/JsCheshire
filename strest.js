/**
 * Javascript client for STREST protocol.  
 * 
 * Assumes a websocket is available to a server supporting STREST requests. 
 * 
 * 
 * 
 * @param url
 * @param onopen
 * @param onclose
 * @return
 */


function Strest(url, onopen, onclose) {
	//callbacks keyed by transactionId
	this.callbacks = {};
	
	var self = this;
	var _onmessage = function(event) {		
		//console.log(event.data);
		var response = new StrestResponse(event.data);
		var txnId = response.getHeader('txn.id');
		var cb = self.callbacks[txnId];
		if (!cb) {
			console.log("ERROR: No callback registered for : " + response);
			return;
		}
		if (cb['onmessage']) {
			cb.onmessage(response);
		}
		if ('complete' == response.getHeader('txn.status')) {
			if (cb['ontxncomplete']) {
				cb.ontxncomplete(txnId);
			}
			delete self.callbacks[txnId];
		}
	};
	
	var _onclose = function(event) {
		//iterate over all the waiting callbacks and send the error
		for (var k in self.callbacks) {
			var cb = self.callbacks[k];
			if (cb.onerror) {
				cb.onerror('Connection closed');
			}
		}
		self.callbacks = {};
		if (onclose) {
			onclose(event);
		}
	};
	
	var _onopen = function(event) {
		if (onopen) {
			onopen(event);
		}
	};
	
	var _onerror = function(event) {
		self.close();
	};
	
	//initialize the websocket
	if (window.WebSocket) {
		this.socket = new WebSocket(url);
		this.socket.onmessage = _onmessage;
		this.socket.onopen = _onopen;
		this.socket.onclose = _onclose;
	} else {
	  alert("Your browser does not support Web Socket.");
	}	
	
}

/*
 * Globals
 * 
 */
Strest._txnId = 0;
Strest.userAgent = "JsStrest 2.0";
Strest.protocol = "2";
Strest.txnId = function() {
	return Strest._txnId++;
};

/**
 * Sends a request.  
 * 
 * 
 * 
 * @param request
 * @param message_callback
 * @param txn_end_callback
 * @param error_callback
 * @return
 */
Strest.prototype.sendRequest = function(request, message_callback, txn_complete_callback, error_callback) {
	if (!this.connected()) {
		throw "Not yet connected!";
	}
	//set up the headers.
	if (!(request instanceof StrestRequest)) {
		request = new StrestRequest(request);
	}
	
	
	request.setHeaderIfAbsent('user-agent', Strest.userAgent);
	request.setHeaderIfAbsent('txn.id', Strest.txnId());
	request.setHeaderIfAbsent('txn.accept', 'multi');
	console.log(request)
	//register the callbacks
	this.callbacks[request.getHeader('txn.id')] = {
			'onmessage' : message_callback,
			'ontxncomplete' : txn_complete_callback,
			'onerror' : error_callback
	};
	
	var msg = request.toString();
	this.socket.send(msg);
	return request;
};

Strest.prototype.close = function() {
	if (this.connected()) {
		this.socket.close();
	}
};

Strest.prototype.connected = function() {
	if (!this.socket) {
		return false;
	}
	return this.socket.readyState == WebSocket.OPEN;	
};

function StrestMessage() {
	this.strest = {};
	this.strest.txn = {};
};

/**
 * Set a field in the request.  honors the dot operator

 * @param key
 * @param value
 * @return
 */
StrestMessage.prototype.setHeader = function(key, value) {
	var keys = key.split('.')
	var d = this['strest'];
	for (var i = 0, len = keys.length; i < len; i++) {
		var k = keys[i];
		if (i == keys.length-1) {
			d[k] = value;
		} else {
			if (!d[k]) {
				d[k] = {};	
			}
			d = d[k];	
		}
	}
	console.log(this);
};

StrestMessage.prototype.setHeaderIfAbsent = function(key, value) {
	var v = this.getHeader(key);
	if (v != null) {
		console.log("v isn't null! " + v);
		return v;
	}
	this.setHeader(key, value);
};

StrestMessage.prototype.getHeader = function(key) {
	var keys = key.split('.');
	var d = this['strest'];
	for (var i = 0, len = keys.length; i < len; i++) {
		var k = keys[i];
		d = d[k];
		if (i == keys.length-1) {
			return d;
		}
	}
	return null;
};

StrestRequest.prototype = new StrestMessage;
StrestRequest.prototype.constructor = StrestRequest;
/**
 * A strest request.  
 * 
 * example:
 * var request = new StrestRequest({ method : 'GET', uri : '/firehose'})
 * 
 * 
 * 
 * @param options 
 * uri
 * method : one of 'GET', 'POST', 'PUT', 'DELETE'
 * params : these will get added to the uri
 * 
 */
function StrestRequest(options) {
	StrestMessage.call(this);
	console.log(options);
	this.setHeader('method', options['method']);
	this.setHeader('v', Strest.protocol);
	this.setHeader('user-agent', Strest.userAgent);
	this.setHeader('uri', options['uri']);
	this.setHeader('params', options['params']);

	console.log(this);
};

StrestRequest.prototype.setUri = function(uri) {
	this.setHeader('uri', uri);
};
StrestRequest.prototype.setMethod = function(method) {
	this.setHeader('method', method);
};

StrestRequest.prototype.toString = function() {
	return JSON.stringify(this);
};


StrestResponse.prototype = new StrestMessage;
StrestResponse.prototype.constructor = StrestResponse;
/**
 * A strest response.  
 * 
 * @param options
 */
function StrestResponse(msg) {
	StrestMessage.call(this);
	this.originalText = msg;
	var tmp = JSON.parse(msg)
	for (key in tmp) {
		this[key] = tmp[key]
	}
};

StrestResponse.prototype.toString = function() {
	return this.originalText;
};

Strest.isString= function(obj) {
	if (!obj) {
		return false;
	}
	if (obj instanceof String) {
		return true;
	}
	if (typeof(obj) == 'string') {
		return true;
	}
	return false;
};

Strest.trim = function(str) {
	if (!Strest.isString(str)) {
		return str;
	}
//	http://forum.jquery.com/topic/faster-jquery-trimjavascript to
	str = str.replace(/^\s+/, '');
	for (var i = str.length - 1; i >= 0; i--) {
		if (/\S/.test(str.charAt(i))) {
			str = str.substring(0, i + 1);
			break;
		}
	}
	return str;
};