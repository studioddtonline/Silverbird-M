var UploadManager = {
  upload: function(file) {
    this.running = true;
    this.finishedResponse = null;
    this.lastProgress = null;
    var imageService = ImageService.getService(OptionsBackend.get('image_upload_service'));
    imageService.upload(file, (function(self) {
      return function(success, urlOrError) {
        self.running = false;
        if(!self.onFinish || !self.onFinish(success, urlOrError)) {
          self.finishedResponse = {success: success, urlOrError: urlOrError};
          self.onFinish = null;
        }
      };
    })(this), (function(self) {
      return function(loaded, total) {
        if(!self.onProgress || !self.onProgress(loaded, total)) {
          self.lastProgress = {loaded: loaded, total: total};
          self.onProgress = null;
        }
      };
    })(this));
  },

  registerCallbacks: function(onFinish, onProgress) {
    this.onFinish = onFinish;
    this.onProgress = onProgress;

    if(this.finishedResponse) {
      onFinish(this.finishedResponse.success, this.finishedResponse.urlOrError);
      this.finishedResponse = null;
      return false;
    }
    if(this.running) {
      if(this.lastProgress) {
        this.onProgress(this.lastProgress.loaded, this.lastProgress.total);
      }
      return true;
    }
    return false;
  },

  unregisterCallbacks: function() {
    this.onFinish = null;
    this.onProgress = null;
  }
};

function ImageService(domain, options) {
  this.domain = domain;
  if(typeof options.thumb == 'function') {
    this.thumbFunc = options.thumb;
  } else {
    this.thumbUrl = options.thumb;
  }

  if(options.upload) {
    this.uploadOptions = $.extend(true, {}, ImageService.defaultUploadOptions, options.upload);
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

  this.hasUpload = function() {
    return !!this.uploadOptions;
  };

  this.upload = function(file, onFinish, onProgress) {
    var xhr = new XMLHttpRequest();
    xhr.open('post', this.uploadOptions.url, true);
    xhr.onreadystatechange = (function(self) {
      return function() {
        if (this.readyState != 4) return;
        if(xhr.status == 200 && xhr.responseText) {
          var parsedResponse = null;
          if(self.uploadOptions.dataType == 'json') {
            try {
              parsedResponse = JSON.parse(xhr.responseText);
            } catch(e) {}
          } else if(self.uploadOptions.dataType == 'xml') {
            try {
              parsedResponse = $(xhr.responseText);
            } catch(e) {}
          }
          if(parsedResponse) {
            onFinish(true, self.uploadOptions.parseSuccess(parsedResponse, xhr));
            return;
          }
        }
        onFinish(false, self.uploadOptions.parseError(xhr));
      };
    })(this);

    TweetManager.instance.twitterBackend.signOauthEcho(xhr, this.uploadOptions.signingUrl);

    var formData = new FormData();
    for(var param in this.uploadOptions.params) {
      if(!this.uploadOptions.params.hasOwnProperty(param)) continue;
      var paramValue = this.uploadOptions.params[param];
      if(paramValue == '$file') {
        paramValue = file;
      }
      formData.append(param, paramValue);
    }

    if(onProgress) {
      xhr.upload.addEventListener("progress", function(e) {
        onProgress(e.loaded, e.total);
      }, false);
    }

    xhr.send(formData);
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
  },

  defaultUploadOptions: {
    url: '', // Mandatory
    signingUrl: 'https://api.twitter.com/1.1/account/verify_credentials.json',
    params: {
      media: '$file'
    },
    dataType: 'json',
    parseError: null, // Mandatory
    parseSuccess: null // Mandatory
  }
});

ImageService.addService('pic.twitter.com', {
  upload: {
    url: null,
    parseError: null,
    parseSuccess: null
  }
});

ImageService.addService('movapic.com', {
  thumb: function(path) { return 'http://image.movapic.com/pic/m_' + path.split('/')[1] + '.jpeg'; }
});
