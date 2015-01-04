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
  AnyClick.clearEventListeners();
  tweetManager.urlExpander.clear();
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
      errorMsg = chrome.i18n.getMessage('exceededAPIHits');
      tryAgainFunc = null;
    } else if(baseErrorMsg == '(This user is protected)') {
      errorMsg = chrome.i18n.getMessage("ue_unauthorized_user");
      tryAgainFunc = null;
    } else if(baseErrorMsg == '(Could not authenticate you)') {
      errorMsg = chrome.i18n.getMessage("ue_updatingTweets_noauthenticate");
      tryAgainFunc = null;
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
  window.close();
}

function suspend(forcedValue) {
  var suspendState = tweetManager.suspendTimelines(forcedValue);
  if(suspendState) {
    $('#suspend_status').attr({
      src: './img/timeline_suspended.png',
      title: chrome.i18n.getMessage("timeline_suspended")
    });
  } else {
    $('#suspend_status').attr({
      src: './img/timeline_running.png',
      title: chrome.i18n.getMessage("timeline_running")
    });
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
      name: chrome.i18n.getMessage("ue_wait_fetch_trends"),
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
        chrome.runtime.reload();
        break;
      default:
        break;
    }
  } else if(event.ctrlKey) {
    switch(event.keyCode) {
      case 81:  // q
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

function displayStreamingStatus() {
  var state = tweetManager.streamingStatus;
  if(state == 'disallow' || typeof state === 'undefined') {
    $('#stream_trigger').remove();
    return;
  }
  if(state == 'connect') {
    $('#stream_status').attr({
      src: './img/stream_connected.png',
      title: chrome.i18n.getMessage('stream_connected'),
      "data-status": 'connect'
    });
  } else {
    $('#stream_status').attr({
      src: './img/stream_disconnected.png',
      title: chrome.i18n.getMessage('stream_disconnected'),
      "data-status": state
    });
  }
}

function tweetManagerObserver(changes) {
  changes.forEach(function(change) {
    switch(change.name) {
      case 'cachedTrendingTopics':
        loadTrends();
        break;
      case 'listsCache':
        Lists.update();
        break;
      case 'savedSearchCache':
        loadSavedSearch();
        break;
      case 'streamingStatus':
        displayStreamingStatus();
        break;
      case 'warningMessage':
      case 'warningMessageHTML':
        if(!window) return;
        if(tweetManager.warningMessage || tweetManager.warningMessageHTML) {
          Renderer.warningsCallback.call(Renderer, tweetManager.warningMessage, false, tweetManager.warningMessageHTML);
        } else {
          Renderer.hideMessage.call(Renderer);
        }
        break;
      default:
        break;
    }
  });
}

function initializeWorkspace() {
  suspend(tweetManager.suspend);
  Object.observe(tweetManager, tweetManagerObserver);
  tweetManager.registerPopupCallbacks({
    newTweets: newTweetsAvailable
  });
  $("#workspace").show();
  ThemeManager.init();

  if(ThemeManager.isPopup) {
    Renderer.setContext('popup');
  } else {
    Renderer.setContext('standalone');
  }

  bindEvents();
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
    WorkList.init();
    Autocomplete.init();
    chromeContextMenusInit();
    loadTrends();
    loadSavedSearch();
    displayStreamingStatus();
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
    tweetManager.urlExpander.clear();
    tweetManager.sendQueue.cleanUpCallbacks();
    tweetManager.eachTimeline(function(timeline) {
      timeline._cleanUpCache();
    }, true);
    Object.unobserve(tweetManager, tweetManagerObserver);
  }
  $(document).off('.popup');
  $(window).off('.popup');
  if(backgroundPage) {
    backgroundPage = null;
  }
}

function bindEvents() {
  $(window)
  .on({
    'keyup.popup': function(event) {
      if(OptionsBackend.get('use_keyboard_shortcuts')) {
        handleKeyboardShortcuts(event);
      } else {
        $(this).off(event.type);
      }
    },
//    'blur.popup': windowOnUnload,
    'beforeunload.popup': windowOnUnload
  });
  $(document)
  .on('click.popup', '#options_page_link', function(event) {
    event.preventDefault();
    chrome.tabs.create({
      url: chrome.extension.getURL('options.html')
    });
  })
  .on('click.popup', '#warning .dismiss', Renderer.hideMessage.bind(Renderer))
  .on('click.popup', '#signout', function(event) {
    event.preventDefault();
    signout();
  })
  .on('click.popup', '#refresh_trigger', function(event) {
    event.preventDefault();
    Composer.refreshNew();
  })
  .on('click.popup', '#suspend_trigger', function(event) {
    event.preventDefault();
    suspend();
  })
  .on('click.popup', '#stream_trigger', function(event) {
    event.preventDefault();
    var state = event.target.dataset.status;
    switch(state) {
      case 'connect':
        tweetManager.disconnectStreaming();
        break;
      case 'disconnect':
        tweetManager.connectStreaming();
        break;
      case 'initializing':
      case 'disallow':
      default:
        break;
    }
  })
  .on('click.popup', '#detach_trigger', function(event) {
    event.preventDefault();
    Renderer.detach();
  })
  .on('click.popup', '#twitter_link', function(event) {
    event.preventDefault();
    var openUrl = 'https://twitter.com/';
    chrome.tabs.create({
      url: openUrl,
      selected: true
    });
  })
  .on('click.popup', '#update_tweets', loadNewTweets);
  Composer.bindEvents();
};

function doLocalization() {
  $('.i18n').each(function() {
    if(this.title) {
      this.setAttribute('title', chrome.i18n.getMessage(this.id));
    } else if(this.value) {
      this.setAttribute('value', chrome.i18n.getMessage(this.id));
    } else {
      this.textContent = chrome.i18n.getMessage(this.id);
    }
  });
}

$(function() {
  if(!backgroundPage.SecretKeys.hasValidKeys()) {
    Renderer.showError(chrome.i18n.getMessage('invalid_keys'));
    $("#workspace").show().height(300);
    ThemeManager.init();
    return;
  }
  if(!twitterBackend.authenticated()) {
    if(twitterBackend.tokenRequested()) {
      $(document.createElement('link'))
      .attr({
        rel: 'import',
        id: 'importEnterPin',
        href: './template/enterpin.html'
      })
      .on({
        'load.enterpin': function(event) {
          $(document.body)
          .append(event.target.import.querySelector('#templateEnterPin').content)
          .on('click.enterpin', '#btnAuthorize', myOAuth.registerPin.bind(myOAuth))
          .on('click.enterpin', '#enter_pin a', function(event) {
            event.preventDefault();
            myOAuth.requestNewToken();
          });
          doLocalization();
        },
        'error.enterpin': function(event) {
          console.warn('HTML Imports Error');
        }
      })
      .appendTo(document.head);
    }
    return;
  }
  if(tweetManager.ready) {
    doLocalization();
    initializeWorkspace();
  } else {
    alert(chrome.i18n.getMessage("a_initialization_is_not_finished"));
    window.close();
  }
});
