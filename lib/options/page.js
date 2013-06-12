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

  var ctdr_checkbox = $("input[name='compliant_twitter_display_requirements']");
  var onCompliantTwitterRequirementsChange = function() {
    if(ctdr_checkbox.is(':checked')) {
      $("input[name='hidden_user_icons']").attr('disabled', 'disabled');
      $("input[name='display_simple_name']").attr('disabled', 'disabled');
      $("input[name='hidden_timestamp']").attr('disabled', 'disabled');
      $("select[name='name_attribute']").attr('disabled', 'disabled');
      $("input[name='hidden_footer']").attr('disabled', 'disabled');
      $("input[name='aggressive_flat']").attr('disabled', 'disabled');
      $('#incompliant_options').hide();
    } else {
      $('#incompliant_options').show();
      $("input[name='hidden_user_icons']").removeAttr('disabled');
      $("input[name='display_simple_name']").removeAttr('disabled');
      $("input[name='hidden_timestamp']").removeAttr('disabled');
      $("select[name='name_attribute']").removeAttr('disabled');
      $("input[name='hidden_footer']").removeAttr('disabled');
      $("input[name='aggressive_flat']").removeAttr('disabled');
    }
  };
  ctdr_checkbox.click(onCompliantTwitterRequirementsChange);

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
    onCompliantTwitterRequirementsChange();
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
    } else if(optionName == 'url_shortener') {
      tweetManager.shortenerAuth.token = null;
      tweetManager.shortenerAuth.tokenSecret = '';
      OptionsBackend.saveOption('shortener_token', null);
      OptionsBackend.saveOption('shortener_token_secret', '');
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
  backgroundPage._gaq.push(['_trackPageview', 'option.html']);
});
