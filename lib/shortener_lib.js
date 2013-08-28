var tweetManager = TweetManager.instance;

BitLyShortener = {
  shorten: function(longUrl, callback) {
    if(!tweetManager.shortenerAuth.token || tweetManager.shortenerAuth.token === '') {
      this.oauthGetAccessToken(longUrl, callback);
      return;
    }
    $.ajax({
      url: 'https://api-ssl.bitly.com/v3/shorten',
      method: 'GET',
      dataType: 'json',
      data: {
        format: 'json',
        access_token: tweetManager.shortenerAuth.token,
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
    tweetManager.shortenerAuth.token = '';
    OptionsBackend.setDefault('shortener_token');
    chrome.tabs.create({
      "url": 'https://bitly.com/oauth/authorize?client_id=' + SecretKeys.bitly.consumerKey + '&redirect_uri=' + chrome.extension.getURL('oauth_callback.html'),
      "selected": true
    });
    tweetManager.shortenerAuth.tokenRequested = true;
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
          tweetManager.shortenerAuth.token = access_token;
          OptionsBackend.saveOption('shortener_token', access_token);
        };
      })(this))
      .fail((function(self) {
        return function(req, status, error) {
          console.log('getToken Error');
        };
      })(this))
      .always(function() {
        tweetManager.shortenerAuth.tokenRequested = false;
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

GooglShortener = {
  Url: 'https://www.googleapis.com/urlshortener/v1/url',
  ApiKey: SecretKeys.google.key,
  shorten: function(longUrl, callback) {
    if(!tweetManager.shortenerAuth.token || tweetManager.shortenerAuth.token === '') {
      this.oauthGetRequestToken(longUrl, callback);
      return;
    }
    this.sendRequest(longUrl, callback);
  },
  sendRequest: function(longUrl, callback) {
    var url = this.Url + '?key=' + this.ApiKey;
    $.ajax({
      url: url,
      type: 'POST',
      data: '{"longUrl":"' + longUrl + '"}',
      contentType: 'application/json'
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
          self.oauthGetRequestToken(longUrl, callback);
        } else {
          callback(-1, fmtError);
        }
      };
    })(this));
  },
  oauthGetRequestToken: function(longUrl, callback){
    tweetManager.shortenerAuth.token = this.oauth_acessor.token = '';
    tweetManager.shortenerAuth.tokenSecret = this.oauth_acessor.tokenSecret = '';
    tweetManager.shortenerAuth.longUrl = longUrl;
    tweetManager.shortenerAuth.callback = callback;
    OptionsBackend.saveOption('shortener_token', this.oauth_acessor.token);
    OptionsBackend.saveOption('shortener_token_secret', this.oauth_acessor.tokenSecret);
    var message = {
      action: 'https://www.google.com/accounts/OAuthGetRequestToken',
      method: 'GET',
      parameters: [
        ['scope', 'https://www.googleapis.com/auth/urlshortener'],
        ['xoauth_displayname', 'Silverbird M'],
        ['oauth_callback', chrome.extension.getURL('oauth_callback.html')]
      ]
    };
    this.sendOAuthRequest(message, (function(self) {
      return function(data, status) {
        var paramMap = OAuth.getParameterMap(data);
        tweetManager.shortenerAuth.token = self.oauth_acessor.token = paramMap['oauth_token'];
        tweetManager.shortenerAuth.tokenSecret = self.oauth_acessor.tokenSecret = paramMap['oauth_token_secret'];
        self.oauthAuthorizeToken();
      };
    })(this), (function(self) {
      return function(request, status, error) {
        tweetManager.shortenerAuth.callback(-1, 'Error Get Request Token: ' + request.statusText + '(' + request.responseText + ')');
      };
    })(this));
  },
  oauthAuthorizeToken: function() {
    chrome.tabs.create({
      "url": 'https://www.google.com/accounts/OAuthAuthorizeToken?oauth_token=' + this.oauth_acessor.token,
      "selected": true
    });
    tweetManager.shortenerAuth.tokenRequested = true;
  },
  getAccessToken: function(searchString) {
    var params = OAuth.decodeForm(searchString.substr(1));
    this.oauth_acessor.token = OAuth.getParameter(params,'oauth_token');
    tweetManager.shortenerAuth.tokenRequested = false;
    var message = {
      action: 'https://www.google.com/accounts/OAuthGetAccessToken',
      method: 'GET',
      parameters: [['oauth_verifier', OAuth.getParameter(params,'oauth_verifier')]],
    };
    this.sendOAuthRequest(message, (function(self) {
      return function(data, status) {
        var paramMap = OAuth.getParameterMap(data);
        tweetManager.shortenerAuth.token = self.oauth_acessor.token = paramMap['oauth_token'];
        tweetManager.shortenerAuth.tokenSecret = self.oauth_acessor.tokenSecret = paramMap['oauth_token_secret'];
        OptionsBackend.saveOption('shortener_token', self.oauth_acessor.token);
        OptionsBackend.saveOption('shortener_token_secret', self.oauth_acessor.tokenSecret);

        //Now that we have the token, make the proper request.
        self.sendRequest(tweetManager.shortenerAuth.longUrl, tweetManager.shortenerAuth.callback);

        $('.debugme').append('<br/>Authorization OK, completing request and closing tab...');
        setTimeout(function() {
          chrome.tabs.getSelected(null, function(tab) {chrome.tabs.remove(tab.id);}); 
        }, 1000);
      };
    })(this), (function(self) {
      return function(request, status, error) {
        $('.debugme')
        .append('<br/>error access token: ' + '"' + request.responseText + '"(' + request.statusText + ')')
        .append('<br/>status= ' + status + ' error= ' + error);
      };
    })(this));
  },
  signOAuthRequest: function(message) {
    var parm= [['oauth_signature_method', 'HMAC-SHA1']];
    message.parameters.concat(parm);
    OAuth.completeRequest(message, this.oauth_acessor);
    return OAuth.getParameterMap(message.parameters);
  },
  sendOAuthRequest: function(message, successCb, errorCb) {
    $.ajax({
      type: message.method,
      url: message.action,
      data: this.signOAuthRequest(message)
    })
    .done(successCb)
    .fail(errorCb);
  },
  oauth_acessor: {
    consumerKey: SecretKeys.google.consumerKey,
    consumerSecret: SecretKeys.google.consumerSecret,
    tokenSecret: tweetManager.shortenerAuth.tokenSecret,
    token: tweetManager.shortenerAuth.token
  }
};

function Shortener(backendId) {
  if(!backendId) {
    backendId = 'bitly';
  }
  this.backends = {
    bitly: {
      desc: 'bit.ly',
      backend: BitLyShortener
    },
    googl: {
      desc: 'goo.gl',
      backend: GooglShortener
    }
  };
  this.shortenerInfo = this.backends[backendId];
}

Shortener.prototype = {
  shorten: function(longUrl, callback) {
    var baseUrl = this.shortenerInfo.baseUrl;
    this.shortenerInfo.backend.shorten(longUrl, function(errorCode, msg) {
      var cbMsg = null, success = true;
      if(errorCode === 0 && msg) {
        cbMsg = '';
        if(baseUrl) {
          cbMsg += baseUrl;
          msg = msg.replace(/^.*\//g, '');
        }
        baseUrl = null;
        cbMsg += msg;
      } else if(errorCode !== 0 && msg) {
        cbMsg = 'Error ' + errorCode + ': ' + msg;
        success = false;
      } else {
        cbMsg = 'Unknown Error';
        success = false;
      }
      callback(success, cbMsg);
    });
  }
};
