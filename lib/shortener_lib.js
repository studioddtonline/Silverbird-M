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
    var _this = this;
      this.shortenerInfo.backend.shorten(longUrl,
        function(errorCode, msg) {
      var cbMsg = null;
      var success = true;
      if(errorCode === 0 && msg) {
        cbMsg = '';
        if(_this.shortenerInfo.baseUrl) {
          cbMsg += _this.shortenerInfo.baseUrl;
          msg = msg.replace(/^.*\//g, '');
        }
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
    var url = "http://api.bit.ly/v3/shorten";
    var params = {
      format: 'json',
      longUrl: longUrl,
      login: backgroundPage.SecretKeys.bitly.login,
      apiKey: backgroundPage.SecretKeys.bitly.key
    };

    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'json'
    })
    .done(function(data, status_param) {
      var status = data.status_code;
      if(status == 200) {
        callback(0, data.data.url);
      } else {
        callback(status, data.status_txt);
      }
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

TrimShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://api.tr.im/v1/trim_url.json";
    var params = {
      url: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'json'
    })
    .done(function(data, status) {
      if(data.status.result != 'OK') {
        callback(data.status.code, data.status.message);
        return;
      }
      callback(0, data.trimpath);
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

MigremeShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://migre.me/api.json";
    var params = {
      url: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'json'
    })
    .done(function(data, status) {
      if(!data.id) {
        callback(-1, data.info);
        return;
      }
      callback(0, data.id);
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

IsGdShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://is.gd/api.php";
    var params = {
      longurl: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'text'
    })
    .done(function(data, status) {
      if(data.match(/^ERROR/i)) {
        callback(-1, data);
        return;
      }
      callback(0, data);
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

MiudinShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://miud.in/api-create.php";
    var params = {
      url: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'text'
    })
    .done(function(data, status) {
      callback(0, data);
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

UdanaxShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://udanax.org/shorturl.jsp";
    var params = {
      mode: 'api',
      longurl: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      jsonp: 'jsoncallback',
      dataType: 'jsonp'
    })
    .done(function(data, status) {
      callback(0, data.shorturl);
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

URLinlShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://urli.nl/api.php";
    var params = {
      format: 'json',
      action: 'shorturl',
      url: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'json'
    })
    .done(function(data, status) {
      if(data && data.status && data.status == 'success') {
        callback(0, data.url.keyword);
      } else {
        callback(data.statusCode, data.message);
      }
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

URLcortaShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://urlcorta.es/api/text/";
    var params = {
      url: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'text'
    })
    .done(function(data, status) {
      callback(0, data);
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
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
    });
  },
  oauthGetRequestToken: function(longUrl, callback){
    tweetManager.shortenerAuth.token = this.oauth_acessor.token = null;
    tweetManager.shortenerAuth.tokenSecret = this.oauth_acessor.tokenSecret = '';
    tweetManager.shortenerAuth.longUrl = longUrl;
    tweetManager.shortenerAuth.callback = callback;
    OptionsBackend.saveOption( 'shortener_token', this.oauth_acessor.token );
    OptionsBackend.saveOption( 'shortener_token_secret', this.oauth_acessor.tokenSecret );       
    var message = {
      action: 'https://www.google.com/accounts/OAuthGetRequestToken',
      method: 'GET',
      parameters: [
        ['scope', 'https://www.googleapis.com/auth/urlshortener'],
        ['xoauth_displayname', 'Silverbird M'],
        ['oauth_callback', chrome.extension.getURL('oauth_callback.html') ],
      ]
    };
    var _this = this;
    var success = function(data, status) {
      var paramMap = OAuth.getParameterMap(data);
      tweetManager.shortenerAuth.token = _this.oauth_acessor.token = paramMap['oauth_token'];
      tweetManager.shortenerAuth.tokenSecret = _this.oauth_acessor.tokenSecret = paramMap['oauth_token_secret'];
      _this.oauthAuthorizeToken();
    };
    var error = function(request, status, error) {
      tweetManager.shortenerAuth.callback(-1, 'Error Get Request Token: ' + 
        request.statusText + '(' + request.responseText + ')' );
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
      parameters: [['oauth_verifier', OAuth.getParameter(params,'oauth_verifier') ]],
    };
    var _this = this;
    var success = function(data, status) {
        var paramMap = OAuth.getParameterMap(data);
        tweetManager.shortenerAuth.token = _this.oauth_acessor.token = paramMap['oauth_token'];
        tweetManager.shortenerAuth.tokenSecret = _this.oauth_acessor.tokenSecret = paramMap['oauth_token_secret'];
        OptionsBackend.saveOption( 'shortener_token', _this.oauth_acessor.token );
        OptionsBackend.saveOption( 'shortener_token_secret', _this.oauth_acessor.tokenSecret );
        
        //Now that we have the token, make the proper request.
        _this.sendRequest( tweetManager.shortenerAuth.longUrl, true, tweetManager.shortenerAuth.callback );
        
        $('.debugme').append( '<br/>Authorization OK, completing request and closing tab...');
        setTimeout(function() {
          chrome.tabs.getSelected(null, function (tab) { chrome.tabs.remove(tab.id); }); 
        }, 1000 );        
    };
    var error = function( request, status, error ) {
        $('.debugme').append( '<br/>error access token: ' + '"' + request.responseText + '"(' + request.statusText + ')' );
        $('.debugme').append( '<br/>status= ' + status + ' error= ' + error );
    };
    this.sendOAuthRequest(message, success, error);
  },
  signOAuthRequest: function(message) {
    var parm= [['oauth_signature_method', 'HMAC-SHA1']];
    message.parameters.concat( parm );
    OAuth.completeRequest(message, this.oauth_acessor);
    return OAuth.getParameterMap(message.parameters);
  },
  sendOAuthRequest: function( message, successCb, errorCb ) {
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

KCYShortener = {
  shorten : function(longUrl, callback) {
    var url = 'http://kcy.me/api/';
    var params = {
      url: longUrl,
      u: login,
      key: apiKey
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'text'
    })
    .done(function(data, status) {
      var errorCode = -1;
      if(data.match(/^http/i)) {
        errorCode = 0;
      }
      callback(errorCode, data);
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

McafeeShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://mcaf.ee/api/shorten";
    var params = {
      input_url: longUrl,
      format: 'json'
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'json'
    })
    .done(function(data, status) {
      if(!data) {
        callback(-1, chrome.i18n.getMessage("ajaxFailed"));
      }
      if(data.status_code == 200 && data.data) {
        callback(0, data.data.url);
      } else {
        callback(data.status_code, data.status_txt);
      }
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

RodGsShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://rod.gs/";
    var params = {
      longurl: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'text'
    })
    .done(function(data, status) {
      if(data.match(/^ERROR/i)) {
        callback(-1, data);
        return;
      }
      callback(0, data);
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

MinifyShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://minify.us/api.php";
    var params = {
      u: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'text'
    })
    .done(function(data, status) {
      if(data.match(/^ERROR/i)) {
        callback(-1, data);
        return;
      }
      callback(0, data);
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

VaMuShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://va.mu/api/create/";
    var params = {
      url: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'text'
    })
    .done(function(data, status) {
      callback(0, data);
    })
    .fail(function (request, status, error) {
      callback(-1, chrome.i18n.getMessage("ajaxFailed"));
    });
  }
};

HurlimShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://hurl.im/api.php";
    var params = {
      signature: apiKey,
      action:  'shorturl',
      format: 'json',
      url: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: 'json'
    })
    .done(function(data, status) {
      if(data && data.status && data.shorturl) {
        callback(0, data.shorturl);
      } else {
        callback(-1, data.message);
      }
    })
    .fail(function (request, status, error) {
      callback(-1,'AJAX request failed (bad connection?)');
    });
  }
};

MaecrShortener = {
  shorten: function(longUrl, callback) {
    var url = "http://mae.cr/shorten";
    var params = {
      url: longUrl
    };
    $.ajax({
      type: 'GET',
      url: url,
      data: params
    })
    .done(function(data, status) {
      if(data) {
        callback(0, data);
      } else {
        callback(-1, "Ooops");
      }
    })
    .fail(function (request, status, error) {
      callback(-1,'AJAX request failed (bad connection?)');
    });
  }
};

SHORTENERS_BACKEND = {
  bitly: {
    desc: 'bit.ly',
    backend: BitLyShortener
  },
  jmp: {
    desc: 'j.mp',
    baseUrl: 'http://j.mp/',
    backend: BitLyShortener
  },
  trim: {
    desc: 'tr.im',
    baseUrl: 'http://tr.im/',
    backend: TrimShortener
  },
  isgd: {
    desc: 'is.gd',
    backend: IsGdShortener
  },
  migreme: {
    desc: 'migre.me',
    baseUrl: 'http://migre.me/',
    backend: MigremeShortener
  },
  miudin: {
    desc: 'miud.in',
    backend: MiudinShortener
  },
  udanax: {
    desc: 'udanax.org',
    baseUrl: 'http://udanax.org/',
    backend: UdanaxShortener
  },
  urlinl: {
    desc: 'URLi.nl',
    baseUrl: 'http://urli.nl/',
    backend: URLinlShortener
  },
  urlcorta: {
    desc: 'URLcorta.es',
    backend: URLcortaShortener
  },
  googl: {
    desc: 'goo.gl',
    backend: GooglShortener
  },
  karmacracy: {
    desc: 'karmacracy.com',
    backend: KCYShortener
  },
  mcafee: {
    desc: 'mcaf.ee',
    backend: McafeeShortener
  },
  rodgs: {
    desc: 'rod.gs',
    backend: RodGsShortener
  },
  minify: {
    desc: 'minify',
    backend: MinifyShortener
  },
  vamu: {
    desc: 'va.mu',
    backend: VaMuShortener
  },
  hurlim: {
    desc: 'hurl.im',
    backend: HurlimShortener
  },
  maecr: {
    desc: 'mae.cr',
    backend: MaecrShortener
  }
};
