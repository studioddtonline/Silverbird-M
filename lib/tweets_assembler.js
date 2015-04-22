var TwitterLib = {
  URLS: {
    BASE: 'https://twitter.com/',
    SEARCH: 'https://twitter.com/search?q='
  }
};

var Renderer = {
  setContext: function(ctx) {
    this.context = ctx;
  },

  isDesktop: function() {
    return this.context == 'desktop';
  },

  isComplete: function() {
    return this.context == 'popup' || this.context == 'standalone';
  },

  isStandalone: function() {
    return this.context == 'standalone';
  },

  isNotification: function() {
    return this.context == 'desktop';
  },

  getTimestampText: function (inputTimestamp, now) {
    var diff = (now - inputTimestamp) * 0.001 | 0;

    if(diff < 15) {
      return chrome.i18n.getMessage("justNow");
    } else if(diff < 60) {
      return chrome.i18n.getMessage("minuteAgo");
    } else if(diff < 60 * 60) {
      var minutes = parseInt(diff / 60, 10);
      var minute_string = minutes > 1 ? "minute_plural" : "minute_singular";
      return chrome.i18n.getMessage('minutes', [minutes, chrome.i18n.getMessage(minute_string)]);
    } else if(diff < 60 * 60 * 24) {
      var hours = parseInt(diff / (60 * 60), 10);
      var hour_string = hours > 1 ? "hour_plural" : "hour_singular";
      return chrome.i18n.getMessage("timeAgo", [hours, chrome.i18n.getMessage(hour_string)]);
    } else if(diff < 60 * 60 * 24 * 30) {
      var days = parseInt(diff / (60 * 60 * 24), 10);
      var day_string = days > 1 ? "day_plural" : "day_singular";
      return chrome.i18n.getMessage("timeAgo", [days, chrome.i18n.getMessage(day_string)]);
    } else if(diff < 60 * 60 * 24 * 365) {
      var months = parseInt(diff / (60 * 60 * 24 * 30), 10);
      var month_string = months > 1 ? "month_plural" : "month_singular";
      return chrome.i18n.getMessage("timeAgo", [months, chrome.i18n.getMessage(month_string)]);
    } else {
      var years = parseInt(diff / (60 * 60 * 24 * 365), 10);
      var years_string = years > 1 ? "year_plural" : "year_singular";
      return chrome.i18n.getMessage("timeAgo", [years, chrome.i18n.getMessage(years_string)]);
    }
  },

  getTimestampAltText: function (inputTimestamp) {
    return `${new Date(inputTimestamp).toLocaleDateString()} ${new Date(inputTimestamp).toLocaleTimeString()}`;
  },

  entitiesFuncs: {
    typeMap: function(type) {
      return function(e) {e.type = type; return e;};
    },
    indexSort: function(e1, e2) {
      return e1.indices[0] - e2.indices[0];
    }
  },

  entitiesRegexp: {
    quoteTweet: new RegExp('^https?://twitter.com/[a-z0-9_]{1,15}?/status/(\\d+)$', 'i'),
    matchNormal: new RegExp('_normal\.(jpe?g|gif|png|bmp|tiff)$', 'i')
  },

  parseEntities: function(text, entities, extended_entities, tweetspaceId) {
    "use strict";
    let textArray = [];
    for(let s of text) {
      textArray.push(s);
    }
    for(let i in entities) {
      for(let j of entities[i].entries()) {
        let v = j[1];
        if(!v.indices) {
          continue;
        }
        let insertStrings = textArray.slice(v.indices[0], v.indices[1]).join('');
        let exEntities = extended_entities.media || [];
        let quoteRegexp = this.entitiesRegexp.quoteTweet;
        if(i === 'user_mentions') {
          insertStrings = `@<a href="#" class="createUserActionMenu" data-user-id="${v.id_str}" data-user-name="${v.screen_name}">${v.screen_name}</a>`;
        } else if(i === 'hashtags') {
          insertStrings = `<a href="#" class="handleHashTag" data-handle-hash-tag="${insertStrings}">${insertStrings}</a>`;
        } else if(i === "media" && exEntities.length > 1) {
          insertStrings = `<a href="${v.url}" class="handleLink" data-handle-link-noexpand="true" data-handle-link-base="${v.expanded_url}" data-handle-link-expanded="undefined" data-handle-link-media="undefined">${v.display_url}</a> ${exEntities.map(function(value, index) {
            return `<a href="${value.url}" class="handleLink" data-handle-link-base="${value.url}" data-handle-link-expanded="${value.expanded_url}" data-handle-link-media="${value.media_url_https}" title="${v.expanded_url}">[${(index + 1)}]</a>`;
          }).join(' ')}`;
        } else if(i === 'urls' && quoteRegexp.test(v.expanded_url)) {
          let quotedTweetEntity = escape(JSON.stringify({"in_reply_to_status_id": quoteRegexp.exec(v.expanded_url)[1] || ""}));
          insertStrings = `<span><span class="glyphicon glyphicon-link"></span><a href="${v.url}" class="expandInReply" data-handle-link-base="${v.url}" data-handle-link-expanded="${v.expanded_url}" data-handle-link-media="${v.media_url_https}" data-expand-in-reply-tweet="${quotedTweetEntity}" data-expand-in-reply-id="${tweetspaceId}" title="${chrome.i18n.getMessage("expand_quote_tweet")}">${v.display_url}</a></span>`;
        } else if(i === 'urls' || i === 'media') {
          insertStrings = `<a href="${v.url}" class="handleLink" data-handle-link-base="${v.url}" data-handle-link-expanded="${v.expanded_url}" data-handle-link-media="${v.media_url_https}" title="${v.expanded_url}">${v.display_url}</a>`;
        } else if(i === 'symbols') {
          insertStrings = v.text;
        }
        for(let k = v.indices[0]; k < v.indices[1]; k++) {
          if(k == v.indices[0]) {
            textArray[k] = insertStrings;
          } else {
            textArray[k] = '';
          }
        }
      }
    }
    return textArray.join('').replace(/\r?\n/, '<br />');
  },

  renderTweet: function (tweet, now, useColors) {
    var user = tweet.user;
    var text = tweet.text;
    var tweetId = tweet.id;
    var entities = tweet.entities;
    var extended_entities = tweet.extended_entities || {};
    var selfTweet = (tweet.user.id_str == tweetManager.twitterBackend.userid());
    if(tweet.retweeted_status) {
      user = tweet.retweeted_status.user;
      text = tweet.retweeted_status.text;
      tweetId = tweet.retweeted_status.id;
      if(tweet.retweeted_status.in_reply_to_status_id) {
        tweet.in_reply_to_status_id = tweet.retweeted_status.in_reply_to_status_id;
        tweet.in_reply_to_screen_name = tweet.retweeted_status.in_reply_to_screen_name;
      }
      entities = tweet.retweeted_status.entities;
      extended_entities = tweet.retweeted_status.extended_entities || {};
      if(selfTweet && !tweetManager.isRetweet(tweet)) {
        tweetManager.retweetsMap.set(tweetId, tweet.id);
      }
    }
    var tweetspaceId = `id${now}${tweet.id}`;
    var tweetTimeline = tweet.originalTimelineId || tweet.timelineId || tweetManager.currentTimelineId || 'home';
    var templateId = tweetTimeline.replace(/_.*$/, '');

    // Twitter Display Requirements Options
    var compliantTDR, hiddenUserIcons, nameAttribute, displaySimpleName, hiddenFooter, hiddenTimestamp, 
        hiddenReplyInfo, hiddenRetweetInfo, hiddenClientName, hiddenDMInfo, hiddenGeoInfo, hiddenListInfo;
    if(typeof OptionsBackend === 'undefined' || OptionsBackend.get('compliant_twitter_display_requirements')) {
      compliantTDR = true;
      hiddenUserIcons = false;
      nameAttribute = 'both';
      displaySimpleName = false;
      hiddenFooter = false;
      hiddenTimestamp = false;
      hiddenReplyInfo = false;
      hiddenRetweetInfo = false;
      hiddenClientName = false;
      hiddenDMInfo = false;
      hiddenGeoInfo = false;
      hiddenListInfo = false;
    } else {
      compliantTDR = false;
      hiddenUserIcons = OptionsBackend.get('hidden_user_icons');
      nameAttribute = OptionsBackend.get('name_attribute');
      displaySimpleName = OptionsBackend.get('display_simple_name');
      hiddenFooter = OptionsBackend.get('hidden_footer');
      hiddenTimestamp = OptionsBackend.get('hidden_timestamp');
      hiddenReplyInfo = OptionsBackend.get('hidden_reply_info');
      hiddenRetweetInfo = OptionsBackend.get('hidden_retweet_info');
      hiddenClientName = OptionsBackend.get('hidden_client_name');
      hiddenDMInfo = OptionsBackend.get('hidden_dm_info');
      hiddenGeoInfo = OptionsBackend.get('hidden_geo_info');
      hiddenListInfo = OptionsBackend.get('hidden_list_info');
    }

    // tweet space
    var timestamp_content, timestamp_url = '', timestamp_option = '',
        overlayStyle = '', profile_container = '', header_container = '', userNameHref = 'href="#"',
        userVerified = '', userProtected = '', bothContent = '</div><div class="secondary_name">',
        text_container = '', footer_content = '', footer_container = '', newActions_container = '';

    // profile_container
    if(!hiddenUserIcons) {
      var profileIconSize, profileIconStyle, replaceRegExp = this.entitiesRegexp.matchNormal, tweetIconUrl, retweeterIconUrl;
      switch(OptionsBackend.get('icon_size')) {
        case 'icon_small':
          profileIconSize = '_mini';
          profileIconStyle = 'icon_small'; // 24px
          break;
        case 'icon_large':
          profileIconSize = '_bigger';
          profileIconStyle = 'icon_large'; // 73px
          break;
        case 'icon_max':
          profileIconSize = '';
          profileIconStyle = 'icon_max'; // 128px
          break;
        case 'icon_normal':
        default:
          profileIconSize = '_normal';
          profileIconStyle = 'icon_normal'; // 48px
          break;
      }
      if(tweet.retweeted_status) {
        tweetIconUrl = user.profile_image_url.replace(replaceRegExp, profileIconSize + '.$1');
        retweeterIconUrl = tweet.user.profile_image_url.replace(replaceRegExp, profileIconSize + '.$1');
        profile_container = `<div class="profile_container"><img data-user-id="${user.id_str}" data-user-name="${user.screen_name}" class="createUserActionMenu profile retweet_source ${profileIconStyle}" src="${tweetIconUrl}"/><img data-user-id="${tweet.user.id_str}" data-user-name="${tweet.user.screen_name}" class="createUserActionMenu profile retweet_retweeter ${profileIconStyle}" src="${retweeterIconUrl}"/></div>`;
      } else {
        tweetIconUrl = user.profile_image_url.replace(replaceRegExp, profileIconSize + '.$1');
        profile_container = `<div class="profile_container"><img data-user-id="${user.id_str}" data-user-name="${user.screen_name}" class="createUserActionMenu profile ${profileIconStyle}" src="${tweetIconUrl}" /></div>`;
      }
    }

    // header_container
    if(user.verified && !displaySimpleName) {
      userVerified = `<span class="glyphicon glyphicon-check" title="${chrome.i18n.getMessage('verified_account')}"></span>`;
    }
    if(user['protected'] && !displaySimpleName) {
      userProtected = `<span class="glyphicon glyphicon-lock" title="${chrome.i18n.getMessage('protected_account')}"></span>`;
    }
    if(nameAttribute == "both") {
      if(displaySimpleName) bothContent = '';
      header_container = `<div class="header_container"><div class="primary_name"><a ${userNameHref} data-user-id="${user.id_str}" data-user-name="${user.screen_name}" class="createUserActionMenu user" screen_name="${user.screen_name}">${user.name}</a>${userVerified}${userProtected}${bothContent}<a ${userNameHref} data-user-id="${user.id_str}" data-user-name="${user.screen_name}" class="createUserActionMenu user" screen_name="${user.screen_name}">@${user.screen_name}</a></div></div>`;
    } else if(nameAttribute == "screen_name") {
      header_container = `<div class="header_container"><div class="primary_name"><a ${userNameHref} data-user-id="${user.id_str}" data-user-name="${user.screen_name}" class="createUserActionMenu user" screen_name="${user.screen_name}" title="${user.name}">@${user.screen_name}</a>${userVerified}${userProtected}</div></div>`;
    } else if(nameAttribute == "name") {
      header_container = `<div class="header_container"><div class="primary_name"><a ${userNameHref} data-user-id="${user.id_str}" data-user-name="${user.screen_name}" class="createUserActionMenu user" screen_name="${user.screen_name}" title="@${user.screen_name}">${user.name}</a>${userVerified}${userProtected}</div></div>`;
    }

    // text_container
    text_container = `<div class="text_container">${this.parseEntities(text, entities, extended_entities, tweetspaceId)}</div>`;

    // footer_container
    if(this.isComplete() && !hiddenFooter) {
      // timestamp
      if(!hiddenTimestamp) {
        var parsedTime = Date.parse(tweet.created_at);
        timestamp_url = `${TwitterLib.URLS.BASE}${user.screen_name}/status/${tweetId}`;
        footer_content += `<span class="timestamp"><a class="handleLink" data-handle-link-noexpand="true" data-handle-link-base="${timestamp_url}" title="${Renderer.getTimestampAltText(parsedTime)}" href="${timestamp_url}">${Renderer.getTimestampText(parsedTime, now)}</a></span>`;
      }
      // reply
      if(!hiddenReplyInfo && tweet.in_reply_to_status_id) {
        footer_content += `<span class="inReply">${chrome.i18n.getMessage("inReply_prefix")}<a class="expandInReply" data-expand-in-reply-tweet="${escape(JSON.stringify({"in_reply_to_status_id": tweet.in_reply_to_status_id}))}" data-expand-in-reply-id="${tweetspaceId}" href="#">${tweet.in_reply_to_screen_name}</a>${chrome.i18n.getMessage("inReply_suffix")}</span>`;
      }
      // retweet
      if(!hiddenRetweetInfo && tweet.retweeted_status) {
        if(selfTweet) {
          footer_content += `<span class="selfRetweet"><span class="glyphicon glyphicon-retweet"></span>${chrome.i18n.getMessage("retweetedByMe")}`;
        } else {
          footer_content += `<span class="inRetweet"><span class="glyphicon glyphicon-retweet"></span>${chrome.i18n.getMessage("retweetedBy_prefix")}<a href="${TwitterLib.URLS.BASE}${tweet.user.screen_name}" data-user-id="${tweet.user.id_str}" data-user-name="${tweet.user.screen_name}" class="createUserActionMenu">${tweet.user.screen_name}</a>${chrome.i18n.getMessage("retweetedBy_suffix")}`;
        }
        if(tweet.retweet_count > 0) {
          footer_content += ` (${chrome.i18n.getMessage("retweetedCount_prefix")}${tweet.retweet_count}${chrome.i18n.getMessage("retweetedCount_suffix")})</span>`;
        }
      }
      // from App
      if(!hiddenClientName && tweet.source) {
        footer_content += `<span class="from_app">${chrome.i18n.getMessage("fromApp_prefix")}${tweet.source.replace(/href=/i, 'class="handleLink" href="#" data-handle-link-noexpand="true" data-handle-link-base=')}${chrome.i18n.getMessage("fromApp_suffix")}</span>`;
      }
      // DM
      if(!hiddenDMInfo && templateId == TimelineTemplate.SENT_DMS) {
        footer_content += `<span class="dm_recipient">${chrome.i18n.getMessage("sentTo_prefix")}<a href="#" data-user-id="${tweet.recipient.id_str}" data-user-name="${tweet.recipient.screen_name}" class="createUserActionMenu">${tweet.recipient.name}</a>${chrome.i18n.getMessage("sentTo_suffix")}</span>`;
      }
      // geo
      if(!hiddenGeoInfo && tweet.geo) {
        var coords = tweet.geo.coordinates;
        if(typeof coords[0] != 'number') {
          coords[0] = 0.0;
        }
        if(typeof coords[1] != 'number') {
          coords[1] = 0.0;
        }
        var latStr = `${coords[0]},${coords[1]}`;
        var mapParam = $.param({center: latStr, zoom: 15, size: '200x200', maptype: 'roadmap', markers: 'size:small|' + latStr, sensor: false});
        footer_content += `<span class="geo_tag"><a class="handleLink tooltip" data-handle-link-base="http://maps.google.com/maps?q=loc:${latStr}" data-tooltip-content="<img src=\'http://maps.google.com/maps/api/staticmap?${mapParam}\' />" href="#"><span class="glyphicon glyphicon-map-marker"></span></a></span>`;
      }
      // from list
      if(!hiddenListInfo && templateId == TimelineTemplate.LISTS && tweetManager.currentTimelineId != tweetTimeline) {
        var list = tweetManager.getList(tweetTimeline);
        if(list !== null) {
          var linkPath = list.uri.substr(1);
          footer_content += `<span class="from_list">(${chrome.i18n.getMessage("f_footer_list")}: <a class="handleLink" data-handle-link-noexpand="true" data-handle-link-base="${TwitterLib.URLS.BASE}${linkPath}" href="#" title="@${linkPath}">${list.name}</a>)</span>`;
        }
      }
    }
    if(!hiddenFooter) {
      footer_container = `<div class="footer_container">${footer_content}</div>`;
    }

    // new_actions
    if(this.isComplete() && !/^Notification/.test(tweet.id)) {
      var hereIsDM = (templateId == TimelineTemplate.RECEIVED_DMS) || (templateId == TimelineTemplate.SENT_DMS) || false;
      newActions_container = '<div class="new_actions">';
      if(!hereIsDM) {
        if(tweet.favorited) {
          newActions_container += `<span class="glyphicon glyphicon-star new_actions_item action_unfavorite" title="${chrome.i18n.getMessage('unmarkFavorite')}" data-favorite-target-id="${tweetId}"></span>`;
        } else {
          newActions_container += `<span class="glyphicon glyphicon-star-empty new_actions_item action_favorite" title="${chrome.i18n.getMessage('markFavorite')}" data-favorite-target-id="${tweetId}"></span>`;
        }
      }
      if(selfTweet) {
        var titleStrig;
        if(tweet.retweeted_status) {
          titleString = chrome.i18n.getMessage("deleteRT");
        } else {
          titleString = chrome.i18n.getMessage("Delete");
        }
        newActions_container += `<span class="glyphicon glyphicon-trash new_actions_item action_delete_tweet" title="${titleString}" data-delete-target-id="${tweet.id}" data-timeline-id="${tweetTimeline}"></span>`;
        if(!hereIsDM) {
          newActions_container += `<span class="glyphicon glyphicon-comment new_actions_item action_quote" title="${chrome.i18n.getMessage("quoteTweet")}" data-quote-tweet-url="${timestamp_url}"></span>`;
        }
      } else {
        newActions_container += `<span class="glyphicon glyphicon-reply new_actions_item action_reply" title="${chrome.i18n.getMessage("Reply")}" data-reply-target-id="${tweetId}" data-reply-target-name="${user.screen_name}" data-reply-to-dm="${hereIsDM}"></span>`;
        if(tweetManager.isRetweet(tweet)) {
          newActions_container += `<span class="glyphicon glyphicon-remove-circle new_actions_item action_cancel_retweet" title="${chrome.i18n.getMessage("deleteRT")}" data-delete-target-id="${tweet.id}" data-timeline-id="${tweetTimeline}"></span>`;
        } else {
          if(!hereIsDM && !user['protected']) {
            newActions_container += `<span class="glyphicon glyphicon-retweet new_actions_item action_retweet" title="${chrome.i18n.getMessage("Retweet")}" data-retweet-target-id="${tweetId}"></span>`;
          }
        }
        if(!hereIsDM && !user['protected']) {
          newActions_container += `<span class="glyphicon glyphicon-comment new_actions_item action_quote" title="${chrome.i18n.getMessage("quoteTweet")}" data-quote-tweet-url="${timestamp_url}"></span>`;
        }
        if(!tweet.retweeted_status && (user['allow_dms_from'] === 'everyone' || tweetManager.getFollowersIdsSet().has(user['id_str']))) {
          newActions_container += `<span class="glyphicon glyphicon-envelope new_actions_item action_message" title="${chrome.i18n.getMessage("directMessage")}" data-message-target-name="${user.screen_name}"></span>`;
        }
      }
      newActions_container += '</div>';
    }

    // build tweetSpace
    if(this.isComplete()) {
      if(useColors) overlayStyle = `background-color: ${TimelineTemplate.getTemplate(templateId).overlayColor};`;
    }
    return `<div class="tweet_space" id="${tweetspaceId}"><div class="chromed_bird_tweet tweet" timelineid="${tweetTimeline}" tweetid="${tweet.id}"><div class="tweet_overlay" style="${overlayStyle}"><div class="first_container">${profile_container}${header_container}${text_container}${footer_container}</div>${newActions_container}</div></div></div>`;
  }
};

function openTab(tabUrl) {
  var background = false;
  if(event) {
    if(event.button == 2) {
      return true;
    }
    if(event.button == 1 || event.metaKey || event.ctrlKey) {
      background = true;
    }
  }
  if(!(/^https?:\/\//.test(tabUrl))
  && !(/^chrome-extension:\/\//.test(tabUrl))) {
    tabUrl = "http://" + tabUrl;
  }
  tabUrl.replace(/\W.*$/, "");
  if(!background) {
    var obj = chrome.tabs.create({
      url: tabUrl,
      selected: !background
    });
    if(background && obj) {
      obj.blur();
    }
  } else {
    chrome.tabs.create({
      url: tabUrl,
      selected: !background
    });
  }
  return true;
}
