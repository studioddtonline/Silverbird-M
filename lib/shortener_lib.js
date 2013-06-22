var backgroundPage = chrome.extension.getBackgroundPage();
var tweetManager = backgroundPage.TweetManager.instance;

function Shortener(backendId) {
  if(!backendId) {
    backendId = 'bitly';
  }
  this.shortenerInfo = SHORTENERS_BACKEND[backendId];
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

BitLyShortener = {
  shorten: function(longUrl, callback) {
    if(tweetManager.shortenerAuth.token == null) {
      this.oauthGetAccessToken(longUrl, callback);
      return;
    }
    var _this = this;
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
    .done(function(data, status, req) {
      var status = data.status_code;
      if(status == 200) {
        callback(0, data.data.url);
      } else {
        callback(status, data.status_txt);
      }
    })
    .fail(function(req, status, error) {
      if(req.status == 401 || req.status == 500) {
        _this.oauthGetAccessToken(longUrl, callback);
      }
      callback(-1, 'Error: ' + status);
    })
    .always(function() {
      _this = null;
    });
  },
  oauthGetAccessToken: function(longUrl, callback) {
    var _this = this;
    $.ajax({
      url: 'https://api-ssl.bitly.com/oauth/access_token',
      method: 'POST',
      dataType: 'text',
      data: {
        client_id: backgroundPage.SecretKeys.bitly.consumerKey,
        client_secret: backgroundPage.SecretKeys.bitly.consumerSecret
      },
      beforeSend: function(req) {
        req.setRequestHeader("Authorization", "Basic " + backgroundPage.SecretKeys.bitly.oauth2);
      }
    })
    .done(function(data, status, req) {
      tweetManager.shortenerAuth.token = data;
      OptionsBackend.saveOption('shortener_token', data);
      _this.shorten(longUrl, callback);
    })
    .fail(function(req, status, error) {
      callback(-1, 'Error: ' + status);
    })
    .always(function() {
      _this = null;
    });
  }
};

GooglShortener = {
  Url: 'https://www.googleapis.com/urlshortener/v1/url',
  ApiKey: backgroundPage.SecretKeys.google.key,
  
  shorten: function(longUrl, callback) {
    if( tweetManager.shortenerAuth.token == null ) {
      this.oauthGetRequestToken(longUrl, callback);
      return;
    }
    this.sendRequest( longUrl, callback );
  },
  sendRequest: function( longUrl, callback) {
    var _this = this;
    var url = this.Url + '?key=' + this.ApiKey;
    $.ajax({
      url: url,
      type: 'POST',
      data: '{ "longUrl" : "' + longUrl + '"}',
      contentType: 'application/json'
    })
    .done(function(data, status) {
      callback(0, data.id);
    })
    .fail(function (request, status, error) {
      var fmtError = ' Error: ' + request.statusText;
      if(request.status == 401) {//Our token probably got revoked. (401 - Unauthorized)
        _this.oauthGetRequestToken(longUrl, callback);
      } else {
        callback(-1, fmtError);
      }
    })
    .always(function() {
      _this = null;
    });
  },
  oauthGetRequestToken: function(longUrl, callback){
    tweetManager.shortenerAuth.token = this.oauth_acessor.token = null;
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
    var _this = this;
    var success = function(data, status) {
      var paramMap = OAuth.getParameterMap(data);
      tweetManager.shortenerAuth.token = _this.oauth_acessor.token = paramMap['oauth_token'];
      tweetManager.shortenerAuth.tokenSecret = _this.oauth_acessor.tokenSecret = paramMap['oauth_token_secret'];
      _this.oauthAuthorizeToken();
      _this = null;
    };
    var error = function(request, status, error) {
      tweetManager.shortenerAuth.callback(-1, 'Error Get Request Token: ' + request.statusText + '(' + request.responseText + ')');
      _this = null;
    };
    this.sendOAuthRequest( message, success, error );
  },
  oauthAuthorizeToken: function() {
    chrome.tabs.create({
      "url": 'https://www.google.com/accounts/OAuthAuthorizeToken?oauth_token=' + this.oauth_acessor.token,
      "selected": true
    });
    tweetManager.shortenerAuth.tokenRequested = true;
  },
  getAccessToken: function( searchString ) {
    var params = OAuth.decodeForm(searchString.substr(1));
    this.oauth_acessor.token = OAuth.getParameter(params,'oauth_token');
    tweetManager.shortenerAuth.tokenRequested = false;
    var message = {
      action: 'https://www.google.com/accounts/OAuthGetAccessToken',
      method: 'GET',
      parameters: [['oauth_verifier', OAuth.getParameter(params,'oauth_verifier')]],
    };
    var _this = this;
    var success = function(data, status) {
      var paramMap = OAuth.getParameterMap(data);
      tweetManager.shortenerAuth.token = _this.oauth_acessor.token = paramMap['oauth_token'];
      tweetManager.shortenerAuth.tokenSecret = _this.oauth_acessor.tokenSecret = paramMap['oauth_token_secret'];
      OptionsBackend.saveOption('shortener_token', _this.oauth_acessor.token);
      OptionsBackend.saveOption('shortener_token_secret', _this.oauth_acessor.tokenSecret);

      //Now that we have the token, make the proper request.
      _this.sendRequest( tweetManager.shortenerAuth.longUrl, true, tweetManager.shortenerAuth.callback );

      $('.debugme').append( '<br/>Authorization OK, completing request and closing tab...');
      setTimeout(function() {
        chrome.tabs.getSelected(null, function (tab) { chrome.tabs.remove(tab.id); }); 
      }, 1000 );     
      _this = null;   
    };
    var error = function( request, status, error ) {
      $('.debugme')
      .append('<br/>error access token: ' + '"' + request.responseText + '"(' + request.statusText + ')')
      .append('<br/>status= ' + status + ' error= ' + error);
      _this = null;
    };
    this.sendOAuthRequest(message, success, error);
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
      data: this.signOAuthRequest( message )
    })
    .done(successCb)
    .fail(errorCb);
  },
  oauth_acessor: {
    consumerKey: backgroundPage.SecretKeys.google.consumerKey,
    consumerSecret: backgroundPage.SecretKeys.google.consumerSecret,
    tokenSecret: tweetManager.shortenerAuth.tokenSecret,
    token: tweetManager.shortenerAuth.token,
  }
};

SHORTENERS_BACKEND = {
  bitly: {
    desc: 'bit.ly',
    backend: BitLyShortener
  },
  googl: {
    desc: 'goo.gl',
    backend: GooglShortener
  }
};
