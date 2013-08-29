var options = new Options();

function bindEvents() {
  $("#d_restart_immediately").on('click', function() {
    options.confirmRestart();
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

  for(var key in tweetManager.shortener.backends) {
    var desc = tweetManager.shortener.backends[key].desc;
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
      $(".CTDR").attr('disabled', 'disabled');
      $('#incompliant_options').hide();
    } else {
      $('#incompliant_options').show();
      $(".CTDR").removeAttr('disabled');
    }
  };
  ctdr_checkbox.click(onCompliantTwitterRequirementsChange);
  var ctdr_footer_checkbox = $("input[name='hidden_footer']");
  var onHiddenFooter = function() {
    if(ctdr_footer_checkbox.is(':checked')) {
      $(".hFooter").attr('disabled', 'disabled');
    } else {
      $(".hFooter").removeAttr('disabled');
    }
  };
  ctdr_footer_checkbox.click(onHiddenFooter);
  var use_streaming_checkbox = $("input[name='use_streaming_api']");
  var onUseStreaming = function() {
    if(use_streaming_checkbox.is(':checked')) {
      $("input[name='home_refresh_interval']").attr('disabled', 'disabled');
      $("input[name='mentions_refresh_interval']").attr('disabled', 'disabled');
      $("input[name='dms_refresh_interval']").attr('disabled', 'disabled');
    } else {
      $("input[name='home_refresh_interval']").removeAttr('disabled');
      $("input[name='mentions_refresh_interval']").removeAttr('disabled');
      $("input[name='dms_refresh_interval']").removeAttr('disabled');
    }
  };
  use_streaming_checkbox.click(onUseStreaming);

  $('div.color_selector').ColorPicker({
    onChange: function (hsb, hex, rgb, rgbaStr) {
      var div = this.data('colorpicker').el;
      $(div).attr('strColor', rgbaStr);
      $(div).css('backgroundColor', rgbaStr);
    }
  });

  options.onload(function() {
    onHiddenFooter();
    onCompliantTwitterRequirementsChange();
    onUseStreaming();
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
      OptionsBackend.setDefault('shortener_token');
      OptionsBackend.setDefault('shortener_token_secret');
      OptionsBackend.cachedOptions = null;
    } else if(optionName == 'use_streaming_api') {
      OptionsBackend.setDefault('home_refresh_interval');
      OptionsBackend.setDefault('mentions_refresh_interval');
      OptionsBackend.setDefault('dms_refresh_interval');
      OptionsBackend.cachedOptions = null;
    }
  });
  options.onsave(function() {
    tweetManager.startShortener();
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
