var loadingNewTweets = false;

function onTimelineRetrieved(tweets, timelineId) {
  if(!window) {
    //Sanity check, popup might be closed.
    return;
  }

  var timeline = tweetManager.getTimeline(timelineId);
  if(!timeline.template.visible) {
    return;
  }

  $("#loading").hide();
  if(tweets) {
    Paginator.needsMore = false;
    Renderer.assemblyTweets(tweets, timelineId);
    $("#timeline-" + timelineId).find('.inner_timeline').scrollTop(timeline.currentScroll);
  } else {
    var baseErrorMsg = tweetManager.currentError();
    var errorMsg = chrome.i18n.getMessage("ue_updatingTweets", baseErrorMsg);
    if(baseErrorMsg == '(timeout)') {
      errorMsg += chrome.i18n.getMessage("ue_updatingTweets2");
    }
    Renderer.showError(errorMsg, loadTimeline);
  }
  loadingNewTweets = false;

  prepareTimelines();
}

function loadTimeline(force, forcedTimeline) {
  loadingNewTweets = true;
  $("#loading").show();
  if(force) {
    Paginator.firstPage();
  }
  var cacheOnly = true;
  if(Paginator.needsMore) {
    cacheOnly = false;
  }
  if(!forcedTimeline) {
    forcedTimeline = tweetManager.currentTimelineId;
  }
  tweetManager.giveMeTweets(forcedTimeline, onTimelineRetrieved, force, cacheOnly);
}

function signout() {
  tweetManager.signout();
}

function suspend(forcedValue) {
  var suspendState = tweetManager.suspendTimelines(forcedValue);
  var suspended_notice = $("#suspended_notice");
  var suspend_toggle = $("#suspend_toggle");
  if(suspendState) {
    var nextOpacity = 0;
    function animateLoop() {
      if(nextOpacity == 1) {
        nextOpacity = 0.1;
      } else {
        nextOpacity = 1;
      }
      suspended_notice.animate({opacity: nextOpacity}, 1500, null, animateLoop);
    }
    suspended_notice.css({opacity: nextOpacity}).show();
    animateLoop();
    suspend_toggle.text(chrome.i18n.getMessage("resume"));
  } else {
    suspended_notice.stop().hide();
    suspend_toggle.text(chrome.i18n.getMessage("suspend"));
  }
}

function showRateLimit() {
  if(!OptionsBackend.get('show_hits_in_popup')) {
    return;
  }

  $("#popup_footer").show();
  if(tweetManager.twitterBackend) {
    var currentTime = (new Date()).getTime();
    var rateLimits = tweetManager.twitterBackend.remainingHitsInfo();
    var ticker = $("#hits_ticker");
    ticker.find('li').remove();
    for(var key in rateLimits) {
      if(!rateLimits.hasOwnProperty(key)) continue;
      var value = rateLimits[key];
      if(value.remaining == value.limit || !$.isNumeric(value.remaining)) continue;
      var remainTime = (value.reset - currentTime) / (60 * 1000);
      var displayRemainTime = '';
      if(remainTime > 1) displayRemainTime = ((remainTime > 15) ? 15: Math.ceil(remainTime)) + ' mins later';
      else displayRemainTime = 'whithin 1 minute';
      var displayText = [
        'API: ', key,
        ' | now ', value.limit - value.remaining, '/', value.limit, ' hits/15mins',
        ' | remain reset: ', displayRemainTime,
      ].join('');
      ticker.append('<li id="rateLimits_'+key.split('/').join('_')+'">'+displayText+'</li>');
    }

    // ticker implementation refer to http://black-flag.net/jquery/20121114-4332.html
    var targetLi = ticker.find('li');
    var intervalId = 0;
    var _this = this;
    if(targetLi.length < 1) {
      twitterBackend.updateWindowHitsLimit();
      setTimeout(_this.showRateLimit, 2000);
    } else {
      var rollupCount = 0;
      var setList = ticker.find('li').first();
      $("#popup_footer").css({height: '1.2em'});
      targetLi.css({top: '0', left: '0', position: 'absolute'});

      // rollup
      setList.css({top: '3em', display: 'block', opacity: '0', zIndex: '-101'}).stop().animate({top: '0', opacity: '1'}, 1000, 'swing').addClass('showlist');
      intervalId = setInterval(function(){
        ticker.find('.showlist').animate({top: '-3em', opacity: '0'}, 1000, 'swing').next().css({top: '3em', display: 'block', opacity: '0', zIndex: '-100'}).animate({top: '0', opacity: '1'}, 1000, 'swing').addClass('showlist').end().appendTo(ticker).css({zIndex: '-101'}).removeClass('showlist');
        if(++rollupCount == targetLi.length - 1) {
          clearInterval(intervalId);
          ticker.find('.showlist').delay(1000).animate({top: '-3em', opacity: '0'}, 1000, 'swing').finish();
          setTimeout(_this.showRateLimit, 1000);
        }
      }, 2000);
    }
  }
}

function newTweetsAvailable(count, unreadCount, timelineId) {
  if(!window) {
    //Sanity check, popup might be closed.
    return;
  }
  var currentTimeline = tweetManager.currentTimelineId;
  if(timelineId != currentTimeline) {
    if(unreadCount === 0) {
      $("#tab_modifier_" + timelineId).remove();
      return;
    }
    $("#tab_modifier_" + timelineId).remove();
    var timelineTabLink = $("#tab_\\#timeline-" + timelineId).find('a');
    var divEl = $(document.createElement("div")).addClass("tab_modifier").attr('id', "tab_modifier_" + timelineId);
    timelineTabLink.before(divEl);
    var modWidth = parseInt(timelineTabLink.parent().width(), 10) - 12;
    divEl.css({width: modWidth + 'px'});
    return;
  }
  if(count === 0)
    return;
  var tweets_string = count > 1 ? "tweet_plural" : "tweet_singular";
  $("#update_tweets").text(chrome.i18n.getMessage("newTweetsAvailable", [count, chrome.i18n.getMessage(tweets_string)])).fadeIn();
}

function updateNotificationFunc(timeline) {
  var timelineId = timeline.timelineId;
  var newTweetsInfo = tweetManager.newTweetsCount(timelineId);
  var newTweetsCount = newTweetsInfo[0];

  if(timeline.timelineId == tweetManager.currentTimelineId && timeline.currentScroll === 0) {
    if(newTweetsCount > 0) {
      tweetManager.updateNewTweets();
      $("#tab_modifier_" + timelineId).remove();
    }
  } else {
    newTweetsAvailable(newTweetsCount, newTweetsInfo[1], timelineId);
  }
}

function loadNewTweets() {
  Paginator.firstPage(true);
  $("#tab_modifier_" + tweetManager.currentTimelineId).remove();
  $("#update_tweets").fadeOut();

  prepareAndLoadTimeline();
}

function loadTrends() {
  var currentTTLocale = OptionsBackend.get('trending_topics_woeid');

  $("#trending_topics").actionMenu({
    loading: 'img/loading.gif',
    parentContainer: '#workspace'
  });

  tweetManager.retrieveTrendingTopics(function(userData) {
    var actions = [];

    if(userData) {
      for(var i = 0, len = userData.trends.length; i < len; ++i) {
        (function(trendName) {
          actions.push({
            name: trendName,
            action: function(event) {
              TimelineTab.addNewSearchTab(trendName, event.isAlternateClick);
            }
          });
        })(userData.trends[i].name);
      }
    } else {
      actions.push({
        name: 'Error, try again.',
        action: function(event) {
          loadTrends();
        }
      });
    }

    $("#trending_topics").actionMenu({
      actions: actions
    });
  }, currentTTLocale);
}

function prepareTimelines() {
  $("#update_tweets").hide();

  updateNotificationFunc(tweetManager.getCurrentTimeline());
  tweetManager.eachTimeline(function(timeline) {
    if(timeline.timelineId != tweetManager.currentTimelineId) {
      updateNotificationFunc(timeline);
    }
  });
}

function prepareAndLoadTimeline() {
  prepareTimelines();
  loadTimeline();
}

function initializeWorkspace() {
  $(window).unload(function() {
    if(tweetManager) {
      tweetManager.registerWarningsCallback(null);
      tweetManager.registerNewTweetsCallback(null);
      tweetManager.sendQueue.cleanUpCallbacks();
    }
    if(UploadManager) {
      UploadManager.unregisterCallbacks();
    }
  });

  tweetManager.registerNewTweetsCallback(newTweetsAvailable);
  $("#workspace").show();
  ThemeManager.init();

  if(ThemeManager.isPopup) {
    Renderer.setContext('popup');
  } else {
    Renderer.setContext('standalone');
  }

  TimelineTab.init();
  tweetManager.orderedEachTimeline(function(timeline) {
    if(timeline.template.id == TimelineTemplate.SEARCH) {
      SearchTab.addSearchTab(timeline.timelineId);
    } else {
      TimelineTab.addTab(timeline.timelineId, timeline.template.timelineName);
    }
  });
  ThemeManager.handleSortableTabs();

  if(OptionsBackend.get('compose_position') == 'bottom') {
    var composeArea = $("#compose_tweet_area").detach();
    var composeButton = $("#compose_tweet").detach();
    $("#workspace").append(composeArea).append(composeButton);
  }

  //Delay loading, improving responsiveness
  setTimeout(function() {
    ThemeManager.initWindowResizing();
    Lists.init();
    ContextMenu.init();

    TimelineTab.select(tweetManager.currentTimelineId);
    Composer.init();
    Shortener.init();

    prepareAndLoadTimeline();

    var tabEl = $("#timeline-" + tweetManager.currentTimelineId).find('.inner_timeline');
    tabEl.scrollTop(tweetManager.getCurrentTimeline().currentScroll);

    tweetManager.registerWarningsCallback(function(msg, showHTML) {
      Renderer.warningsCallback.call(Renderer, msg, false, showHTML);
    });
    suspend(tweetManager.suspend);
    showRateLimit();

    WorkList.init();
    Autocomplete.init();
    $("#shorten_current").prop("title", chrome.i18n.getMessage("shorten_current"));
    $("#detach_img").prop("title", chrome.i18n.getMessage("detach_window"));

    $("#options_page_link").anyClick(function() {
      openTab(chrome.extension.getURL('options.html'));
    });
    
    loadTrends();
    
    ImageUpload.init();

    backgroundPage._gaq.push(['_trackPageview', 'popup.html']);
  }, 0);
}


var bindEvents = function() {

  var baseElement = $(document);
  baseElement.find("#warning .dismiss").on('click', Renderer.hideMessage.bind(Renderer));

  baseElement.find("#signout").on('click', function(ev) {
    ev.preventDefault();
    signout();
  });

  baseElement.find("#refresh_trigger").on('click', function(ev) {
    ev.preventDefault();
    Composer.refreshNew();
  });

  baseElement.find("#suspend_toggle").on('click', function(ev) {
    ev.preventDefault();
    suspend();
  });

  baseElement.find("#mark_all_read_trigger").on('click', function(ev) {
    ev.preventDefault();
    Renderer.markAllAsRead();
  });

  baseElement.find("#detach_trigger").on('click', function(ev) {
    ev.preventDefault();
    Renderer.detach();
  });

  baseElement.find("#update_tweets").on('click', loadNewTweets);

  baseElement.find("#btnAuthorize").on('click', myOAuth.registerPin.bind(myOAuth));

  baseElement.find("#enter_pin a").on('click', function(ev) {
    ev.preventDefault();
    myOAuth.requestNewToken();
  });

  baseElement.on('click', '.msg-trigger-requestnewtoken', function() {
    OAuth.requestNewToken();
  });

  baseElement.on('click', '.msg-trigger-openoptions', function() {
    chrome.tabs.create({
      url: chrome.extension.getURL('options.html')
    });
  });

  Composer.bindEvents();
  WorkList.bindEvents();

};



$(function() {
  bindEvents();

  $("input.i18n").each(function() {
    $(this).val(chrome.i18n.getMessage(this.id));
  });

  $("span.i18n").each(function() {
    $(this).text(chrome.i18n.getMessage(this.id));
  });

  $("a.i18n").each(function() {
    $(this).text(chrome.i18n.getMessage(this.id));
  });

  if(!backgroundPage.SecretKeys.hasValidKeys()) {
    Renderer.showError(chrome.i18n.getMessage('invalid_keys'));
    $("#workspace").show().height(300);
    ThemeManager.init();
    return;
  }

  if(!twitterBackend.authenticated()) {
    if(twitterBackend.tokenRequested()) {
      $("#enter_pin").show();
    }
    return;
  }

  initializeWorkspace();
});
