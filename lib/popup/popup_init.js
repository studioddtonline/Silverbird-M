var loadingNewTweets = false;
var currentTimelineTweetPositions = [];
var countNoTweets = 0;

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
    if(tweets.length > 0) {
      countNoTweets = 0;
      Paginator.needsMore = false;
      Renderer.assemblyTweets(tweets, timelineId);
      var currentInnerTimeline = $("#timeline-" + timelineId).find('.inner_timeline');
      currentInnerTimeline.scrollTop(timeline.currentScroll);
      if(OptionsBackend.get('use_keyboard_shortcuts')
      && timelineId == tweetManager.currentTimelineId) {
        caliculateTweetPositions();
      }
    } else {
      countNoTweets++;
      var errorMsg = "";
      if(timeline.template.id === TimelineTemplate.SEARCH) {
        errorMsg = chrome.i18n.getMessage("ue_updatingTweets_noresult") + chrome.i18n.getMessage("ue_updatingTweets_nofetched");
      } else {
        errorMsg = chrome.i18n.getMessage("ue_updatingTweets", chrome.i18n.getMessage("undefined_message")) + chrome.i18n.getMessage("ue_updatingTweets_nofetched");
      }
      Paginator.needsMore = false;
      Renderer.assemblyTweets(tweets, timelineId);
      if(countNoTweets > 5) {
        Renderer.showError(errorMsg, null, true);
      }
    }
  } else {
    countNoTweets++;
    var baseErrorMsg = tweetManager.currentError() || chrome.i18n.getMessage("undefined_message");
    var errorMsg = chrome.i18n.getMessage("ue_updatingTweets", baseErrorMsg);
    var tryAgainFunc = loadTimeline;
    var showHtml = false;
    if(baseErrorMsg == '(timeout)') {
      errorMsg += chrome.i18n.getMessage("ue_updatingTweets_timeout");
      tryAgainFunc = null;
      showHtml = true;
    } else if(baseErrorMsg == '(Too Many Requests)') {
      /* onHitsUpdated will call */
      return;
    }
    Renderer.showError(errorMsg, tryAgainFunc, showHtml);
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
  windowOnUnload();
  window.close();
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
    suspend_toggle.text(chrome.i18n.getMessage("suspend_toggle"));
  }
}

function showRateLimit() {
  if(!OptionsBackend.get('show_hits_in_popup')) {
    $("#popup_footer").hide();
    return;
  }

  $("#popup_footer").show();
  if(twitterBackend) {
    var currentTime = Date.now();
    var rateLimits = twitterBackend.remainingHitsInfo();
    var ticker = $("#hits_ticker"), tickerInner = [], displayRemainTime = '';
    ticker.empty();
    for(var key in rateLimits) {
      if(!rateLimits.hasOwnProperty(key)) continue;
      var value = rateLimits[key];
      if(value.remaining == value.limit || !$.isNumeric(value.remaining)) continue;
      if(currentTime > value.reset || !$.isNumeric(value.reset)) continue;
      var remainTime = (value.reset - currentTime) / (60 * 1000);
      if(remainTime > 1) displayRemainTime = ((remainTime > 15) ? 15: Math.ceil(remainTime)) + ' mins later';
      else displayRemainTime = 'whithin 1 minute';
      var displayText = 'API: ' + key + ' | now ' + (value.limit - value.remaining) + '/' + value.limit + ' hits/15mins' + ' | remain reset: ' + displayRemainTime;
      tickerInner.push('<li id="rateLimits_'+key.split('/').join('_')+'">'+displayText+'</li>');
    }
    ticker.html(tickerInner.join(''));

    var intervalId = 0;
    if(ticker.find('li').length > 0) {
      $("#popup_footer").css({height: '1.2em'});
      // rollup
      ticker.find('li').eq(0).hide().fadeIn(1000);
      intervalId = setInterval(function(){
        ticker.find('li').eq(0).remove();
        ticker.find('li').eq(0).hide().fadeIn(1000);
        if(ticker.find('li').length == 1) {
          clearInterval(intervalId);
          ticker.find('li').eq(0).remove();
          setTimeout(showRateLimit, 1000);
        }
      }, 2000);
    } else {
      $("#popup_footer").hide();
      setTimeout(showRateLimit, 2000);
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
    var updateTab = $("#tab_\\#timeline-" + timelineId);
    if(unreadCount === 0) {
      updateTab.removeClass('update_modifier');
      return;
    }
    updateTab.addClass('update_modifier');
    return;
  }
  if(count === 0) return;
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
      $("#tab_\\#timeline-" + timelineId).removeClass('update_modifier');
    }
  } else {
    newTweetsAvailable(newTweetsCount, newTweetsInfo[1], timelineId);
  }
}

function loadNewTweets() {
  Paginator.firstPage(true);
  $("#tab_\\#timeline-" + tweetManager.currentTimelineId).removeClass('update_modifier');
  $("#update_tweets").fadeOut();

  prepareAndLoadTimeline();
}

function loadTrends() {
  $("#trending_topics").actionMenu({
    loading: 'img/loading.gif',
    parentContainer: '#workspace'
  });

  var userData = tweetManager.cachedTrendingTopics;
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
}

function loadSavedSearch() {
  $("#saved_searches").actionMenu({
    loading: 'img/loading.gif',
    parentContainer: '#workspace'
  });

  var userData = tweetManager.savedSearchCache;
  var actions = [];

  if(userData && userData.length > 0) {
    for(var i = 0, len = userData.length; i < len; ++i) {
      (function(query) {
        actions.push({
          name: (query.length > 10) ? query.substring(0, 10) + '...': query,
          action: function(event) {
            TimelineTab.addNewSearchTab(query, event.isAlternateClick);
          }
        });
      })(userData[i].query);
    }
  } else {
    actions.push({
      name: 'Empty or Error',
      action: function(event) {
        loadSavedSearch();
      }
    });
  }

  $("#saved_searches").actionMenu({
    actions: actions
  });
}

function prepareTimelines() {
  var update_tweets = $("#update_tweets");
  if(update_tweets.css('display') !== 'none') {
    update_tweets.hide();
  }

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

function handleKeyboardShortcuts(event) {
  var through = false;
  if(document.activeElement.tagName.toLowerCase() == 'input'
  || document.activeElement.tagName.toLowerCase() == 'textarea') {
    through = true;
  }
  if(event.altKey && event.shiftKey) {
    switch(event.keyCode) {
      case 67:  // c
        Composer.showComposeArea();
        break;
      case 82:  // r
        windowOnUnload();
        chrome.runtime.reload();
        break;
      default:
        break;
    }
  } else if(event.ctrlKey) {
    switch(event.keyCode) {
      case 81:  // q
        windowOnUnload();
        window.close();
        break;
      default:
        break;
    }
  } else if (!through){
    switch(event.keyCode) {
      case 65:  // a
        TimelineTab.selectLeft(tweetManager.currentTimelineId);
        break;
      case 72:  // h
        TimelineTab.selectLeft(tweetManager.currentTimelineId);
        break;
      case 74:  // j
        TimelineTab.scroll(scrollNextTweet());
        break;
      case 75:  // k
        TimelineTab.scroll(scrollPrevTweet());
        break;
      case 76:  // l
        TimelineTab.selectRight(tweetManager.currentTimelineId);
        break;
      case 82:  // r
        if($("#update_tweets").css('display') !== 'none') {
          loadNewTweets();
        } else {
          Composer.refreshNew();
        }
        break;
      case 83:  // s
        TimelineTab.selectRight(tweetManager.currentTimelineId);
        break;
      case 84:  // t
        TimelineTab.scroll(0);
        break;
      case 85:  // u
        TimelineTab.select(TimelineTemplate.UNIFIED);
        break;
      default:
        break;
    }
  }
}

function caliculateTweetPositions() {
  var tweetsInnerTimeline = $("#timeline-" + tweetManager.currentTimelineId).find('.tweet_space'), firstOffset;
  currentTimelineTweetPositions = [];
  if(tweetsInnerTimeline.length > 0) {
    firstOffset = tweetsInnerTimeline.eq(0).offset().top;
    currentTimelineTweetPositions = tweetsInnerTimeline.map(function() {
      return $(this).offset().top - firstOffset;
    }).get();
  }
}

function scrollNextTweet() {
  var twtPositions = currentTimelineTweetPositions, twtPosLength = twtPositions.length;
  if(twtPosLength > 0) {
    var currentScrollOverTweet = 0;
    var currentTimelineScrolled = tweetManager.getCurrentTimeline().currentScroll;
    for(var i = 1; i < twtPosLength; i++) {
      if(currentTimelineScrolled > twtPositions[i]) {
        currentScrollOverTweet = i;
        continue;
      } else {
        break;
      }
    }
    if(currentScrollOverTweet < twtPosLength - 1) {
      return twtPositions[currentScrollOverTweet + 1] + 1;
    } else {
      return twtPositions[twtPosLength - 1]
    }
  }
  return 0;
}

function scrollPrevTweet() {
  var twtPositions = currentTimelineTweetPositions, twtPosLength = twtPositions.length;
  if(twtPosLength > 0) {
    var currentScrollOverTweet = 0;
    var currentTimelineScrolled = tweetManager.getCurrentTimeline().currentScroll;
    for(var i = twtPosLength - 1; i > 0; i--) {
      if(currentTimelineScrolled <= twtPositions[i] + 1) {
        currentScrollOverTweet = i;
        continue;
      } else {
        break;
      }
    }
    if(currentScrollOverTweet > 0) {
      var ret = twtPositions[currentScrollOverTweet - 1];
      return (ret > 0)? ret + 1: 0;
    }
  }
  return 0;
}

function chromeContextMenusInit() {
  chrome.contextMenus.remove('searchInSilverbirdM', function() {
    chrome.contextMenus.create({
      type: 'normal',
      id: 'searchInSilverbirdM',
      title: chrome.i18n.getMessage("c_search_on_silverbird_m"),
      contexts: ["selection"],
      onclick: function(info, tab) {
        if(info.selectionText && info.selectionText.length > 0) {
          TimelineTab.addNewSearchTab(info.selectionText);
        }
      },
      documentUrlPatterns: ['chrome-extension://' + chrome.runtime.id + '/*']
    }, function() {
      // no behavior
    });
  });
}

function warningsCallback(msg, showHTML) {
  if(!window) {
    return;
  }
  Renderer.warningsCallback.call(Renderer, msg, false, showHTML);
}

function displayStreamingCallback(connect) {
  if(!window) {
    return;
  }
  if(typeof connect === 'undefined') {
    $('#stream_trigger').remove();
    return;
  }
  if(connect) {
    $('#stream_status').attr({
      src: './img/stream_connected.png',
      title: chrome.i18n.getMessage('stream_connected')
    });
  } else {
    $('#stream_status').attr({
      src: './img/stream_disconnected.png',
      title: chrome.i18n.getMessage('stream_disconnected')
    });
  }
}

function streamToggle() {
  var StreamListener = backgroundPage.StreamListener;
  var currentStatus = StreamListener.getStatus();  // will be boolean
  if(currentStatus) {
    StreamListener.disconnect(true);
  } else {
    StreamListener.start(twitterBackend);
  }
}

function initializeWorkspace() {
  tweetManager.registerPopupCallbacks({
    warnings: warningsCallback,
    newTweets: newTweetsAvailable,
    displayStreaming: displayStreamingCallback
  });
  $("#workspace").show();
  ThemeManager.init();

  if(ThemeManager.isPopup) {
    Renderer.setContext('popup');
  } else {
    Renderer.setContext('standalone');
  }

  TimelineTab.init();
  tweetManager.orderedEachTimeline(function(timeline) {
    switch(timeline.template.id) {
      case TimelineTemplate.SEARCH:
        SearchTab.addSearchTab(timeline.timelineId);
        break;
      case TimelineTemplate.LISTS:
        TimelineTab.addTab(timeline.timelineId, '<select id="' + timeline.timelineId + '-selector"></select>');
        break;
      default:
        TimelineTab.addTab(timeline.timelineId, timeline.template.timelineName);
        break;
    }
  });
  Lists.update();
  ThemeManager.handleSortableTabs();

  if(OptionsBackend.get('compose_position') == 'bottom') {
    var composeArea = $("#compose_tweet_area").detach();
    var composeButton = $("#compose_tweet").detach();
    $("#workspace").append(composeArea).append(composeButton);
  }

  //Delay loading, improving responsiveness
  setTimeout(function() {
    ThemeManager.handleWindowResizing();
    ContextMenu.init();
    ConfirmDialog.init();
    TimelineTab.select(tweetManager.currentTimelineId);
    Composer.init();
    Shortener.init();
    prepareAndLoadTimeline();
    TimelineTab.scroll(tweetManager.getCurrentTimeline().currentScroll);
    suspend(tweetManager.suspend);
    showRateLimit();
    WorkList.init();
    Autocomplete.init();
    loadTrends();
    loadSavedSearch();
    ImageUpload.init();
    chromeContextMenusInit();
  }, 0);
}

function windowOnUnload() {
  chrome.contextMenus.remove('searchInSilverbirdM', function() {
    // no behavior
  });
  if(AnyClick) {
    AnyClick.clearAllEventListeners();
  }
  if(tweetManager) {
    tweetManager.cleanupCachedData();
    tweetManager.unregisterPopupCallbacks();
    tweetManager.sendQueue.cleanUpCallbacks();
    tweetManager.eachTimeline(function(timeline) {
      timeline._cleanUpCache();
    }, true);
  }
  if(UploadManager) {
    UploadManager.unregisterCallbacks();
  }
}

var bindEvents = function() {
  $(window)
  .on('keyup', function(ev) {
    if(OptionsBackend.get('use_keyboard_shortcuts')) {
      handleKeyboardShortcuts(ev);
    } else {
      $(this).off('keyup');
    }
  });
  $(document)
  .on('click', '.msg-trigger-reload', function(ev) {
    ev.preventDefault();
    chrome.runtime.reload()
  })
  .on('click', '.msg-trigger-openoptions', function(ev) {
    ev.preventDefault();
    chrome.tabs.create({
      url: chrome.extension.getURL('options.html')
    });
  });
  $("#warning .dismiss").click(Renderer.hideMessage.bind(Renderer));
  $("#signout").click(function(ev) {
    ev.preventDefault();
    signout();
  });
  $("#refresh_trigger").click(function(ev) {
    ev.preventDefault();
    Composer.refreshNew();
  });
  $("#suspend_toggle").click(function(ev) {
    ev.preventDefault();
    suspend();
  });
  $("#stream_trigger").click(function(ev) {
    ev.preventDefault();
    streamToggle();
  });
  $("#detach_trigger").click(function(ev) {
    ev.preventDefault();
    Renderer.detach();
  });
  $("#twitter_link").click(function(ev) {
    ev.preventDefault();
    var openUrl = 'https://twitter.com/';
    chrome.tabs.create({
      url: openUrl,
      selected: true
    });
  });
  $("#update_tweets").click(loadNewTweets);
  $("#btnAuthorize").click(myOAuth.registerPin.bind(myOAuth));
  $("#enter_pin").find("a").click(function(ev) {
    ev.preventDefault();
    myOAuth.requestNewToken();
  });
  Composer.bindEvents();
  WorkList.bindEvents();
};

$(function() {
  bindEvents();
  $('.i18n').each(function() {
    if(this.title) {
      this.setAttribute('title', chrome.i18n.getMessage(this.id));
    } else if(this.value) {
      this.setAttribute('value', chrome.i18n.getMessage(this.id));
    } else {
      this.textContent = chrome.i18n.getMessage(this.id);
    }
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
  if(tweetManager.ready) {
    initializeWorkspace();
  } else {
    alert(chrome.i18n.getMessage("a_initialization_is_not_finished"));
    window.close();
  }
});
