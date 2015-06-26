var Renderer = {
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
    quoteTweet: new RegExp('^https?://twitter.com/[\\w\\d_]{1,15}/statuse?s?/(\\d+)[^\\d]*?$', 'i'),
    matchNormal: new RegExp('_normal\.(jpe?g|gif|png|bmp|tiff)$', 'i')
  },

  parseEntities: function(text, entities, extended_entities, quoted_status, tweetspaceId) {
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
          let quotedTweetId = quoteRegexp.exec(v.expanded_url)[1] || "";
          let quotedTweetEntity = {"in_reply_to_status_id": quotedTweetId};
          if(quoted_status && quoted_status.id_str === quotedTweetId) {
            quotedTweetEntity.inReplyToTweet = quoted_status;
          }
          insertStrings = `<span><span class="glyphicon glyphicon-link"></span><a href="${v.url}" class="expandInReply" data-handle-link-base="${v.url}" data-handle-link-expanded="${v.expanded_url}" data-handle-link-media="${v.media_url_https}" data-expand-in-reply-tweet="${escape(JSON.stringify(quotedTweetEntity))}" data-expand-in-reply-id="${tweetspaceId}" title="${chrome.i18n.getMessage("expand_quote_tweet")}">${v.display_url}</a></span>`;
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
    var tweetId = tweet.id_str;
    var entities = tweet.entities;
    var extended_entities = tweet.extended_entities || {};
    var selfTweet = (tweet.user.id_str == tweetManager.twitterBackend.userid());
    var quoted_status = tweet.quoted_status || undefined;
    if(tweet.retweeted_status) {
      user = tweet.retweeted_status.user;
      text = tweet.retweeted_status.text;
      tweetId = tweet.retweeted_status.id_str;
      if(tweet.retweeted_status.in_reply_to_status_id) {
        tweet.in_reply_to_status_id = tweet.retweeted_status.in_reply_to_status_id;
        tweet.in_reply_to_screen_name = tweet.retweeted_status.in_reply_to_screen_name;
      }
      entities = tweet.retweeted_status.entities;
      extended_entities = tweet.retweeted_status.extended_entities || {};
      if(selfTweet && !tweetManager.isRetweet(tweet)) {
        tweetManager.retweetsMap.set(tweetId, tweet.id_str);
      }
    }
    var tweetspaceId = `id${now}${tweet.id_str}`;
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
    text_container = `<div class="text_container">${this.parseEntities(text, entities, extended_entities, quoted_status, tweetspaceId)}</div>`;

    // footer_container
    if(!hiddenFooter) {
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
    if(!/^Notification/.test(tweet.id_str)) {
      var hereIsDM = (templateId == TimelineTemplate.RECEIVED_DMS) || (templateId == TimelineTemplate.SENT_DMS) || false;
      newActions_container = '<div class="new_actions">';
      if(!hereIsDM) {
        if(tweet.favorited) {
          newActions_container += `<span class="glyphicon glyphicon-star new_actions_item action_unfavorite" title="${chrome.i18n.getMessage('unmarkFavorite')}" data-favorite-target-id="${tweetId}"></span>`;
        } else {
          newActions_container += `<span class="glyphicon glyphicon-star-empty new_actions_item action_favorite" title="${chrome.i18n.getMessage('markFavorite')}" data-favorite-target-id="${tweetId}"></span>`;
        }
      }
      if(!hereIsDM || !selfTweet) {
        newActions_container += `<span class="glyphicon glyphicon-reply new_actions_item action_reply" title="${chrome.i18n.getMessage("Reply")}" data-reply-target-id="${tweetId}" data-reply-target-name="${user.screen_name}" data-reply-to-dm="${hereIsDM}"></span>`;
      }
      if(selfTweet) {
        var titleStrig;
        if(tweet.retweeted_status) {
          titleString = chrome.i18n.getMessage("deleteRT");
        } else {
          titleString = chrome.i18n.getMessage("Delete");
        }
        newActions_container += `<span class="glyphicon glyphicon-trash new_actions_item action_delete_tweet" title="${titleString}" data-delete-target-id="${tweet.id_str}" data-timeline-id="${tweetTimeline}"></span>`;
        if(!hereIsDM) {
          newActions_container += `<span class="glyphicon glyphicon-comment new_actions_item action_quote" title="${chrome.i18n.getMessage("quoteTweet")}" data-quote-tweet-url="${timestamp_url}"></span>`;
        }
      } else {
        if(tweetManager.isRetweet(tweet)) {
          newActions_container += `<span class="glyphicon glyphicon-remove-circle new_actions_item action_cancel_retweet" title="${chrome.i18n.getMessage("deleteRT")}" data-delete-target-id="${tweet.id_str}" data-timeline-id="${tweetTimeline}"></span>`;
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
    if(useColors) {
      overlayStyle = ` style="background-color: ${TimelineTemplate.getTemplate(templateId).overlayColor};"`;
    }
    return `<div class="tweet_space" id="${tweetspaceId}"><div class="chromed_bird_tweet tweet" timelineid="${tweetTimeline}" tweetid="${tweet.id_str}"><div class="tweet_overlay"${overlayStyle}><div class="first_container">${profile_container}${header_container}${text_container}${footer_container}</div>${newActions_container}</div></div></div>`;
  },

  assemblyTweets: function (tweets, timelineId) {
    var destination = $("#timeline-" + timelineId).find(".inner_timeline");
    if(destination.length === 0) {
      destination = null;
      return;
    }
    var renderdText = '', pNow = performance.now(), dNow = Date.now(), isSkipBM = false, isSkipRT = false, tId = timelineId.split('_')[0], tmB = undefined, tmM = undefined;
    if((tId === TimelineTemplate.LISTS && OptionsBackend.get('lists_exclude_blocked_muted'))
    || (tId === TimelineTemplate.SEARCH && OptionsBackend.get('search_exclude_blocked_muted'))) {
      isSkipBM = true;
      tmB = tweetManager.getBlockedIdsSet();
      tmM = tweetManager.getMutingIdsSet();
    }
    if(tId === TimelineTemplate.SEARCH && OptionsBackend.get('search_exclude_retweet')) {
      isSkipRT = true;
    }
    for(var entry of tweets.entries()) {
      var tweetOwner = entry[1].user.id_str, rtOwner = entry[1].retweeted_status ? entry[1].retweeted_status.user.id_str : undefined;
      if(isSkipBM
      && (tmB.has(tweetOwner) || tmM.has(tweetOwner) || tmB.has(rtOwner) || tmM.has(rtOwner))
      ) {
        // skip rendering
      } else if(isSkipRT && entry[1].retweeted_status) {
        // skip rendering
      } else {
        renderdText += Renderer.renderTweet(entry[1], dNow, true);
      }
      tweetManager.readTweet(entry[1].id_str);
    }

    destination
    .empty()
    .html($.parseHTML(renderdText))
    .find('.handleLink')
    .each(Renderer.handleLinkEachFunc)
    .end()
    .on('mouseover.popup mouseout.popup', '.tweet', function(event) {
      var $this = $(this);
      if(event.type == 'mouseover') {
        if(!this.dataset.processed) {
          $this
          .find('.createUserActionMenu')
          .each(Renderer.createUserActionMenu)
          .end()
          .find('.handleHashTag')
          .each(Renderer.handleHashTagFunc)
          .end()
          .removeClass('createUserActionMenu handleHashTag')
          .find('[data-tooltip-do-expand]')
          .each(Renderer.handleLinkForExpand)
          .end()
          .attr('data-processed', true);
        }
        $this
        .find('.expandInReply')
        .each(Renderer.expandInReplyFunc)
        .end()
        .find('.new_actions')
        .css('max-height', `${$this.height()}px`)
        .end()
        .find('.new_actions_item')
        .off('.new_actions')
        .on('click.new_actions', function(event) {
          event.preventDefault();
          var cl = event.target.classList;
          switch(true) {
            case (cl.contains('action_favorite')):
              Composer.favorite(event.target.dataset.favoriteTargetId);
              break;
            case (cl.contains('action_unfavorite')):
              Composer.unFavorite(event.target.dataset.favoriteTargetId);
              break;
            case (cl.contains('action_retweet')):
              Composer.retweet(event.target.dataset.retweetTargetId);
              break;
            case (cl.contains('action_delete_tweet')):
              Composer.destroy(event.target.dataset.timelineId, event.target.dataset.deleteTargetId, false);
              break;
            case (cl.contains('action_cancel_retweet')):
              Composer.destroy(event.target.dataset.timelineId, event.target.dataset.deleteTargetId, true);
              break;
            case (cl.contains('action_reply')):
              if(event.target.dataset.replyToDm !== 'true') {
                Composer.reply(event.target.dataset.replyTargetId, event.target.dataset.replyTargetName);
              } else {
                Composer.message(event.target.dataset.replyTargetName);
              }
              break;
            case (cl.contains('action_quote')):
              Composer.quoteTweet(event.target.dataset.quoteTweetUrl);
              break;
            case (cl.contains('action_message')):
              Composer.message(event.target.dataset.messageTargetName);
              break;
            default:
              break;
          }
          cl = null;
        })
        .css('display', 'inline-block');
      } else {
        $this
        .find('.new_actions_item')
        .off('.new_actions')
        .not('.glyphicon-star')
        .css('display', 'none');
      }
    })
    .tooltip({
      items: '.tooltip',
      show: {delay: 500},
      content: function() {
        if(this.dataset.tooltipContent) {
          return this.dataset.tooltipContent;
        } else {
          return this.getAttribute('title') || this.textContent;
        }
      }
    });
    Renderer.adaptiveFetchSettings(performance.now() - pNow);
    renderdText = null;
    destination = null;
  },

  adaptiveFetchSettings: function(processTime) {
    if(isNaN(processTime)) return;
    var currentTimelineId = tweetManager.getCurrentTimeline().template.id;
    if(currentTimelineId == 'unified' || currentTimelineId == 'home') {
      var currentMaxTweets = OptionsBackend.get('max_cached_tweets'),
          currentTweetsPerPage = OptionsBackend.get('tweets_per_page'),
          nextMaxTweets = 0,
          nextTweetsPerPage = 0,
          defaultMaxTweets = OptionsBackend.getDefault('max_cached_tweets'),
          defaultTweetsPerPage = OptionsBackend.getDefault('tweets_per_page');
      switch(true) {
        case (processTime < 100):
          nextMaxTweets = currentMaxTweets + 20;
          nextTweetsPerPage = currentTweetsPerPage + 20;
          break;
        case (processTime < 200):
          nextMaxTweets = currentMaxTweets + 5;
          nextTweetsPerPage = currentTweetsPerPage + 5;
          break;
        case (processTime <= 400):
          return;
        case (processTime > 400):
          nextMaxTweets = currentMaxTweets - 5;
          nextTweetsPerPage = currentTweetsPerPage - 5;
          break;
        default:
          nextMaxTweets = defaultMaxTweets;
          nextTweetsPerPage = defaultTweetsPerPage;
          break;
      }
      if(nextMaxTweets > 200) nextMaxTweets = 200;
      if(nextMaxTweets <= defaultMaxTweets) nextMaxTweets = defaultMaxTweets;
      if(nextTweetsPerPage > 200) nextTweetsPerPage = 200;
      if(nextTweetsPerPage <= defaultTweetsPerPage) nextTweetsPerPage = defaultTweetsPerPage;
      if(nextMaxTweets !== currentMaxTweets || nextTweetsPerPage !== currentTweetsPerPage) {
        console.info('Max Cached Tweets in next time: ' + nextMaxTweets);
        console.info('Tweets Per Page in next time: ' + nextTweetsPerPage);
        OptionsBackend.saveOption('max_cached_tweets', nextMaxTweets);
        OptionsBackend.saveOption('tweets_per_page', nextTweetsPerPage);
      }
    }
  },

  createUserActionMenu: function() {
    var userId = this.dataset.userId || 'undefined',
        userName = this.dataset.userName || 'undefined';
    if(userId == "1266336019" || userId == 'undefined' || userName == 'undefined') return;
    var selfId = tweetManager.twitterBackend.userid() === userId,
        isFollowing = tweetManager.getFollowingIdsMap().has(userId),
        isMuting = tweetManager.getMutingIdsSet().has(userId),
        isBlocking = tweetManager.getBlockedIdsSet().has(userId);
    var reloadTimeline = function() {
      if(tweetManager.currentTimelineId == TimelineTemplate.UNIFIED
      || tweetManager.currentTimelineId == TimelineTemplate.HOME) {
        prepareAndLoadTimeline();
      }
    };
    $(this).actionMenu({
      showMenu: function(event) {
        if(event.isAlternateClick) {
          Renderer.openTab(TwitterLib.URLS.BASE + userName, event);
          return false;
        }
        return true;
      },
      actions: [
        {
          name: chrome.i18n.getMessage("tweets_action"),
          action: function(event) {
            TimelineTab.addNewSearchTab('from:' + userName, event.isAlternateClick);
          }
        },
        {
          name: chrome.i18n.getMessage("profile_action"),
          action: function(event) {
            Renderer.openTab(TwitterLib.URLS.BASE + userName, event);
          }
        },
        {
          name: chrome.i18n.getMessage("add_mention_action"),
          action: function() {
            Composer.addUser(['@' + userName]);
          },
          condition: function() {
            return !selfId && tweetManager.composerData.isComposing;
          }
        },
        {
          name: chrome.i18n.getMessage("follow_action"),
          action: function() {
            $("#loading").show();
            tweetManager.followUser(function(success, user) {
              $("#loading").hide();
              if(success) {
                reloadTimeline();
              }
            }, userId);
          },
          condition: function() {
            return !selfId && !isFollowing;
          }
        },
        {
          name: chrome.i18n.getMessage("unfollow_action"),
          action: function() {
            $("#loading").show();
            tweetManager.unfollowUser(function(success, user) {
              $("#loading").hide();
              if(success) {
                reloadTimeline();
              }
            }, userId);
          },
          condition: function() {
            return !selfId && isFollowing;
          },
          second_level: true
        },
        {
          name: chrome.i18n.getMessage("mute_action"),
          action: function() {
            $("#loading").show();
            tweetManager.muteUser(function(success, user) {
              $("#loading").hide();
              if(success) {
                reloadTimeline();
              }
            }, userId);
          },
          condition: function() {
            return !selfId && !isMuting;
          },
          second_level: true
        },
        {
          name: chrome.i18n.getMessage("unmute_action"),
          action: function() {
            $("#loading").show();
            tweetManager.unmuteUser(function(success, user) {
              $("#loading").hide();
              if(success) {
                reloadTimeline();
              }
            }, userId);
          },
          condition: function() {
            return !selfId && isMuting;
          },
          second_level: true
        },
        {
          name: chrome.i18n.getMessage("block_action"),
          action: function() {
            $("#loading").show();
            tweetManager.blockUser(function(success, user) {
              $("#loading").hide();
              if(success) {
                reloadTimeline();
              }
            }, userId);
          },
          condition: function() {
            return !selfId && !isBlocking;
          },
          second_level: true
        },
        {
          name: chrome.i18n.getMessage("report_action"),
          action: function() {
            $("#loading").show();
            tweetManager.reportUser(function(success, user) {
              $("#loading").hide();
              if(success) {
                reloadTimeline();
              }
            }, userId);
          },
          condition: function() {
            return !selfId && !isBlocking;
          },
          second_level: true
        }
      ],
      parentContainer: '.inner_timeline'
    });
  },

  handleHashTagFunc: function() {
    if(!this.dataset.handleHashTag) return;
    Renderer.handleHashTag(this, this.dataset.handleHashTag);
    this.removeAttribute("data-handle-hash-tag");
  },

  handleHashTag: function(link, value) {
    AnyClick.anyClick(link, function(event) {
      if(!OptionsBackend.get('open_searches_internally')) {
        Renderer.openTab(TwitterLib.URLS.SEARCH + "%23" + value, event);
      } else {
        TimelineTab.addNewSearchTab(value, event.isAlternateClick);
      }
    });
  },

  expandInReplyFunc: function() {
    if(!this.dataset.expandInReplyId || !this.dataset.expandInReplyTweet) return;
    var tweet = JSON.parse(unescape(this.dataset.expandInReplyTweet)), tweetSpaceId = this.dataset.expandInReplyId;
    AnyClick.anyClick(this, function() {
      Renderer.toggleInReply(tweet, tweetSpaceId);
    });
    Renderer.expandInReply(tweet, tweetSpaceId, true);
    this.removeAttribute("data-expand-in-reply-tweet");
    this.removeAttribute("data-expand-in-reply-id");
    this.classList.remove("expandInReply");
  },

  handleLinkEachFunc: function() {
    if(this.dataset.tooltipDoExpand) return;
    var baseUrl, expandedUrl, mediaUrl;
    baseUrl = (this.dataset.handleLinkBase === "undefined")? null: this.dataset.handleLinkBase;
    expandedUrl = (this.dataset.handleLinkExpanded === "undefined")? null: this.dataset.handleLinkExpanded;
    mediaUrl = (this.dataset.handleLinkMedia === "undefined")? null: this.dataset.handleLinkMedia;
    AnyClick.anyClick(this, function(event) {
      Renderer.openTab(this.dataset.handleLinkBase, event);
    }.bind(this));
    this.setAttribute('class', 'tooltip');
    if(!this.dataset.tooltipContent) {
      this.setAttribute('data-tooltip-content', '<p>' + baseUrl + '</p>');
      if(OptionsBackend.get('show_expanded_urls') && this.dataset.handleLinkNoexpand !== 'true') {
        this.setAttribute('data-tooltip-do-expand', (mediaUrl || expandedUrl || baseUrl));
      } else {
        this.setAttribute('data-tooltip-do-expand', 'undefined');
      }
    } else {
      this.setAttribute('data-tooltip-do-expand', 'undefined');
    }
    baseUrl = null;
    expandedUrl = null;
    mediaUrl = null;
  },

  handleLinkForExpand: function() {
    var toExpandUrl = this.dataset.tooltipDoExpand || 'undefined';
    if(toExpandUrl == 'undefined') return;
    this.dataset.tooltipContent = chrome.i18n.getMessage("expanding_url");
    tweetManager.urlExpander.expand({
      url: toExpandUrl,
      callback: function(result) {
        var resultUrl = result.get('url') || toExpandUrl;
        if(typeof result.get('content') !== 'undefined') {
          if(Renderer.entitiesRegexp.quoteTweet.test(resultUrl)) {
            var tweetspaceId = $(this).parents('.tweet_space').attr('id');
            var quotedTweetEntity = escape(JSON.stringify({"in_reply_to_status_id": Renderer.entitiesRegexp.quoteTweet.exec(resultUrl)[1] || ""}));
            this.outerHTML = `<span><span class="glyphicon glyphicon-link"></span><a href="${resultUrl}" class="expandInReply" data-handle-link-base="${toExpandUrl}" data-handle-link-expanded="${resultUrl}" data-handle-link-media="undefined" data-expand-in-reply-tweet="${quotedTweetEntity}" data-expand-in-reply-id="${tweetspaceId}" title="${chrome.i18n.getMessage("expand_quote_tweet")}">${toExpandUrl}</a></span>`;
          } else {
            this.setAttribute('data-tooltip-content', result.get('content'));
          }
        } else {
          this.setAttribute('data-tooltip-content', '<p>' + result.get('url') + '</p>');
        }
      }.bind(this)
    });
  },

  expandInReply: function(tweet, targetId, showIfVisible) {
    if(showIfVisible && !tweet.replyVisible) {
      return;
    }

    $("#loading").show();
    tweetManager.getInReplyToTweet(function(success, data, status) {
      if(success) {
        tweet.replyVisible = true;
        var renderedTweet = $.parseHTML(Renderer.renderTweet(data, Date.now(), false));
        $(document.createElement('div'))
        .addClass('reply_separator')
        .text("\u2193")
        .click(function() {
          Renderer.toggleInReply(tweet, targetId);
        })
        .prependTo(renderedTweet);
        $('#' + targetId).append(renderedTweet);
        if(!showIfVisible) {
          $(renderedTweet)
          .show('blind', { direction: "vertical" })
          .find('.handleLink')
          .each(Renderer.handleLinkEachFunc);
        }
        renderedTweet = null;
      }
      $("#loading").hide();
    }, tweet);
  },

  toggleInReply: function(tweet, targetId) {
    if(tweet.replyVisible) {
      tweet.replyVisible = false;
      $('#' + targetId)
      .find("[tweetid='" + tweet.in_reply_to_status_id + "']")
      .parents('.tweet_space')
      .first()
      .hide('blind', { direction: "vertical" }, 'normal', function() {
        $(this).remove();
      });
      return;
    }

    Renderer.expandInReply(tweet, targetId);
  },

  warningsCallback: function(msg, isError) {
    if(isError) {
      Renderer.showError(msg, null);
    } else {
      Renderer.showWarning(msg);
    }
  },

  showWarning: function(msg) {
    $("#warning_image img").attr('src', 'img/warning.png');
    msg = $(document.createElement('span')).text(msg);
    Renderer.showMessage(msg);
  },

  showError: function(msg, tryAgainFunction) {
    $("#warning_image img").attr('src', 'img/error.png');
    var span = $(document.createElement('span')), link;
    msg = span.text(msg);

    if(tryAgainFunction) {
      link = $(document.createElement('a'))
      .attr('href', '#')
      .text(chrome.i18n.getMessage("tryAgain"))
      .on('click', function(ev) {
        ev.preventDefault();
        tryAgainFunction();
        Renderer.hideMessage();
      });
      msg.append(link);
    }
    Renderer.showMessage(msg);
    link = null;
    span = null;
    msg = null;
  },

  showMessage: function(msg) {
    $("#warning_content").empty().append(msg);
    $("#absolute_container").slideDown('slow');
    $("#warning_dismiss").off(".warning").on("click.warning", Renderer.hideMessage);
  },

  hideMessage: function() {
    var imgSrc = $("#warning_image img").attr('src');
    if(imgSrc.match(/warning/)) {
      tweetManager.clearWarning();
    }
    $("#warning_dismiss").off(".warning");
    $("#absolute_container").slideUp('slow');
  },

  detach: function() {
    if(!ThemeManager.detachedPos.width || !ThemeManager.detachedPos.height) {
      ThemeManager.detachedPos.width = window.innerWidth;
      ThemeManager.detachedPos.height = window.innerHeight;
    }
    window.open(chrome.extension.getURL('popup.html?detached'), 'cb_popup_window',
      'left=' + ThemeManager.detachedPos.left + ',top=' + (ThemeManager.detachedPos.top - 22) + // Magic 22...
      ',width=' + ThemeManager.detachedPos.width + ',height=' + ThemeManager.detachedPos.height +
      'location=no,menubar=no,resizable=yes,status=no,titlebar=yes,toolbar=no');
    window.close();
  },

  openTab: function(tabUrl, event) {
    var background = false;
    if(event && event.button) {
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
        active: !background
      });
      if(background && obj) {
        obj.blur();
      }
    } else {
      chrome.tabs.create({
        url: tabUrl,
        active: !background
      });
    }
    return true;
  }
};
