"use strict";
const options = new Options(OptionsBackend);

function bindEvents() {
  $("#d_restart_immediately").on('click', (event) => {
    options.confirmRestart();
  });
  $("#btn_reset_popup_size").on('click', (event) => {
    tweetManager.popupWindowSize = null;
  });
  $("#btn_save").on('click', (event) => {
    options.save();
  });
  $("#btn_reset").on('click', (event) => {
    options.load();
  });
  $("#btn_default").on('click', (event) => {
    options.loadDefaults();
  });
  $("input[name='compliant_twitter_display_requirements']").on("change", (event) => {
    if(event.target.checked) {
      $(".CTDR").attr('disabled', 'disabled');
      $('#incompliant_options').hide();
    } else {
      $('#incompliant_options').show();
      $(".CTDR").removeAttr('disabled');
    }
    $("input[name='hidden_footer']").triggerHandler("change");
  });
  $("input[name='hidden_footer']").on("change", (event) => {
    if(event.target.checked) {
      $(".hFooter").attr('disabled', 'disabled');
    } else {
      $(".hFooter").removeAttr('disabled');
    }
  });
  $("input[name='unified_visible']").on("change", (event) => {
    if(event.target.checked) {
      $('input[name="notification_include_unified"]').removeAttr('disabled');
      $('input[name="notify_update_trends"]').removeAttr('disabled');
    } else {
      $('input[name="notification_include_unified"]').attr('disabled', 'disabled');
      $('input[name="notify_update_trends"]').attr('disabled', 'disabled');
    }
  });
  $('input[name="notification_include_unified"]').on("change", (event) => {
    if(event.target.checked) {
      $('input[name="notify_update_trends"]').removeAttr('disabled');
    } else {
      $('input[name="notify_update_trends"]').attr('disabled', 'disabled');
    }
  });
  const handler_onChangeTimelineVisible = (event) => {
    const timeline = event.target.name.split("_")[0] || "";
    if(timeline === "") {
      return;
    }
    const inputIncludeUnified = $("input[name='" + timeline + "_include_unified']"),
          inputNotyfy = $("input[name='" + timeline + "_notify']");
    if(event.target.checked) {
      inputIncludeUnified.removeAttr('disabled');
      if(timeline !== "likes") {
        inputNotyfy.removeAttr('disabled');
      }
    } else {
      inputIncludeUnified.attr('checked', false).attr('disabled', 'disabled');
      if(timeline !== "likes") {
        inputNotyfy.attr('checked', false).attr('disabled', 'disabled');
      }
    }
  };
  ['home', 'mentions', 'dms', 'lists', 'search', 'likes'].forEach((timeline) => {
    $("input[name=" + timeline + "_visible]").on("change", handler_onChangeTimelineVisible);
  });
  $("input[name='tweets_notification_style']").on("change", (event) => {
    const selected = event.target.value || "desktop";
    const notifyOptions = $(".notify_options");
    if(selected == 'never') {
      notifyOptions.find('input').attr('disabled', 'disabled');
      notifyOptions.hide();
    } else if(selected == 'desktop') {
      notifyOptions.find('input').removeAttr('disabled');
      notifyOptions.show();
      ['home', 'mentions', 'dms', 'lists', 'search'].forEach((timeline) => {
        $("input[name=" + timeline + "_visible]").triggerHandler("change");
      });
    } else {
      throw new TypeError("uncaught value");
    }
  });
  $("input[name='use_streaming_api']").on("change", (event) => {
    if(event.target.checked) {
      ['home', 'mentions', 'dms'].forEach((timeline) => {
        $("input[name=" + timeline + "_refresh_interval]").attr('disabled', 'disabled');
      });
    } else {
      ['home', 'mentions', 'dms'].forEach((timeline) => {
        $("input[name=" + timeline + "_refresh_interval]").removeAttr('disabled');
      });
    }
  });
}

$(function() {
  bindEvents();
  doLocalization();

  // build shortener list
  const $selectShortener = $("select[name='url_shortener']");
  $selectShortener.empty();
  if(tweetManager && tweetManager.ready && Array.isArray(tweetManager.shortener.services)) {
    tweetManager.shortener.services.forEach((service) => {
      $selectShortener.append($("<option>").val(service).text(service));
    });
  } else {
    $selectShortener.parents(".container").hide();
  }

  // build trending regions list
  const $selectTrendingRegions = $("select[name='trending_topics_woeid']");
  $selectTrendingRegions.empty();
  tweetManager.retrieveTrendingRegions((ttLocales) => {
    ttLocales.forEach((locale) => {
      $selectTrendingRegions.append($("<option>").val(locale.woeid).text(locale.name));
    });
    $selectTrendingRegions.val(OptionsBackend.get('trending_topics_woeid'));
  });

  // colorpicker
  $('div.color_selector').ColorPicker({
    onChange: function(hsb, hex, rgb, rgbaStr) {
      const div = this.data('colorpicker').el;
      $(div).attr('strColor', rgbaStr);
      $(div).css('backgroundColor', rgbaStr);
    }
  });

  options.onload(() => {
    $("input[name='compliant_twitter_display_requirements']").triggerHandler("change");
    $("input[name='hidden_footer']").triggerHandler("change");
    $("input[name='unified_visible']").triggerHandler("change");
    $('input[name="notification_include_unified"]').triggerHandler("change");
    ['home', 'mentions', 'dms', 'lists', 'search', 'likes'].forEach((timeline) => {
      $("input[name=" + timeline + "_visible]").triggerHandler("change");
    })
    $("input[name='tweets_notification_style']:checked").triggerHandler("change");
    $("input[name='use_streaming_api']").triggerHandler("change");
  });
  options.onsaveChangedOption((optionName, oldValue, newValue) => {
    let idx, templateId;
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
      tweetManager.cachedTrendingTopics = undefined;
    } else if(optionName == 'url_shortener') {
      OptionsBackend.cachedOptions = null;
      tweetManager.shortener.readyToChange();
    } else if(optionName == 'use_streaming_api') {
      OptionsBackend.cachedOptions = null;
      OptionsBackend.setDefault('home_refresh_interval');
      OptionsBackend.setDefault('mentions_refresh_interval');
      OptionsBackend.setDefault('dms_refresh_interval');
    }
  });
  options.onsave(() => {
  });
  options.load();
});
