var Shortener = {
  SHORTENER_IDLE_STR: chrome.i18n.getMessage("shortenerIdleString"),
  CHROME_QUERY_PARAMS: {
    active: true,
    status: "complete",
    windowType: "normal"
  },
  context: [],

  init: function() {
    var input = $('#shortener_text');
    input.autocomplete({
      source: function(request, response) {
        chrome.tabs.query(Shortener.CHROME_QUERY_PARAMS, function(tabs) {
          Shortener.context = tabs.filter(function(entry) {
            if(entry.url && /^https?:\/\//i.test(entry.url)) {
              return true;
            }
          });
          response(Shortener.context.map(function(entry) {
            return entry.url;
          }) || []);
        });
      },
      select: function(event, ui) {
        Shortener.blur();
      },
      open: function(event, ui) {
        $('.ui-autocomplete').css({
          overflow: 'auto',
          maxHeight: '200px'
        });
      }
    });
    var savedUrl = tweetManager.composerData.urlShortener;
    if(savedUrl !== '') {
      input.val(savedUrl);
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
    var input = $('#shortener_text');
    if(input.val() == Shortener.SHORTENER_IDLE_STR) {
      input.val('').removeAttr('style').autocomplete('search', 'http');
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
    var input = $('#shortener_text');
    var val = input.val();
    if(val.trim() === '' || val == Shortener.SHORTENER_IDLE_STR || !(/^https?:\/\//i.test(val))) {
      input.val(Shortener.SHORTENER_IDLE_STR).attr('style', 'color: #aaa;');
      Shortener.hideButton();
    } else {
      Shortener.showButton();
    }
  },

  changed: function(e) {
    var input = $('#shortener_text');
    var val = input.val();
    tweetManager.composerData.urlShortener = val;
    if(val.trim() !== '' && /^https?:\/\//.test(val)) {
      if(e.which == 13) { //Enter key
        Shortener.shortenIt({withoutQuery: e.ctrlKey || Composer.macCommandKey});
      } else {
        Shortener.showButton();
      }
    } else {
      Shortener.hideButton();
    }
  },

  shortenIt: function(context) {
    Shortener.shortenPage(document.getElementById('shortener_text').value, context);
  },

  shortenPage: function(longUrl, context) {
    $("#loading").show();
    var input = $('#shortener_text');
    input.attr('disabled', 'disabled');
    Shortener.hideButton();
    if(context.withoutQuery) {
      longUrl = longUrl.split('?')[0];
    }
    shortener.shorten(longUrl, function(success, shortUrl, longUrl) {
      $("#loading").hide();
      input.removeAttr('disabled');
      Shortener.clear();
      Shortener.sync();
      if(success && shortUrl) {
        if(OptionsBackend.get('share_include_title')) {
          if(context && context.title) {
            shortUrl = context.title + ' - ' + shortUrl;
          } else if(longUrl) {
            var filterd = Shortener.context.filter(function(entry) {
              return longUrl == entry.url || longUrl == entry.url.split('?')[0];
            }) || [];
            if(filterd.length > 0) {
              shortUrl = filterd[0].title + ' - ' + shortUrl;
            }
          }
        }
        Composer.addText(shortUrl);
      } else if(!success) {
        Renderer.showError(shortUrl);
      }
      Composer.showComposeArea(true);
    });
  }
};
