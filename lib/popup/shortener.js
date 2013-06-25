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
    var shortenerButton = $("#shortener_button").find("div");
    if(!shortenerButton.css("display") != 'none') {
      shortenerButton.show('blind', { direction: "vertical" }, 'fast');
    }
  },

  hideButton: function() {
    var shortenerButton = $("#shortener_button div");
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

  shortenCurrentPage: function() {
    var closure_shortenCurrentPage = function(self) {
      return function(tab) {
        $("#shortener_area").find("input").val(tab.url);
        self.shortenIt({title: tab.title});
      };
    };
    chrome.tabs.getSelected(null, closure_shortenCurrentPage(this));
  },

  shortenCurrentPageWithoutQuery: function() {
    var closure_shortenCurrentPageWithoutQuery = function(self) {
      return function(tab) {
        $("#shortener_area").find("input").val(tab.url.split('?')[0]);
        self.shortenIt({title: tab.title});
      };
    };
    chrome.tabs.getSelected(null, closure_shortenCurrentPageWithoutQuery(this));
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
    var closure_shortenPage = function(self) {
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
    };
    shortener.shorten(longUrl, closure_shortenPage(this));
  }
};
