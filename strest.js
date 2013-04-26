/**
 * Javascript client for STREST protocol.  
 * 
 * Assumes a websocket is available to a server supporting STREST requests. 
 * 
 * 
 * 
 * @return
 */


function Strest(config) {

	this.config = $.extend({
		//The url to connect to
		url : "Connectionurl",
		//called when the connection is closed
		onclose : function(event) {

		},
		//called when the connection is opened
		onopen : function(event) {

		},
		//will attempt to keep the connection live
		//will attempt to reconnect if the connection 
		// is broken.  onclose, onopen will still be
		// called on reconnect
		keepalive : true,
		//the endpoint to use for keep alives
		//endpoint only needs to return a 200 strest packet
		ping : "/ping"
	}, config)

	//callbacks keyed by transactionId
	this.callbacks = {};

	this.pingTimer = null
	this.reconnectTimer = null

	var self = this;
	this._onmessage = function(event) {		
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
	
	this._onclose = function(event) {
		//iterate over all the waiting callbacks and send the error
		for (var k in self.callbacks) {
			var cb = self.callbacks[k];
			if (cb.onerror) {
				cb.onerror('Connection closed');
			}
		}
		self.callbacks = {};
		if (self.pingTimer) {
			clearInterval(self.pingTimer)
			self.pingTimer = null
		}
		if (self.config.onclose) {
			self.config.onclose(event);
		}

		if (self.config.keepalive) {
			if (self.reconnectTimer) {
				clearInterval(self.reconnectTimer)
			}
			self.reconnectTimer = setInterval(function() {
				console.log("reconnect attempt");
				self.connect();
			}, 4000)
		}
	};
	
	this._onopen = function(event) {
		//clear the reconnect timer
		if (self.reconnectTimer) {
			clearInterval(self.reconnectTimer)
		}

		//start ping timer.
		if (self.config.keepalive && self.config.ping) {
			//this should never be, but best to be extra safe
			if (self.pingTimer) {
				clearInterval(self.pingTimer)
				self.pingTimer = null
			}
			self.pingTimer = setInterval(function() {
				self.sendRequest({
                    uri : self.config.ping
                  },
                  function(response) {},
                  function(txnId) {},
                  function(error) {
                  	//ping error
                  	console.log("Ping error!", error)
                  	self.close()
                  }
                );
			}, 20000)
		}

		if (self.config.onopen) {
			self.config.onopen(event);
		}
	};
	
	this._onerror = function(event) {
		self.close();
	};
	
	
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

Strest.prototype.close = function() {
	if (this.connected()) {
		this.socket.close();
	}
};

//connect to the websocket
Strest.prototype.connect = function() {
	if (this.connected()) {
		console.log("already connected")
		return;
	}
	//initialize the websocket
	if (window.WebSocket) {
		this.socket = new WebSocket(this.config.url);
		this.socket.onmessage = this._onmessage;
		this.socket.onopen = this._onopen;
		this.socket.onclose = this._onclose;
	} else {
	  alert("Your browser does not support Web Socket.");
	}
};


Strest.prototype.connected = function() {
	if (!this.socket) {
		return false;
	}
	return this.socket.readyState == WebSocket.OPEN;	
};

/**
 * Sends a request.  
 * 
 * 
 * 
 * @param request
 * @param message_callback(response)
 * @param txn_end_callback(txnId)
 * @param error_callback(error)
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
	
	request.setHeaderIfAbsent('method', 'GET');
	request.setHeaderIfAbsent('user-agent', Strest.userAgent);
	request.setHeaderIfAbsent('txn.id', Strest.txnId());
	request.setHeaderIfAbsent('txn.accept', 'multi');
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
};

StrestMessage.prototype.setHeaderIfAbsent = function(key, value) {
	var v = this.getHeader(key);
	if (v != null) {
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
	// console.log(options);
	this.setHeader('method', options['method']);
	this.setHeader('v', Strest.protocol);
	this.setHeader('user-agent', Strest.userAgent);
	this.setHeader('uri', options['uri']);
	this.setHeader('params', options['params']);

	// console.log(this);
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