var Shortener = {
  SHORTENER_IDLE_STR: chrome.i18n.getMessage("shortenerIdleString"),

  init: function() {
    var savedUrl = tweetManager.composerData.urlShortener;
    if(savedUrl !== '') {
      $('#shortener_text').val(savedUrl);
    }
    Shortener.blur();
  },

  clear: function() {
    $('#shortener_text').val('');
    Shortener.blur();
  },

  sync: function(str) {
    tweetManager.composerData.urlShortener = str || '';
  },

  focus: function() {
    var shortener = $('#shortener_text');
    if(shortener.val() == Shortener.SHORTENER_IDLE_STR) {
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
    var shortener = $('#shortener_text');
    var val = shortener.val();
    if(val.trim() === '' || val == Shortener.SHORTENER_IDLE_STR) {
      shortener.val(Shortener.SHORTENER_IDLE_STR).attr('style', 'color: #aaa;');
      Shortener.hideButton();
    } else {
      Shortener.showButton();
    }
  },

  changed: function(e) {
    var shortener = $('#shortener_text');
    var val = shortener.val();
    tweetManager.composerData.urlShortener = val;
    if(val.trim() !== '' && /^https?:\/\//.test(val)) {
      if(e.which == 13) { //Enter key
        Shortener.shortenIt();
      } else {
        Shortener.showButton();
      }
    } else {
      Shortener.hideButton();
    }
  },

  shortenCurrentPage: function(withoutQuery) {
    var query = {
      active: true,
      status: 'complete',
      windowType: 'normal'
    };
    chrome.tabs.query(query, function(tabs) {
      var target = [];
      for(var tab of tabs) {
        if(/^https?/i.test(tab.url)) target.push(tab);
      }
      if(target.length > 0) {
        var url = target[0].url, title = target[0].title;  //TODO: should be selectable
        if(withoutQuery) url = url.split('?')[0];
        $('#shortener_text').val(url);
        Shortener.shortenIt({title: title});
      } else {
        console.log("No target tab");
      }
    });
  },

  shortenIt: function(context) {
    Shortener.shortenPage(document.getElementById('shortener_text').value, context);
  },

  shortenPage: function(longUrl, context) {
    $("#loading").show();
    var shortenerInput = $('#shortener_text').attr('disabled', 'disabled');
    Shortener.hideButton();
    shortener.shorten(longUrl, function(success, shortUrl) {
      $("#loading").hide();
      shortenerInput.removeAttr('disabled');
      Shortener.clear();
      Shortener.sync();
      if(success && shortUrl) {
        if(context && context.title && OptionsBackend.get('share_include_title')) {
          shortUrl = context.title + ' - ' + shortUrl;
        }
        Composer.addText(shortUrl);
      } else if(!success) {
        Renderer.showError(shortUrl);
      }
      Composer.showComposeArea(true);
    });
  }
};
