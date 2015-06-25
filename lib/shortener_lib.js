function BitLyShortener(token) {
  this.token = token || '';
}
BitLyShortener.prototype = {
  token: '',
  tokenRequested: false,
  shorten: function(longUrl, callback) {
    if(!this.token || this.token === '') {
      this.oauthGetAccessToken(longUrl, callback);
      return;
    }
    $.ajax({
      url: 'https://api-ssl.bitly.com/v3/shorten',
      method: 'GET',
      dataType: 'json',
      data: {
        format: 'json',
        access_token: this.token,
        domain: 'bit.ly',
        longUrl: longUrl
      }
    })
    .done((function(self) {
      return function(data, status, req) {
        var status = data.status_code;
        if(status == 200) {
          callback(0, data.data.url);
        } else if(status == 500) {
          self.oauthGetAccessToken(longUrl, callback);
        } else {
          callback(status, data.status_txt);
        }
      };
    })(this))
    .fail((function(self) {
      return function(req, status, error) {
        if(req.status == 401 || req.status == 500) {
          self.oauthGetAccessToken(longUrl, callback);
        } else {
          callback(-1, 'Error: ' + status);
        }
      };
    })(this));
  },
  oauthGetAccessToken: function(longUrl, callback) {
    this.token = '';
    this.tokenRequested = true;
    OptionsBackend.setDefault('shortener_token');
    chrome.tabs.create({
      "url": 'https://bitly.com/oauth/authorize?client_id=' + SecretKeys.bitly.consumerKey + '&redirect_uri=' + chrome.extension.getURL('oauth_callback.html'),
      "selected": true
    });
  },
  getAccessToken: function(searchString) {
    var params = OAuth.decodeForm(searchString.substr(1)), code;
    code = OAuth.getParameter(params, 'code');
    if(code) {
      $.ajax({
        url: 'https://api-ssl.bitly.com/oauth/access_token',
        method: 'POST',
        dataType: 'text',
        data: {
          client_id: SecretKeys.bitly.consumerKey,
          client_secret: SecretKeys.bitly.consumerSecret,
          code: code,
          redirect_uri: chrome.extension.getURL('oauth_callback.html') // need dummy
        }
      })
      .done((function(self) {
        return function(data, status, req) {
          var params = OAuth.decodeForm(data);
          var access_token = OAuth.getParameter(params, 'access_token') || '';
          self.token = access_token;
          OptionsBackend.saveOption('shortener_token', access_token);
        };
      })(this))
      .fail((function(self) {
        return function(req, status, error) {
          console.log('getToken Error');
        };
      })(this))
      .always(function() {
        self.tokenRequested = false;
        setTimeout(function() {
          chrome.tabs.getSelected(null, function(tab) {
            chrome.tabs.remove(tab.id);
          });
        }, 1000);
      });
    } else {
      $(document.body).html('<p>Bit.ly access token failed</p>');
    }
  }
};

function GooglShortener(token) {
  this.token = token || '';
}
GooglShortener.prototype = {
  token: '',
  longUrl: '',
  tokenRequested: false,
  shorten: function(longUrl, callback) {
    if(!this.token || this.token === '') {
      this.oauthAuthorizeToken();
      return;
    }
    this.sendRequest(longUrl, callback);
  },
  sendRequest: function(longUrl, callback) {
    $.ajax({
      url: 'https://www.googleapis.com/urlshortener/v1/url',
      type: 'POST',
      data: '{"longUrl":"' + longUrl + '"}',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + this.token
      }
    })
    .done((function(self) {
      return function(data, status) {
        callback(0, data.id);
      };
    })(this))
    .fail((function(self) {
      return function (request, status, error) {
        var fmtError = ' Error: ' + request.statusText;
        if(request.status == 401) {//Our token probably got revoked. (401 - Unauthorized)
          self.oauthAuthorizeToken();
        } else {
          callback(-1, fmtError);
        }
      };
    })(this));
  },
  oauthAuthorizeToken: function() {
    var authPageUrl = "https://accounts.google.com/o/oauth2/auth?" + [
      ['response_type', 'code'].join('='),
      ['client_id', encodeURIComponent(SecretKeys.google.clientId)].join('='),
      ['redirect_uri', encodeURIComponent('urn:ietf:wg:oauth:2.0:oob')].join('='),
      ['scope', encodeURIComponent('https://www.googleapis.com/auth/urlshortener')].join('=')
    ].join('&');
    chrome.tabs.create({
      "url": authPageUrl,
      "selected": true
    }, (function(self) {
      return function(tab) {
        var intervalId = setInterval(function() {
          chrome.tabs.get(tab.id, function(tab) {
            if(!tab) {
              clearInterval(intervalId);
              return;
            }
            var url = new URL(tab.url);
            if((url.origin + url.pathname) === 'https://accounts.google.com/o/oauth2/approval') {
              clearInterval(intervalId);
              chrome.runtime.onMessage.addListener(function(message) {
                if(message
                && message.context && message.context === "approval"
                && message.site && message.site === "google"
                && message.code
                && !self.tokenRequested) {
                  self.getAccessToken(message.code);
                }
              });
              chrome.tabs.executeScript(tab.id, {
                code: `chrome.runtime.sendMessage("${chrome.runtime.id}", {context: "approval", site: "google", code: document.querySelector("#code").value}, function() {window.close();});`
              }, function() {
                chrome.tabs.remove(tab.id);
              });
            }
          });
        }, 250);
      };
    })(this));
  },
  getAccessToken: function(code) {
    this.tokenRequested = true;
    var p = new Promise(function(resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('POST', 'https://www.googleapis.com/oauth2/v3/token?' + [
        ['code', encodeURIComponent(code)].join('='),
        ['client_id', encodeURIComponent(SecretKeys.google.clientId)].join('='),
        ['client_secret', encodeURIComponent(SecretKeys.google.clientSecret)].join('='),
        ['redirect_uri', encodeURIComponent('urn:ietf:wg:oauth:2.0:oob')].join('='),
        ['grant_type', 'authorization_code'].join('=')
      ].join('&'));
      x.responseType = 'json';
      x.onload = resolve;
      x.onerror = reject;
      x.ontimeout = reject;
      x.onabort = reject;
      x.send();
    });
    p.then((function(self) {
      return function(event) {
        self.tokenRequested = false;
        self.token = event.target.response.access_token;
        OptionsBackend.saveOption('shortener_token', self.token);
      };
    })(this)).catch((function(self) {
      return function(event) {
        self.tokenRequested = false;
        console.log(event);
      };
    })(this));
  }
};

function Shortener(backendId) {
  this.backend = this.create(backendId);
}

Shortener.prototype = {
  backend: null,
  services: ['bit.ly', 'goo.gl'],
  defaultService: 'bit.ly',
  create: function(service) {
    switch(service) {
      case 'bitly': // for backward compatibility
        OptionsBackend.saveOption('url_shortener', 'bit.ly');
      case 'bit.ly':
        return new BitLyShortener(OptionsBackend.get('shortener_token'));
      case 'googl': // for backward compatibility
        OptionsBackend.saveOption('url_shortener', 'goo.gl');
      case 'goo.gl':
        return new GooglShortener(OptionsBackend.get('shortener_token'));
      default:
        OptionsBackend.saveOption('url_shortener', this.defaultService);
        return this.create.call(this, this.defaultService);
    }
  },
  shorten: function(longUrl, callback) {
    this.backend.shorten(longUrl, function(errorCode, msg) {
      var cbMsg = null, success = true;
      if(errorCode === 0 && msg) {
        cbMsg = msg;
      } else if(errorCode !== 0 && msg) {
        cbMsg = 'Error ' + errorCode + ': ' + msg;
        success = false;
      } else {
        cbMsg = 'Unknown Error';
        success = false;
      }
      callback(success, cbMsg, longUrl);
    });
  }
};
