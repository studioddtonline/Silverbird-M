function Expander() {
  this.services = {};
  this.servicesTimer = null;
  this.urlsCache = {};
  this.retryTimeout = 10000;
  this.populateServicesCache();
  this.currentServiceIdx = 0;
  this.loopRemaining = 3;
}
Expander.servicesArray = [
  'longurl', 'untiny'
];
Expander.excludeServices = [
  'dlvr.it'
];
Expander.services = {
  longurl: {
    expand: function(shortUrl) {
      return {
        url: 'http://api.longurl.org/v2/expand',
        params: {url: shortUrl, format: 'json'},
        dataType: 'json'
      };
    },
    services: function() {
      return {
        url: 'http://api.longurl.org/v2/services',
        params: {format: 'json'},
        dataType: 'json'
      };
    },
    parseServices: function(services, data) {
      if(!services) {
        services = {};
      }
      for(var domain in data) {
        if(!services[domain]) {
          services[domain] = {};
        }
        services[domain].longurl = true;
      }
      services["amba.to"] = {longurl: true};
      services["p.tl"] = {longurl: true};
      return services;
    },
    parseExpand: function(data, status, request) {
      return data['long-url'];
    }
  },
  untiny: {
    expand: function(shortUrl) {
      return {
        url: 'http://untiny.me/api/1.0/extract/',
        params: {url: shortUrl, format: 'json'},
        dataType: 'json'
      };
    },
    services: function() {
      return {
        url: 'http://untiny.me/api/1.0/services/',
        params: {format: 'json'},
        dataType: 'json'
      };
    },
    parseServices: function(services, data) {
      if(!services) {
        services = {};
      }
      for(var domain in data) {
        if(!services[domain]) {
          services[domain] = {};
        }
        services[domain].untiny = true;
      }
      return services;
    },
    parseExpand: function(data) {
      return data.org_url;
    }
  },
  hatena: {
    expand: function(url) {
      return {
        url: 'http://b.hatena.ne.jp/api/htnto/expand',
        params: {format: 'json', shortUrl: url},
        dataType: 'json'
      };
    },
    parseExpand: function(data) {
      return data.data.expand[0].long_url;
    }
  },
  fxcamera: {
    expand: function(shortUrl) {
      return {
        url: shortUrl,
        dataType: 'html'
      };
    },
    parseExpand: function(data) {
      return $(data).find("#photo").attr('src');
    }
  },
  flickr: {
    expand: function(shortUrl) {
      return {
        url: 'https://secure.flickr.com/services/rest/',
        params: {
          method: 'flickr.photos.getSizes',
          api_key: SecretKeys.flickr.consumerKey,
          photo_id: shortUrl.split(/\/+/)[4]
        },
        dataType: 'text'
      };
    },
    parseExpand: function(data) {
      return $(data).find("size[label=Small]").attr('source');
    }
  },
  mobypicture: {
    expand: function(shortUrl) {
      var param = {
        action: 'getThumbUrl',
        key: SecretKeys.mobypicture.key,
        size: 'medium'
      };
      var post_id = '', tinyurl_code = '';
      var splited = shortUrl.split(/\/+/);
      if(splited[1] == 'www.mobypicture.com') {
        param.post_id = splited.pop();
      } else if(splited[1] == 'moby.to') {
        param.tinyurl_code = splited.pop();
      }
      return {
        url: 'https://api.mobypicture.com/',
        params: param,
        dataType: 'text'
      };
    },
    parseExpand: function(data) {
      return data;
    }
  },
  slideshare: {
    expand: function(shortUrl) {
      var now = Date.now() * 0.001 | 0;
      return {
        url: 'https://www.slideshare.net/api/2/get_slideshow',
        params: {
          slideshow_url: shortUrl,
          api_key: SecretKeys.slideshare.key,
          ts: now,
          hash: hex_sha1(SecretKeys.slideshare.secret + now)
        },
        dataType: 'text'
      };
    },
    parseExpand: function(data) {
      return 'http:' + $(data).find('ThumbnailURL').text();
    }
  },
  headExpander: {
    expand: function(shortUrl) {
      return {
        url: shortUrl,
        params: {xhr2: true},
        httpMethod: 'HEAD'
      };
    },
    parseExpand: function(data) {
      return data.target.responseURL || '';
    }
  },
  twitterCards: {
    expand: function(shortUrl) {
      return {
        url: shortUrl,
        params: {xhr2: true},
        dataType: 'document'
      };
    },
    parseExpand: function(data) {
      var resDoc = data.target.response.documentElement;
      var twitterImage = resDoc.querySelector('meta[property=twitter\\:image]')
                      || resDoc.querySelector('meta[name=twitter\\:image]')
                      || resDoc.querySelector('meta[class=twitter\\:image]');
      return twitterImage.getAttribute('content') || twitterImage.getAttribute('value');
    }
  }
};
Expander.simpleServices = {
  "htn.to": Expander.services['hatena'],
  "fxc.am": Expander.services['fxcamera'],
  "www.flickr.com": Expander.services['flickr'],
  "www.mobypicture.com": Expander.services['mobypicture'],
  "moby.to": Expander.services['mobypicture'],
  "slideshare.net": Expander.services['slideshare'],
  "www.slideshare.net": Expander.services['slideshare'],
  "vine.co": Expander.services['twitterCards'],
  "engt.co": Expander.services['headExpander'],
  "ift.tt": Expander.services['headExpander']
};

Expander.prototype = {
  doAjaxRequest: function(url, params, dataType, httpMethod, successCallback, errorCallback) {
    if(params.xhr2) {
      var p = new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(httpMethod || 'GET', url, true);
        xhr.responseType = dataType || 'text';
        xhr.onload = resolve;
        xhr.onerror = reject;
        xhr.send();
      });
      p
      .then(successCallback)
      .catch(errorCallback);
    } else {
      $.ajax({
        type: httpMethod || 'GET',
        url: url || undefined,
        data: params || {},
        dataType: dataType || 'text'
      })
      .done(successCallback)
      .fail(errorCallback);
    }
  },

  populateServicesCache: function() {
    for(var service in Expander.services) {
      this.updateServicesCache(Expander.services[service]);
    }
    for(var i in Expander.simpleServices) {
      if(Expander.simpleServices.hasOwnProperty(i)) {
        this.services[i] = Expander.simpleServices[i];
      }
    }
  },

  updateServicesCache: function(service) {
    if(typeof service.services !== 'function') return;
    this.servicesTimer = null;
    var result = service.services();
    this.doAjaxRequest(result.url, result.params, result.dataType, result.httpMethod, (function(self) {
      return function(data, status) {
        if(!data) return;
        self.services = service.parseServices(self.services, data);
      };
    })(this), (function(self) {
      return function(request, status, error) {
        // Failed to populate services list, we're going to try again
        // upon the first expand request or in a few seconds.
        self.servicesTimer = setTimeout(function() {
          self.updateServicesCache(service);
        }, self.retryTimeout);
        self.retryTimeout = self.retryTimeout * 2;
      };
    })(this));
  },

  expand: function(url, callback, loop) {
    var success = true;
    var isShortened = true;
    if(typeof loop === 'undefined') {
      this.loopRemaining = 3;
    } else {
      this.loopRemaining = loop - 1;
    }
    if(this.loopRemaining < 0) {
      success = false;
      callback(success, isShortened, url);
      return;
    }
    var longUrl = this.urlsCache[url];
    if(longUrl) {
      callback(success, isShortened, longUrl);
      return;
    }

    if(this.services) {
      var urlDomain = url.match(/(https?:\/\/|www\.)(.*?)(\/|$)/i)[2];
      for(var i = 0, len = Expander.excludeServices.length; i < len; i++) {
        var excludeDomain = Expander.excludeServices[i];
        if(urlDomain == excludeDomain) {
          isShortened = false;
          callback(success, isShortened, url);
          return;
        }
      }
      var shortenerService = this.services[urlDomain];
      var isSimpleShortenerService = Expander.simpleServices[urlDomain] || false;
      if(isSimpleShortenerService) {
        this.runExpander(isSimpleShortenerService, url, callback);
      } else if(shortenerService) {
        var loopDetection = 0;
        while(true) {
          var serviceName = this.getCurrentService();
          if(shortenerService[serviceName]) {
            this.runExpander(Expander.services[serviceName], url, callback);
            break;
          }
          if(loopDetection > Expander.servicesArray.length * 3) {
            console.warn('getCurrentService is looping');
            isShortened = false;
            callback(success, isShortened, url);
            break;
          }
          loopDetection += 1;
        }
      } else {
        isShortened = false;
        success = true;
        callback(success, isShortened, url);
      }
    } else {
      isShortened = false;
      callback(success, isShortened, url);
    }
  },

  getCurrentService: function() {
    var chosenService = Expander.servicesArray[this.currentServiceIdx];
    this.currentServiceIdx += 1;
    this.currentServiceIdx = this.currentServiceIdx % Expander.servicesArray.length;
    return chosenService;
  },

  runExpander: function(service, shortUrl, callback) {
    var result = service.expand(shortUrl);
    if(!result['url']) {
      callback(false, false, null);
      return;
    }
    this.doAjaxRequest(result.url, result.params, result.dataType, result.httpMethod, (function(self) {
      return function(data, status, request) {
        var success = false, isShortened = true, longUrl = '';
        if(data) {
          success = true;
          longUrl = service.parseExpand(data, status, request);
          if(shortUrl == longUrl) {
            isShortened = false;
          } else {
            self.urlsCache[shortUrl] = longUrl;
          }
        }
        if(self.services[self.getDomain(longUrl)]) {
          self.urlsCache[shortUrl] = false;
          self.expand(longUrl, callback, self.loopRemaining);
        } else {
          callback(success, isShortened, longUrl);
        }
      };
    })(this), (function(self) {
      return function(request, status, error) {
        var success = false, isShortened = true;
        callback(success, isShortened, '"' + error + '"(' + status + ')');
      };
    })(this));
  },

  getDomain: function(url) {
    if(!url.split) return -1;
    if(/^https?:\/\//.test(url)) {
      return url.split(/\/+/)[1];
    } else {
      return url.split(/\//)[0];
    }
  }
};
