function Expander() {}
Object.defineProperties(Expander.prototype, {
  '_xhr': {
    value: new XMLHttpRequest()
  },
  '_p': {
    value: null,
    writable: true
  },
  '_regexp': {
    value: {
      httpHeaderSplitter: new RegExp('[\:\;]\\s*', 'i'),
      matchContentType: new RegExp('^content-?type', 'i'),
      matchMimeHtml: new RegExp('^text/html', 'i'),
      matchMimeImage: new RegExp('^image/', 'i'),
      matchMimeVideo: new RegExp('^video/', 'i'),
      lazyURL: new RegExp('^https?://', 'i'),
      lazyAbsolutePath: new RegExp('^//', 'i'),
      lazyRelativePath: new RegExp('^/[^/]', 'i')
    }
  },
  'expand': {
    value: function(args) {
      if(args) {
        this.enqueue(args);
        if(this._p) return;
      }
      if(this.queue.length > 0) {
        args = this.queue.shift();
      }
      if(!args) {
        throw new SyntaxError('argument is needed');
        return;
      }
      if(this.searchCache(args.url) && !args.force) {
        this._finally(args, this._cache.get(args.url));
      } else {
        this._expand(args);
      }
    }
  },
  '_expand': {
    value: function(args) {
      var result = new Map([['success', false], ['expanded', false]]);
      this._p = new Promise((function(self) {
        return function(resolve, reject) {
          var x = self._xhr;
          x.open(args.method, args.url || '', true);
          x.responseType = args.responseType || 'text';
          x.timeout = 4000;
          x.onabort = reject;
          x.onload = resolve;
          x.onerror = reject;
          x.ontimeout = reject;
          try {
            x.send();
          } catch(e) {
            x.abort();
          }
        };
      })(this));
      this._p
      .then((function(self, args, result) {
        return function(data) {
          self._resolve(data, args, result);
        };
      })(this, args, result))
      .catch((function(self, args, result) {
        return function(data) {
          console.log(data);
          self._reject(data, args, result);
        };
      })(this, args, result));
    }
  },
  '_resolve': {
    value: function(data, args, result) {
      var rURL = data.target.responseURL;
      if(args.url == rURL) {
        result.set('success', true);
      } else if(rURL && rURL !== '') {
        result.set('success', true);
        result.set('expanded', true);
      }
      result.set('url', rURL.split('/').map(function(entry) {
        try {
          return decodeURIComponent(entry);
        } catch(e) {
          return entry;
        }
      }).join('/'));
      result.set('mime', this._mime(this._xhr) || 'text/html');
      if(args.method == 'GET'
      && args.responseType == 'document'
      && data.target.response.documentElement) {
        result.set('document', data.target.response.documentElement);
      }
      result.set('content', this._scraping(result) || this._content(result));
      if(result.get('success') || false) {
        this.cache(args.url, result);
      }
      this._finally(args, result);
    }
  },
  '_reject': {
    value: function(data, args, result) {
      if((data.target.status == 403 || data.target.status == 405) && args.method == 'HEAD') {
        args.method = 'GET';
        args.force = true;
        this.expand(args);
        return;
      }
      result.set('url', args.url);
      this._finally(args, result);
    }
  },
  '_mime': {
    value: function(xhr) {
      var mime = undefined;
      try {
        xhr.getAllResponseHeaders().split(/\r?\n/).forEach((function(self){
          return function(header){
            var splited = header.split(self._regexp.httpHeaderSplitter);
            if(self._regexp.matchContentType.test(splited[0])) {
              mime = splited[1] || undefined;
            }
          };
        })(this));
      } finally {
        return mime;
      }
    }
  },
  '_content': {
    value: function(result) {
      var content = undefined, mime = result.get('mime'), url = result.get('url');
      if(!mime || !url) {
        throw new SyntaxError('malformed result');
        return;
      }
      try {
        switch(true) {
          case this._regexp.matchMimeImage.test(mime):
            content = '<img src="' + url + '">';
            break;
          case this._regexp.matchMimeVideo.test(mime):
            content = '<video><source src="' + url + '" type="' + mime + '"><p>' + url + '</p></video>';
            break;
          default:
            // for recheck on Renderer, there are no content here.
            break;
        }
      } finally {
        return content;
      }
    }
  },
  '_scraping': {
    value: function(result) {
      var content = undefined;
      if(!result.has('document')) return content;
      try {
        var doc = result.get('document');
        if(doc) {
          var image = doc.querySelector('meta[property=twitter\\:image]')
                  || doc.querySelector('meta[name=twitter\\:image]')
                  || doc.querySelector('meta[class=twitter\\:image]')
                  || doc.querySelector('meta[property=og\\:image]')
                  || doc.querySelector('meta[name=og\\:image]')
                  || doc.querySelector('meta[class=og\\:image]')
                  || doc.querySelector('link[itemprop=thumbnailUrl]')  // Youtube
                  || doc.querySelector('.animated-gif-thumbnail') // Twitter/vine
                  || doc.querySelector('.videoThumbnailImage');  // nicovideo
          var thumb = image.getAttribute('content')
                  || image.getAttribute('value')
                  || image.getAttribute('src')
                  || image.getAttribute('href')
                  || undefined;
          if(thumb) {
            if(this._regexp.lazyAbsolutePath.test(thumb)) {
              thumb = thumb.replace(this._regexp.lazyAbsolutePath, 'http://');
            } else if(this._regexp.lazyRelativePath.test(thumb)) {
              thumb = thumb.replace(this._regexp.lazyRelativePath, function() {
                return result.get('url').split(/\/+/).slice(0, 2).join('//') + '/';
              });
            }
            content = '<img src="' + thumb + '">';
          }
          image = null;
        }
        doc = null;
      } finally {
        return content;
      }
    }
  },
  '_finally': {
    value: function(args, result) {
      this._p = null;
      if(args.method.toUpperCase() == 'HEAD'
      && this._regexp.matchMimeHtml.test(result.get('mime'))) {
        args.method = 'GET';
        args.responseType = 'document';
        args.force = true;
        this.expand(args);
      } else {
        try {
          args.callback(result);
        } catch(e) {
          console.error(e);
        } finally {
          this.dequeue();
        }
      }
    }
  },
  'queue': {
    enumerable: true,
    value: [],
    writable: true
  },
  'enqueue': {
    value: function(args) {
      if(!args.url) {
        throw new SyntaxError('URL is needed');
      }
      if(!this._regexp.lazyURL.test(args.url)) {
        args.url = args.url.replace(this._regexp.lazyRelativePath, 'http://');
      }
      if(!args.callback || typeof args.callback !== 'function') {
        throw new SyntaxError('callback is needed');
      }
      if(!args.method) args.method = 'HEAD';
      if(typeof args.force === 'undefined') args.force = false;
      this.queue.push(args);
    }
  },
  'dequeue': {
    value: function() {
      if(this.queue.length > 0) this.expand();
    }
  },
  '_cache': {
    value: new Map(),
    writable: true
  },
  '_cacheIndex': {
    value: [],
    writable: true
  },
  '_cacheMax': {
    get: function() {
      return 100;
    }
  },
  'cache': {
    value: function(shortUrl, expanded) {
      this._cacheIndex.push(shortUrl);
      this._cache.set(shortUrl, expanded);
      if(this._cacheIndex.length > this._cacheMax) {
        var deleteIndex = this._cacheIndex.shift();
        this._cache.delete(deleteIndex);
        deleteIndex = null;
      }
    }
  },
  'searchCache': {
    value: function(shortUrl) {
      return this._cache.has(shortUrl);
    }
  },
  'clear': {
    value: function() {
      this.queue = [];
      if(this._p) {
        this._xhr.abort();
      }
    }
  }
});
