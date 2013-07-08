function Expander() {
  this.services = null;
  this.servicesTimer = null;
  this.urlsCache = {};
  this.retryTimeout = 10000;
  this.populateServicesCache();
  this.currentServiceIdx = 0;
  this.loopRemaining = 3;
}
Expander.servicesArray = [
  'longurl', 'untiny', 'hatena',
  'viame', 'fxcamera', 'flickr',
  'mobypicture', 'slideshare'
];
Expander.simpleServices = {
  "htn.to": {hatena: true},
  "via.me": {viame: true},
  "fxc.am": {fxcamera: true},
  "www.flickr.com": {flickr: true},
  "www.mobypicture.com": {mobypicture: true},
  "moby.to": {mobypicture: true},
  "www.slideshare.net": {slideshare: true}
};
Expander.excludeServices = [
  'dlvr.it'
];
Expander.services = {
  longurl: {
    expand: function(url) {
      return ['http://api.longurl.org/v2/expand', {url: url, format: 'json'}, 'json'];
    },
    services: function() {
      return ['http://api.longurl.org/v2/services', {format: 'json'}, 'json'];
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
    expand: function(url) {
      return ['http://untiny.me/api/1.0/extract/', {url: url, format: 'json'}, 'json'];
    },
    services: function() {
      return ['http://untiny.me/api/1.0/services/', {format: 'json'}, 'json'];
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
      return ['http://b.hatena.ne.jp/api/htnto/expand', {format: 'json', shortUrl: url}, 'json'];
    },
    parseExpand: function(data) {
      return data.data.expand[0].long_url;
    }
  },
  viame: {
    expand: function(url) {
      return ['https://api.via.me/v1/posts/' + url.split("/").pop().substring(1), {client_id: SecretKeys.viame.consumerKey}, 'json'];
    },
    parseExpand: function(data) {
      return data.response.post.media_url;
    }
  },
  fxcamera: {
    expand: function(url) {
      return [url, {}, 'html'];
    },
    parseExpand: function(data) {
      return $(data).find("#photo").attr('src');
    }
  },
  flickr: {
    expand: function(url) {
      return ['https://secure.flickr.com/services/rest/', {
        method: 'flickr.photos.getSizes',
        api_key: SecretKeys.flickr.consumerKey,
        photo_id: url.split(/\/+/)[4]
      }, 'text'];
    },
    parseExpand: function(data) {
      return $(data).find("size[label=Small]").attr('source');
    }
  },
  mobypicture: {
    expand: function(url) {
      var param = {
        action: 'getThumbUrl',
        key: SecretKeys.mobypicture.key,
        size: 'medium'
      };
      var post_id = '', tinyurl_code = '';
      var splited = url.split(/\/+/);
      if(splited[1] == 'www.mobypicture.com') {
        param.post_id = splited.pop();
      } else if(splited[1] == 'moby.to') {
        param.tinyurl_code = splited.pop();
      }
      return ['https://api.mobypicture.com/', param, 'text'];
    },
    parseExpand: function(data) {
      return data;
    }
  },
  slideshare: {
    expand: function(url) {
      var now = Date.now() * 0.001 | 0;
      return ['https://www.slideshare.net/api/2/get_slideshow', {
        slideshow_url: url,
        api_key: SecretKeys.slideshare.key,
        ts: now,
        hash: hex_sha1(SecretKeys.slideshare.secret + now)
      }, 'text'];
    },
    parseExpand: function(data) {
      return 'http:' + $(data).find('ThumbnailURL').text();
    }
  }
};

Expander.prototype = {
  doAjaxRequest: function(url, params, dataType, successCallback, errorCallback) {
    $.ajax({
      type: 'GET',
      url: url,
      data: params,
      dataType: dataType
    })
    .done(successCallback)
    .fail(errorCallback);
  },

  populateServicesCache: function() {
    for(var service in Expander.services) {
      this.updateServicesCache(Expander.services[service]);
    }
    this.services = $.extend({}, this.services, Expander.simpleServices);
  },

  updateServicesCache: function(service) {
    if(typeof service.services !== 'function') return;
    this.servicesTimer = null;
    var result = service.services(), url = result[0], params = result[1], dataType = result[2];
    this.doAjaxRequest(url, params, dataType, (function(self) {
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
    if(typeof loop === 'undefined') {
      this.loopRemaining = 3;
    } else {
      this.loopRemaining = loop - 1;
    }
    if(this.loopRemaining < 0) {
      callback(false, true, url);
      return;
    }
    var longUrl = this.urlsCache[url];
    var isShortened = true;
    var success = true;
    if(longUrl) {
      callback(success, isShortened, longUrl);
      return;
    }

    if(this.services) {
      var urlDomain = url.match(/(https?:\/\/|www\.)(.*?)(\/|$)/i)[2];
      for(var i = 0, len = Expander.excludeServices.length; i < len; i++) {
        var excludeDomain = Expander.excludeServices[i];
        if(urlDomain == excludeDomain) {
          callback(true, false);
          return;
        }
      }
      var shortenerService = this.services[urlDomain];
      if(shortenerService) {
        while(true) {
          var serviceName = this.getCurrentService();
          if(shortenerService[serviceName]) {
            this.runExpander(Expander.services[serviceName], url, callback);
            break;
          }
        }
      } else {
        isShortened = false;
        success = true;
        callback(success, isShortened, url);
      }
    } else {
      callback(true, false);
    }
  },

  getCurrentService: function() {
    var chosenService = Expander.servicesArray[this.currentServiceIdx];
    this.currentServiceIdx += 1;
    this.currentServiceIdx = this.currentServiceIdx % Expander.servicesArray.length;
    return chosenService;
  },

  runExpander: function(service, shortUrl, callback) {
    var result = service.expand(shortUrl), url = result[0], params = result[1], dataType = result[2];
    this.doAjaxRequest(url, params, dataType, (function(self) {
      return function(data, status, request) {
        var success = false, isShortened = true;
        if(data) {
          success = true;
          var longUrl = service.parseExpand(data, status, request);
          if(shortUrl == longUrl) {
            isShortened = false;
          } else {
            self.urlsCache[shortUrl] = longUrl;
          }
        }
        var longUrlDomain = longUrl.match(/(https?:\/\/|www\.)(.*?)(\/|$)/i)[2];
        if(self.services[longUrlDomain]) {
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
  }
};
