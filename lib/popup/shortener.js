var Shortener = {
  SHORTENER_IDLE_STR: chrome.i18n.getMessage("shortenerIdleString"),

  init: function() {
    var savedUrl = tweetManager.composerData.urlShortener;
    if(savedUrl !== '') {
      $("#shortener_area").find("input").val(savedUrl);
    }
    this.blur();
  },

  clear: function() {
    $("#shortener_area").find("input").val('');
    this.blur();
  },

  closeArea: function() {
    tweetManager.composerData.urlShortener = '';
  },

  focus: function() {
    var shortener = $("#shortener_area").find("input");
    var val = shortener.val();
    if(val == this.SHORTENER_IDLE_STR) {
      shortener.val('').removeAttr('style');
    }
  },

  showButton: function() {
    var shortenerButton = $("#shortener_button");
    if(!shortenerButton.css("display") != 'none') {
      shortenerButton.show('blind', { direction: "vertical" }, 'fast');
    }
  },

  hideButton: function() {
    var shortenerButton = $("#shortener_button");
    if(shortenerButton.css("display") != 'none') {
      shortenerButton.hide('blind', { direction: "vertical" }, 'fast');
    }
  },

  blur: function() {
    var shortener = $("#shortener_area").find("input");
    var val = shortener.val();
    if($.trim(val) === '' || val == this.SHORTENER_IDLE_STR) {
      shortener.val(this.SHORTENER_IDLE_STR).attr('style', 'color: #aaa;');
      this.hideButton();
    } else {
      this.showButton();
    }
  },

  changed: function(e) {
    var shortener = $("#shortener_area").find("input");
    var val = shortener.val();
    tweetManager.composerData.urlShortener = val;
    if($.trim(val) !== '') {
      if(e.which == 13) { //Enter key
        this.shortenIt();
      } else {
        this.showButton();
      }
    } else {
      this.hideButton();
    }
  },

  shortenCurrentPage: function(withoutQuery) {
    var query = {
      active: true,
      status: 'complete',
      windowType: 'normal'
    };
    chrome.tabs.query(query, (function(self) {
      return function(tabs) {
        var target = [];
        for(var tab of tabs) {
          if(/^https?/i.test(tab.url)) target.push(tab);
        }
        if(target.length > 0) {
          var url = target[0].url, title = target[0].title;  //TODO: should be selectable
          if(withoutQuery) url = url.split('?')[0];
          $("#shortener_area").find("input").val(url);
          self.shortenIt({title: title});
        } else {
          console.log("No target tab");
        }
      };
    })(this));
  },

  shortenIt: function(context) {
    var shortenerInput = $("#shortener_area").find("input");
    var longUrl = shortenerInput.val();
    this.shortenPage(longUrl, context);
  },

  shortenPage: function(longUrl, context) {
    $("#loading").show();
    var shortenerInput = $("#shortener_area").find("input").attr('disabled', 'disabled');
    this.hideButton();
    shortener.shorten(longUrl, (function(self) {
      return function(success, shortUrl) {
        $("#loading").hide();
        shortenerInput.removeAttr('disabled');
        self.closeArea();
        self.clear();
        if(success && shortUrl) {
          if(context && context.title && OptionsBackend.get('share_include_title')) {
            shortUrl = context.title + ' - ' + shortUrl;
          }
          Composer.addText(shortUrl);
        } else if(!success) {
          Renderer.showError(shortUrl);
        }
        Composer.showComposeArea(true);
      };
    })(this));
  }
};
