"use strict";
class Expander {
  constructor() {
    Object.defineProperties(this, {
      "_a": {
        value: document.createElement("a")
      },
      "_cache": {
        value: new Map()
      },
      "_p": {
        value: null,
        writable: true
      },
      "_regexp": {
        value: {
          httpHeaderSplitter: new RegExp('[:;]\\s*', 'i'),
          matchContentType: new RegExp('^content-?type', 'i'),
          matchMimeHtml: new RegExp('^text/html', 'i'),
          matchMimeImage: new RegExp('^image/', 'i'),
          matchMimeVideo: new RegExp('^video/', 'i'),
          matchSuffixImage: new RegExp('[^\\.]\\.(jpe?g|gif|png|bmp|tiff|webp)$', 'i'),
          lazyURL: new RegExp('^https?://', 'i'),
          noScheme: new RegExp('^//', 'i'),
          noHostname: new RegExp('^/[^/]', 'i'),
          relativePath: new RegExp('^..?/', 'i'),
          lastSlash: new RegExp('[^/]/$', 'i')
        }
      },
      "_xhr": {
        value: new XMLHttpRequest()
      },
      "queue": {
        value: []
      }
    });
  }
  expand(args) {
    if(args) {
      this.enqueue(args);
    }
    if(this._p) {
      return;
    }
    if(this.queue.length > 0) {
      args = this.queue.shift();
    } else {
      return;
    }
    if(this.searchCache(args.url) && !args.force) {
      this._finally(args, this._cache.get(args.url));
    } else {
      this._expand(args);
    }
  }
  _expand(args) {
    let result = new Map([['success', false], ['expanded', false]]);
    this._p = new Promise((function(x) {
      return function(resolve, reject) {
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
    })(this._xhr));
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
  _resolve(data, args, result) {
    const rURL = data.target.responseURL;
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
  _reject(data, args, result) {
    if(data.target
    && (data.target.status == 403 || data.target.status == 405)
    && args.method == 'HEAD') {
      args.method = 'GET';
      args.force = true;
      this.expand(args);
      return;
    }
    result.set('url', args.url);
    this._finally(args, result);
  }
  _mime(xhr) {
    let mime = undefined;
    try {
      xhr.getAllResponseHeaders().split(/\r?\n/).forEach(function(header) {
        let splited = header.split(this._regexp.httpHeaderSplitter);
        if(this._regexp.matchContentType.test(splited[0])) {
          mime = splited[1] || undefined;
        }
      }, this);
    } finally {
      return mime;
    }
  }
  _content(result) {
    let content = undefined;
    const mime = result.get('mime'), url = result.get('url');
    if(!mime || !url) {
      throw new SyntaxError('malformed result');
      return;
    }
    try {
      switch(true) {
        case this._regexp.matchMimeImage.test(mime) || this._regexp.matchSuffixImage.test(url):
          content = '<img src="' + url + '">';
          break;
        case this._regexp.matchMimeVideo.test(mime):
          content = '<video><source src="' + url + '" type="' + mime + '" title="' + url + '"></video>';
          break;
        default:
          // for recheck on Renderer, there are no content here.
          break;
      }
    } finally {
      return content;
    }
  }
  _scraping(result) {
    let content = undefined;
    if(!result.has('document')) {
      return content;
    }
    try {
      const doc = result.get('document');
      if(doc) {
        const image = doc.querySelector('.animated-gif-thumbnail') // Twitter/vine
                || doc.querySelector('meta[property=twitter\\:image]')
                || doc.querySelector('meta[name=twitter\\:image\\:src]')
                || doc.querySelector('meta[name=twitter\\:image]')
                || doc.querySelector('meta[class=twitter\\:image]')
                || doc.querySelector('meta[property=og\\:image]')
                || doc.querySelector('meta[name=og\\:image]')
                || doc.querySelector('meta[class=og\\:image]')
                || doc.querySelector('link[itemprop=thumbnailUrl]')  // Youtube
                || doc.querySelector('.videoThumbnailImage')  // nicovideo
                || doc.querySelector('img.image');  // movapic
        let thumb = image.getAttribute('content')
                || image.getAttribute('value')
                || image.getAttribute('src')
                || image.getAttribute('href')
                || undefined;
        if(thumb) {
          this._a.href = result.get('url');
          if(this._regexp.noScheme.test(thumb)) {
            thumb = this._a.protocol + thumb;
          } else if(this._regexp.noHostname.test(thumb)) {
            thumb = this._a.origin + thumb;
          } else if(this._regexp.relativePath.test(thumb)) {
            if(this._regexp.lastSlash.test(this._a.pathname)) {
              thumb = this._a.origin + this._a.pathname + thumb;
            } else {
              thumb = this._a.origin + this._a.pathname + '/../' + thumb;
            }
          }
          this._a.href = '';
          content = '<img src="' + thumb + '">';
        }
      }
    } finally {
      return content;
    }
  }
  _finally(args, result) {
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
  enqueue(args) {
    if(!args.url) {
      throw new SyntaxError('URL is needed');
    }
    if(!this._regexp.lazyURL.test(args.url)) {
      args.url = args.url.replace(this._regexp.noHostname, 'http://');
    }
    if(!args.callback || typeof args.callback !== 'function') {
      throw new SyntaxError('callback is needed');
    }
    if(!args.method) {
      args.method = 'HEAD';
    }
    if(typeof args.force === 'undefined') {
      args.force = false;
    }
    this.queue.push(args);
  }
  dequeue() {
    if(this.queue.length > 0) {
      this.expand();
    }
  }
  get _cacheMax() {
    return 100;
  }
  cache(shortUrl, expanded) {
    if(!this._cache.has(shortUrl)) {
      this._cache.set(shortUrl, expanded);
      if(this._cache.size > this._cacheMax) {
        this._cache.delete(this._cache.keys().next().value);
      }
    }
  }
  searchCache(shortUrl) {
    return this._cache.has(shortUrl) || false;
  }
  clear() {
    this.queue.splice(0);
    if(this._p) {
      this._xhr.abort();
    }
  }
}
