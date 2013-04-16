function TwitterLib(onAuthenticated, onHitsUpdated, oauthTokenData) {
  this.onAuthenticated = onAuthenticated;
  this.rateLimits = {};
  this.onHitsUpdated = onHitsUpdated;
  this.ignoreRequests = false;
  this.lastAccessLevel = null;
  var _this = this;
  this.oauthLib = new TwitterOAuth(oauthTokenData, function() {
    _this.updateWindowHitsLimit();
    _this.verifyCredentials(function() {
      _this.onAuthenticated();
    });
  });

  TwitterLib.URLS = {
    BASE: 'https://api.twitter.com/1.1/',
    BASE_OAUTH: 'https://api.twitter.com/oauth/',
    BASE_SIGNING: 'https://api.twitter.com/1.1/',
    BASE_OAUTH_SIGNING: 'https://api.twitter.com/oauth/'
  };
}
TwitterLib.prototype = {
  snowflakeIdRegexp: /^(.*)_str$/,

  username: function() {
    return this.oauthLib.screen_name;
  },
  authenticated: function() {
    return this.oauthLib.authenticated;
  },
  tokenRequested: function() {
    return this.oauthLib.tokenRequested;
  },
  authenticating: function() {
    return this.oauthLib.authenticating;
  },
  startAuthentication: function() {
    if(!this.oauthLib.authenticating) {
      this.oauthLib.getRequestToken();
    }
  },
  generateOauthHeader: function(signedData, includeRealm) {
    var authorization = 'OAuth ';
    if(includeRealm) {
      authorization += 'realm="https://api.twitter.com/", ';
    }

    authorization +=
      'oauth_consumer_key="' + signedData.oauth_consumer_key + '", ' +
      'oauth_nonce="' + encodeURIComponent(signedData.oauth_nonce) + '", ' +
      'oauth_signature="' + encodeURIComponent(signedData.oauth_signature) + '", ' +
      'oauth_signature_method="HMAC-SHA1", ' +
      'oauth_timestamp="' + signedData.oauth_timestamp + '", ' +
      'oauth_token="' + signedData.oauth_token + '", ' +
      'oauth_version="1.0"';

    return authorization;
  },
  signOauthEcho: function(xhr, url) {
    var signedData = this.oauthLib.prepareSignedParams(url, {}, 'GET');

    xhr.setRequestHeader('X-Auth-Service-Provider', url);
    xhr.setRequestHeader('X-Verify-Credentials-Authorization', this.generateOauthHeader(signedData, true));
  },
  signOauth: function(xhr, url, params, method) {
    var signedData = this.oauthLib.prepareSignedParams(url, params, method);

    xhr.setRequestHeader('Authorization', this.generateOauthHeader(signedData));
  },
  ajaxRequest: function(url, callback, context, requestParams, httpMethod, overriddenTimeout) {
    if(!httpMethod) {
      httpMethod = "GET";
    }
    if(!requestParams) {
      requestParams = {};
    }
    var apiName = url.split('/').slice(0, 2).join('/');
    if(!this.rateLimits[apiName]) this.rateLimits[apiName] = {};
    var requestUrl = TwitterLib.URLS.BASE + url + ".json";
    var _this = this;
    var beforeSendCallback = function(request, settings) {
      var now = (new Date()).getTime();
      if(_this.rateLimits[apiName].remaining == 0) {
        var resetRemain = now - _this.rateLimits[apiName].reset;
        if(resetRemain < 0) {
          request.abort();
          return;
        }
      }
      var signingUrl = TwitterLib.URLS.BASE_SIGNING + url + ".json";
      _this.signOauth(request, signingUrl, requestParams, httpMethod);
    };
    var errorCallback = function (request, status, error) {
      if(_this.ignoreRequests) {
        return;
      }
      console.warn("Failed Request", requestUrl + '?' + $.param(requestParams), request, status, error);
      var fmtError;
      if(status == 'timeout') {
        fmtError = "(timeout)";
      } else if(status == 'canceled') {
        fmtError = "(Too Many Requests)";
      } else {
        try {
          if(request && request.readyState == 4) {
            if(request.status == 401) {
              if(_this.oauthLib.adjustTimestamp(request, 'Date')) {
                console.log('Unauthorized, trying again using adjusted timestamp based on server time.');
                _this.ajaxRequest(url, callback, context, requestParams, httpMethod, overriddenTimeout);
                return;
              } else if(url.match('verify_credentials')) {
                _this.ignoreRequests = true;
                TweetManager.instance.signoutAndReauthenticate();
              }
            } else if(request.status == 403 && url.match('direct_messages')) {
              var accessLevel = request.getResponseHeader('X-Access-Level') || _this.lastAccessLevel;
              if(accessLevel) {
                if(accessLevel.match('directmessages')) {
                  // The permission level is correct so that's some bizarre glitch
                  TweetManager.instance.disableDMS();
                } else {
                  _this.ignoreRequests = true;
                  TweetManager.instance.signoutAndReauthenticate();
                }
              }
            } else if(request.status == 429) {
              fmtError = "(Too Many Requests)";
            }
          }
        } catch(e) {
          /* Ignoring */
        }
      }
      if(!fmtError) {
        try {
          if(!request.responseText) {
            throw 'no response';
          }
          var rspObj = JSON.parse(request.responseText);
          fmtError = url + ': "' + rspObj.error + '"(' + request.statusText + ')';
        } catch(e) {
          fmtError = url + ': "' + (error || request.statusText) + '"(' + status + ')';
        }
      }
      callback(false, null, fmtError, context, request);
    };
    var successCallback = function(data, status, request) {
      if(_this.ignoreRequests) {
        return;
      }
      if(request.status === 0) {
        // Empty responses are a pain...
        errorCallback(request, 'error', 'empty response');
        return;
      }
      if(!data) {
        data = [];
      }else if(url == 'search/tweets') {
        data = data.statuses;
      }
      _this.normalizeTweets(data);
      callback(true, data, status, context, request);
    };
    $.ajax({
      type: httpMethod,
      url: requestUrl,
      data: requestParams,
      dataType: "json",
      timeout: overriddenTimeout,
      beforeSend: beforeSendCallback
    })
    .done(successCallback)
    .fail(errorCallback)
    .always(function(data, status, request){
      try {
        var allHeaders = request.getAllResponseHeaders().split("\n");
        $.each(allHeaders, function(index, header) {
          switch( true ) {
            case (/X-Rate-?Limit-Remaining/i).test(header):
              _this.rateLimits[apiName].remaining = parseInt(header.split(/:\s*/)[1], 10);
              break;
            case (/X-Rate-?Limit-Reset/i).test(header):
              _this.rateLimits[apiName].reset = parseInt(header.split(/:\s*/)[1], 10) * 1000;
              break;
            case (/X-Rate-?Limit-Limit/i).test(header):
              _this.rateLimits[apiName].limit = parseInt(header.split(/:\s*/)[1], 10);
              break;
            case (/X-Access-Level/i).test(header):
              _this.lastAccessLevel = header.split(/:\s*/)[1];
              break;
          }
          _this.rateLimits[apiName].last = (new Data()).getTime();
        });
        _this.onHitsUpdated(_this.rateLimits);
      } catch(e) {
        if(status == 'canceled') {
          _this.rateLimits[apiName].remaining = 0;
          _this.onHitsUpdated(_this.rateLimits);
        }
      }
    })
  },

  normalizeTweets: function(tweetsOrTweet) {
    if(tweetsOrTweet.hasOwnProperty('id_str')) {
      tweetsOrTweet = [tweetsOrTweet];
    }
    for(var i = 0, len = tweetsOrTweet.length; i < len; ++i) {
      var ti = tweetsOrTweet[i];

      // Damn Snowflake... Damn 53 bits precision limit...
      this.checkSnow(ti);

      if(!ti.user) {
        // DMs
        ti.user = ti.sender;
      }
      if(!ti.user) {
        // Search result
        ti.user = {
          name: ti.from_user,
          screen_name: ti.from_user,
          profile_image_url: ti.profile_image_url
        };
      }
    }
  },

  checkSnow: function(ti) {
    if (!ti) {
      return;
    }
    var regExp = this.snowflakeIdRegexp;
    for (var prop in ti) {
      if (!ti.hasOwnProperty(prop)) {
        continue;
      }
      if (typeof ti[prop] === 'object') {
        this.checkSnow(ti[prop]);
        continue;
      }
      var m = prop.match(regExp);
      if (m) {
        ti[m[1]] = ti[prop];
      }
    }
  },

  verifyCredentials: function(callback) {
    var _this = this;
    this.ajaxRequest("account/verify_credentials", function(success, data) {
      if(success) {
        _this.oauthLib.screen_name = data.screen_name;
      }
      if(callback) {
        callback(success, data);
      }
    });
  },

  remainingHitsInfo: function() {
    return this.rateLimits;
  },

  updateWindowHitsLimit: function() {
    var _this = this;
    this.ajaxRequest("application/rate_limit_status", function(success, data, status, context, xhr) {
      if(success) {
        $.each(data.resources, function(apiFamilies, api) {
          $.each(api, function(apiEndpoint, apiRateInfo) {
            var apiName = apiEndpoint.split('/').slice(1, 3).join('/');
            _this.rateLimits[apiName] = $.extend({}, _this.rateLimits[apiName], apiRateInfo);
            _this.rateLimits[apiName].remaining = parseInt(apiRateInfo.remaining, 10);
            _this.rateLimits[apiName].reset = parseInt(apiRateInfo.reset, 10) * 1000;
            _this.rateLimits[apiName].limit = parseInt(apiRateInfo.limit, 10);
            if(!$.isNumeric(_this.rateLimits[apiName].last)) _this.rateLimits[apiName].last = 0;
          });
        });
      }
      if(xhr) {
        var accessLevel = xhr.getResponseHeader('X-Access-Level');
        if(accessLevel && !accessLevel.match('directmessages')) {
          // For some reason twitter is not authenticating with the correct access
          // level. In this cases we'll disable DMS
          TweetManager.instance.disableDMS();
        }
      }
    }, null, {resources: 'search,statuses,direct_messages,users,favorites,lists,blocks,friends'});
    setTimeout(_this.updateWindowHitsLimit, 30 * 1000);
  },

  showTweet: function(callback, id) {
    var params = {
      id: id,
      include_my_retweet: 'true',
      include_entities: 'true'
    };
    this.ajaxRequest('statuses/show', callback, null, params, "GET");
  },

  tweet: function(callback, msg, replyId) {
    var params = {
      status: msg
    };
    if(replyId) {
      params.in_reply_to_status_id = replyId;
    }
    this.ajaxRequest('statuses/update', callback, null, params, "POST", 30000);
  },

  retweet: function(callback, id) {
    this.ajaxRequest('statuses/retweet/' + id, callback, null, null, "POST");
  },

  destroy: function(callback, id) {
    this.ajaxRequest('statuses/destroy/' + id, callback, null, null, "POST");
  },

  destroyDM: function(callback, id) {
    var params = {
      id: id
    };
    this.ajaxRequest('direct_messages/destroy', callback, null, params, "POST");
  },

  favorite: function(callback, id) {
    var params = {
      id: id
    };
    this.ajaxRequest('favorites/create', callback, null, params, "POST");
  },

  unFavorite: function(callback, id) {
    var params = {
      id: id
    };
    this.ajaxRequest('favorites/destroy', callback, null, params, "POST");
  },

  lists: function(callback) {
    var params = {
      screen_name: this.username()
    };
    this.ajaxRequest('lists/list', callback, null, params, "GET");
  },

  subs: function(callback) {
    var params = {
      screen_name: this.username()
    };
    this.ajaxRequest('lists/subscriptions', callback, null, params, "GET");
  },

  timeline: function(timeline_path, callback, context, params) {
    params = params || {};
    params.include_entities = 'true';
    params.include_rts = 'true';
    this.ajaxRequest(timeline_path, callback, context, params);
  },

  searchTimeline: function(callback, context, params) {
    params.result_type = 'recent';
    params.include_entities = 'true';
    this.ajaxRequest('search/tweets', callback, context, params, "GET");
  },

  blockedUsers: function(callback) {
    var params = {
      cursor: -1
    };
    this.ajaxRequest('blocks/ids', callback, null, params, "GET");
  },

  friendsIds: function(callback) {
    var params = {
      screen_name: this.username(),
      cursor: -1
    };
    this.ajaxRequest('friends/ids', callback, null, params, "GET");
  },
  
  trendingPlaces: function(callback) {
    this.ajaxRequest('trends/available', callback, null, null, "GET");
  },
  
  trendingTopics: function(callback, place) {
    var params = {};
    if (place != undefined) {
      params.id = place;
    } else {
      params.id = '1'; //1 - worldwide
    }
    this.ajaxRequest('trends/place', callback, null, params, "GET");
  },

  lookupUsers: function(callback, usersIdList) {
    var params = {
      user_id: usersIdList.join(',')
    };
    this.ajaxRequest('users/lookup', callback, null, params, "GET");
  },

  usersTimeline: function(callback, params) {
    params.include_rts = 'true';
    this.ajaxRequest('statuses/user_timeline', callback, {}, params);
  },

  follow: function(callback, username) {
    var params = {
      screen_name: username,
      follow: false
    };
    this.ajaxRequest('friendships/create', callback, null, params, "POST");
  },

  unfollow: function(callback, username) {
    var params = {
      screen_name: username
    };
    this.ajaxRequest('friendships/destroy', callback, null, params, "POST");
  },

  block: function(callback, username) {
    var params = {
      screen_name: username
    };
    this.ajaxRequest('blocks/create', callback, null, params, "POST");
  },

  report: function(callback, username) {
    var params = {
      screen_name: username
    };
    this.ajaxRequest('users/report_spam', callback, null, params, "POST");
  }
};

var globalOAuthInstance;
chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
  if(!globalOAuthInstance)
    return;
  if(request.identica_request_token) {
    if(!globalOAuthInstance.authenticated && globalOAuthInstance.tokenRequested) {
      if(globalOAuthInstance.oauth_token == request.identica_request_token) {
        globalOAuthInstance.authenticating = true;
        globalOAuthInstance.getAccessToken.call(globalOAuthInstance, '', function() {
          chrome.tabs.remove(sender.tab.id);
        });
      }
    }
  }
  if(request.check_pin_needed) {
    if(!globalOAuthInstance.authenticated && globalOAuthInstance.tokenRequested) {
      sendResponse({});
    }
    return;
  }
  var pin = request.cr_oauth_pin;
  if(pin) {
    globalOAuthInstance.authenticating = true;
    globalOAuthInstance.getAccessToken.call(globalOAuthInstance, pin, sendResponse);
  }
});

function TwitterOAuth(oauthTokenData, onAuthenticated) {
  this.user_id = null;
  this.screen_name = null;
  this.authenticated = false;
  this.onAuthenticated = onAuthenticated;
  this.responseCallback = null;
  this.authenticating = false;
  this.tokenRequested = false;
  this.timeAdjusted = false;
  this.oauthTokenData = oauthTokenData;
  this.consumerSecret = SecretKeys.twitter.consumerSecret;
  this.consumerKey    = SecretKeys.twitter.consumerKey;

  globalOAuthInstance = this;

  var _this = this;
  var cachedToken = this.oauthTokenData.val();
  if(cachedToken) {
    this.authenticating = true;
    this.tokenRequested = true;
    setTimeout(function() {
      _this.accessTokenCallback.call(_this, cachedToken);
    }, 0);
  }
}
TwitterOAuth.prototype = {
  getAccessToken: function(pin, callback) {
    this.responseCallback = callback;
    this.makeRequest.call(this, 'access_token',
      { oauth_verifier: pin }, this.accessTokenCallback);
  },
  prepareSignedParams: function(url, params, httpMethod) {
    var accessor = {
      consumerSecret: this.consumerSecret,
      tokenSecret: this.oauth_token_secret
    };
    if(!httpMethod)
      httpMethod = 'POST';
    var message = {
      action: url,
      method: httpMethod,
      parameters: [
        ['oauth_consumer_key', this.consumerKey],
        ['oauth_signature_method', 'HMAC-SHA1']
      ]
    };
    if(this.oauth_token) {
      OAuth.setParameter(message, 'oauth_token', this.oauth_token);
    }
    for(var p in params) {
      OAuth.setParameter(message, p, params[p]);
    }
    OAuth.completeRequest(message, accessor);
    return OAuth.getParameterMap(message.parameters);
  },
  adjustTimestamp: function(request) {
    var serverHeaderFields = ['Last-Modified', 'Date'];
    var serverTimestamp;
    for(var i = 0, len = serverHeaderFields.length; i < len; ++i) {
      var headerField = serverHeaderFields[i];
      var fieldValue = request.getResponseHeader(headerField);
      if(!fieldValue) {
        continue;
      }
      serverTimestamp = Date.parse(fieldValue);
      if(serverTimestamp && !isNaN(serverTimestamp)) {
        break;
      }
    }
    if(serverTimestamp) {
      var beforeAdj = OAuth.timeCorrectionMsec;
      OAuth.timeCorrectionMsec = serverTimestamp - (new Date()).getTime();
      if(Math.abs(beforeAdj - OAuth.timeCorrectionMsec) > 5000) {
        console.log("Server timestamp: " + serverTimestamp + " Correction (ms): " + OAuth.timeCorrectionMsec);
        return true;
      }
    }
    return false;
  },
  makeRequest: function(url, params, callback) {
    var signingUrl = TwitterLib.URLS.BASE_OAUTH_SIGNING + url;
    var signedParams = this.prepareSignedParams(signingUrl, params);
    var requestUrl = TwitterLib.URLS.BASE_OAUTH + url;
    var _this = this;
    $.ajax({
      type: 'POST',
      url: requestUrl,
      data: signedParams,
      success: function(data, status, xhr) {
        callback.call(_this, data, status, xhr);
      },
      error: function (request, status, error) {
        var fmtError = '';
        try {
          if(_this.adjustTimestamp(request)) {
            console.log('First OAuth token request failed: ' + status + '. Trying again using adjusted timestamp.');
            callback.call(_this, null, null, true);
            return;
          }
          fmtError = '"' + request.responseText + '"(' + request.statusText + ')';
        } catch(e) {
          fmtError = '"' + error + '"(' + status + ')';
        }
        callback.call(_this, null, fmtError);
      }
    });
  },
  accessTokenCallback: function(data, status, xhr) {
    this.authenticating = false;
    var success = true;
    if(!data) {
      success = false;
      this.error = status;
      console.log('accessTokenCallback error: ' + status);
    } else {
      var paramMap = OAuth.getParameterMap(data);
      this.oauthTokenData.save(data);
      this.oauth_token = paramMap['oauth_token'];
      this.oauth_token_secret = paramMap['oauth_token_secret'];
      this.user_id = paramMap['user_id'];
      this.screen_name = paramMap['screen_name'];
      this.authenticated = true;
      if(this.onAuthenticated) {
        this.onAuthenticated();
      }
    }
    if(this.responseCallback) {
      try {
        this.responseCallback(success);
      } catch(e) { /* ignoring */ }
      this.responseCallback = null;
    }
  },
  requestTokenCallback: function(data, status, tryAgain) {
    var _this = this;
    var alertRequestError = function(errorMsg) {
      _this.error = errorMsg;
      console.log('requestTokenCallback error: ' + errorMsg);
      alert(chrome.i18n.getMessage("request_token_error", [errorMsg]));
    };
    if(!data) {
      if(tryAgain) {
        this.getRequestToken();
        return;
      }
      alertRequestError(status);
      return;
    }

    var paramMap = OAuth.getParameterMap(data);
    this.oauth_token = paramMap['oauth_token'];
    this.oauth_token_secret = paramMap['oauth_token_secret'];

    if(!this.oauth_token || !this.oauth_token_secret) {
      alertRequestError("Invalid oauth_token: " + data);
      return;
    }

    chrome.tabs.create({
      "url": TwitterLib.URLS.BASE_OAUTH + 'authorize?oauth_token=' + this.oauth_token,
      "selected": true
    });
    this.tokenRequested = true;
  },
  getRequestToken: function() {
    this.oauth_token_secret = '';
    this.oauth_token = null;
    this.makeRequest('request_token', {}, this.requestTokenCallback);
  }
};
