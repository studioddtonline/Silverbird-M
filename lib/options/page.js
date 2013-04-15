var LocaleTable = chrome.extension.getBackgroundPage().LocaleTable;
var ImageService = chrome.extension.getBackgroundPage().ImageService;
var IconCreator = chrome.extension.getBackgroundPage().IconCreator;
var tweetManager = chrome.extension.getBackgroundPage().TweetManager.instance;

chrome.i18n.getMessage = chrome.extension.getBackgroundPage().chrome.i18n.getMessage;

var twitterBackend = tweetManager.twitterBackend;
var options = new Options();
var imgEl = null;

function paintIcon(canvas, color) {
  if(!imgEl) {
    var img = $('<img>').attr('src', 'img/icon19.png');
    img.load(function() {
      imgEl = img[0];
      var imgData = IconCreator.paintIcon(imgEl, color);
      canvas.getContext("2d").putImageData(imgData, 0, 0);
    });
  } else {
    var imgData = IconCreator.paintIcon(imgEl, color);
    canvas.getContext("2d").putImageData(imgData, 0, 0);
  }
}

function bindEvents() {
  $("#Yes").on('click', function() {
    options.confirmRestart();
  });

  $("#No").on('click', function() {
    options.denyRestart();
  });

  $("#btn_reset_popup_size").on('click', function() {
    Persistence.popupSize().remove();
  });

  $("#btn_save").on('click', function() {
    options.save();
  });

  $("#btn_reset").on('click', function() {
    options.load();
  });

  $("#btn_default").on('click', function() {
    options.loadDefaults();
  });
}

$(function() {
  bindEvents();

  $("input.i18n").each(function() {
    $(this).val(chrome.i18n.getMessage(this.id));
  });

  $(".i18n").not("input .htmlSafe").each(function() {
    $(this).text(chrome.i18n.getMessage(this.id));
  });

  $(".i18n.htmlSafe").each(function() {
    $(this).html(chrome.i18n.getMessage(this.id));
  });

  $("select[name='default_locale']").append($("<option>").val('auto').text(chrome.i18n.getMessage('automatic')));
  for(var localeCode in LocaleTable.instance.locales) {
    $("select[name='default_locale']").append($("<option>").val(localeCode).text(localeCode));
  }

  for(var key in SHORTENERS_BACKEND) {
    var desc = SHORTENERS_BACKEND[key].desc;
    $("select[name='url_shortener']").append($("<option>").val(key).text(desc));
  }

  for(var i = 0, len = ImageService.services.length; i < len; ++i) {
    var service = ImageService.services[i];
    if(service.hasUpload()) {
      $("select[name='image_upload_service']").append($("<option>").val(service.domain).text(service.domain));
    }
  }

  var onShortenerChange = function() {
    $("#shortener_opts").hide();
    $("#yourls_opts").hide();
    $("#googl_opts").hide();
    var shortenerSelect = $("select[name='url_shortener']")[0];
    if(shortenerSelect.value == 'bitly' || shortenerSelect.value == 'jmp' || shortenerSelect.value == 'karmacracy') {
      $("#shortener_opts").show();
    } else if(shortenerSelect.value == 'yourls') {
      $("#yourls_opts").show();
    } else if(shortenerSelect.value == 'googl') {
      $("#googl_opts").show();
    }
  };

  var onShortenerAcctClick = function() {
    if($("input[name='shortener_acct']").is(':checked')) {
      $("input[name='shortener_login']").removeAttr('disabled');
      $("input[name='shortener_key']").removeAttr('disabled');
    } else {
      $("input[name='shortener_login']").val('').attr('disabled', 'disabled');
      $("input[name='shortener_key']").val('').attr('disabled', 'disabled');
    }
  };
  $("select[name='url_shortener']").change(onShortenerChange);
  $("input[name='shortener_acct']").click(onShortenerAcctClick);

  $('canvas.color_selector').ColorPicker({
    onChange: function (hsb, hex, rgb, rgbaStr) {
      var canvas = this.data('colorpicker').el;
      $(canvas).prop('strColor', rgbaStr);
      paintIcon(canvas, rgb);
    }
  });
  $('div.color_selector').ColorPicker({
    onChange: function (hsb, hex, rgb, rgbaStr) {
      var div = this.data('colorpicker').el;
      $(div).prop('strColor', rgbaStr);
      $(div).css('backgroundColor', rgbaStr);
    }
  });
  options.onload(function() {
    onShortenerChange();
    onShortenerAcctClick();
  });
  options.onsaveChangedOption(function(optionName, oldValue, newValue) {
    var idx, templateId;
    if((idx = optionName.indexOf('_visible')) != -1) {
      templateId = optionName.substring(0, idx);
      if(newValue) {
        tweetManager.showTimelineTemplate(templateId, true);
      } else {
        tweetManager.hideTimelineTemplate(templateId);
      }
    } else if((idx = optionName.indexOf('_include_unified')) != -1) {
      templateId = optionName.substring(0, idx);
      tweetManager.toggleUnified(templateId, newValue);
    } else if(optionName == 'trending_topics_woeid') {
      tweetManager.cachedTrendingTopics = null;
    }
  });
  options.onsave(function() {
    if($("#noti_desktop").is(":checked")) {
      try {
        var notificationCenter = window.notifications || window.webkitNotifications;
        if(!notificationCenter) {
          throw 'out';
        }
        var authStatus = notificationCenter.checkPermission();
        if(authStatus == 1 || authStatus == 2) { // Not allowed or Denied
          notificationCenter.requestPermission(function() {
            var authStatus = notificationCenter.checkPermission();
            if(authStatus !== 0) { // Permission denied
              $("#noti_on_page").click();
              options.save();
            }
          });
        }
      } catch(boom) {
        $("#noti_on_page").click();
        options.save();
      }
    }
  });
  options.load();

  var createTTSelect = function(ttLocales) {
    $("select[name='trending_topics_woeid']").empty();
    $.each(ttLocales, function(i, locale){
      $("select[name='trending_topics_woeid']").append($("<option>").val(locale.woeid).text(locale.name));
    });
    $("select[name='trending_topics_woeid']").val(OptionsBackend.get('trending_topics_woeid'));
  };
  var woeids = tweetManager.retrieveTrendingRegions(function(woeids) {
    createTTSelect(woeids);
  });
  createTTSelect(woeids);
});
