function ImageService(domain, options) {
  this.domain = domain;
  if(typeof options.thumb == 'function') {
    this.thumbFunc = options.thumb;
  } else {
    this.thumbUrl = options.thumb;
  }

  this.getThumb = function(url) {
    var urlMatch = url.match(/(https?:\/\/|www\.)(.*?)\/(.*)$/i) || [];
    if(urlMatch.length < 3) return null;
    var domain = urlMatch[2];
    var path = urlMatch[3];
    if(this.domain == domain) {
      if(this.thumbFunc) {
        return this.thumbFunc(path, url);
      }
      return this.thumbUrl.replace('$1', path).replace('$2', url);
    }
    return null;
  };
}

$.extend(ImageService, {
  addService: function(domain, options) {
    this.services = this.services || [];
    this.servicesMap = this.servicesMap || {};
    var service = new ImageService(domain, options);
    this.services.push(service);
    this.servicesMap[domain] = service;
  },

  getThumb: function(url) {
    for(var i = 0, len = this.services.length; i < len; ++i) {
      var service = this.services[i];
      var thumbUrl = service.getThumb(url);
      if(thumbUrl) {
        return thumbUrl;
      }
    }
    return null;
  },

  getService: function(serviceName) {
    return this.servicesMap[serviceName];
  }
});

ImageService.addService('movapic.com', {
  thumb: function(path) {
    return 'http://image.movapic.com/pic/m_' + path.split('/')[1] + '.jpeg';
  }
});
