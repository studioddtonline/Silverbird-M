var TwitterLib = {
  URLS: {
    BASE: 'http://twitter.com/',
    SEARCH: 'http://twitter.com/search?q='
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

  getTimestampText: function (inputTimestamp) {
    var diff = (Date.now() - inputTimestamp) * 0.001 | 0;

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
    return new Date(inputTimestamp).toLocaleDateString() + ' ' + new Date(inputTimestamp).toLocaleTimeString();
  },

  entitiesFuncs: {
    typeMap: function(type) {
      return function(e) {e.type = type; return e;};
    },
    indexSort: function(e1, e2) {
      return e1.indices[0] - e2.indices[0];
    }
  },

  parseEntities: function(text, entities, extended_entities) {
    var mapFunc = this.entitiesFuncs.typeMap,
        sortFunc = this.entitiesFuncs.indexSort;
    var mediaEntities = entities.media || [];
    var extendedMediaEntities = extended_entities.media || [];
    var orderedEntities = [].concat(
        entities.hashtags.map(mapFunc('hashtag')),
        entities.urls.map(mapFunc('url')),
        entities.user_mentions.map(mapFunc('mention')),
        mediaEntities.map(mapFunc('media')));
    orderedEntities.sort(sortFunc);
    var totalInc = 0, elements = '', i, len, entity, indices, link, handleLink;
    for (i = 0, len = orderedEntities.length; i < len; ++i) {
      entity = orderedEntities[i];
      indices = entity.indices;
      link = null;
      handleLink = '';
      elements += text.substring(totalInc, indices[0]).replace(/\r|\r?\n/g, '<br />');
      if(entity.type === 'mention') {
        elements += '@<a href="#" class="createUserActionMenu" data-create-user-action-menu="' + entity.screen_name + '">' + entity.screen_name + '</a>';
      } else if(entity.type === 'hashtag') {
        elements += '<a href="#" class="handleHashTag" data-handle-hash-tag="' + entity.text + '">#' + entity.text + '</a>';
      } else if(entity.type === 'url' || entity.type === "media" || entity.type === "photo") {
        var title = '';
        if(entity.display_url[entity.display_url.length - 1].charCodeAt(0) == 8230) { // Ends with ...
          title = ' title="' + entity.expanded_url + '"';
        }
        elements += '<a href="' + entity.url + '" class="handleLink" data-handle-link-base="' + entity.url + '" data-handle-link-expanded="' + entity.expanded_url + '" data-handle-link-media="' + entity.media_url_https + '"' + title + '>' + entity.display_url + '</a>';
      } else {
        elements += text.substring(indices[0], indices[1]).replace(/\r|\r?\n/g, '<br />');
      }
      totalInc = indices[1];
    }
    elements += text.substring(totalInc, text.length).replace(/\r|\r?\n/g, '<br />');
    if(extendedMediaEntities.length > 1) {
      elements += '<div class="extendedEntities">';
      for(i = 0, len = extendedMediaEntities; i < len; i++) {
        var extendedMedia = extendedMediaEntities[i];
        if(extendedMedia.type !== 'photo') continue;
        elements += '<a href="' + extendedMedia.url + '" class="handleLink" data-handle-link-base="' + extendedMedia.url + '" data-handle-link-expanded="' + extendedMedia.expanded_url + '" data-handle-link-media="' + extendedMedia.media_url_https + '"><img src="' + extendedMedia.media_url_https + '" class="extendedEntitiesPhoto"></a>';
      }
      elements += '</div>';
    }
    return elements;
  },

  renderTweet: function (tweet, useColors) {
    var user = tweet.user;
    var text = tweet.text;
    var tweetId = tweet.id;
    var entities = tweet.entities;
    var extended_entities = tweet.extended_entities || {};
    var selfTweet = (tweet.user.screen_name == tweetManager.twitterBackend.username());
    if(tweet.retweeted_status) {
      user = tweet.retweeted_status.user;
      text = tweet.retweeted_status.text;
      tweetId = tweet.retweeted_status.id;
      entities = tweet.retweeted_status.entities;
      extended_entities = tweet.retweeted_status.extended_entities || {};
      if(selfTweet && !tweetManager.isRetweet(tweet)) {
        tweetManager.retweets[tweetId] = tweet.id;
      }
    }
    var tweetspaceId = 'id' + Date.now() + tweet.id;
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
      var profileIconSize, profileIconStyle, replaceRegExp, tweetIconUrl, retweeterIconUrl;
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
      replaceRegExp = new RegExp('_normal\.(jpe?g|gif|png)$', 'i');
      if(tweet.retweeted_status) {
        tweetIconUrl = user.profile_image_url.replace(replaceRegExp, profileIconSize + '.$1');
        retweeterIconUrl = tweet.user.profile_image_url.replace(replaceRegExp, profileIconSize + '.$1');
        profile_container = '<div class="profile_container"><img data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu profile retweet_source ' + profileIconStyle + '" src="' + tweetIconUrl + '"/><img data-create-user-action-menu="' + tweet.user.screen_name + '" class="createUserActionMenu profile retweet_retweeter ' + profileIconStyle + '" src="' + retweeterIconUrl + '"/></div>';
      } else {
        tweetIconUrl = user.profile_image_url.replace(replaceRegExp, profileIconSize + '.$1');
        profile_container = '<div class="profile_container"><img data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu profile ' + profileIconStyle + '" src="' + tweetIconUrl + '" /></div>';
      }
    }

    // header_container
    if(user.verified && !displaySimpleName) {
      userVerified = '<img class="verified" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAhhJREFUOI21lL9rU1EUxz/3xkblVWpThBbBOHRqC4JYmvaP0KXFMdWxQkFcpB0sBcX/wcHUuphOukl3IVS3pjgUbBRtiphGSNIkL+8ch/fDmCalKB64vHMf5/vh3i/nXPjfIaKOiN4T0U0R/SKiGnw3g//OaUFzIloMAL1WUURnO7WmA/QQeAKYrbLLi69NcmWXbzWXkZjHVCJO+orDZOIsgAJL1pqnx2AiOge8aomaR7tHrB8oWAsK6rVQtwnNOgDppMPq2AAxYxS4ba3ZiGCBB7vA8NLHCi+/G8yZuA9DfVizidZrIF4EfDx+EaAIjFprqjY42DwwvHXYYH3f9SHhMhZjLCbYzwzFAVgrVHl/2AAYDvSEsFsAmb2a74QGlqgSmqMoM4k+NlKXIo+f71XD9GY7bBwgV6r7V/JapPoFghyvxcwFw8bkICs75QiWKzXCdKIdNgRQcgVcl+l+ITsRJ+V4qNtg2hGy1/vJ7FV49ik6jV/fpg9hPwASfb7h7w4qZAo1stfOc/+yiUDL+Z+0h1//Wx/u8gBTfv8AsLx9yNviEQ9Gu4M66rfbYa8B5pN/TsndDyVWdspdQQB3rkb1b6BLny3ny6wVql3F7dGzz6w1VWAR0NWxAdLJk+c4nAD8rlkM9CfMZqnB2ucquVKT/brHyLkYqUScdNLhxmD32TwWIjr7t69GL6Ajogs93rOFU79n/xK/AOwlZ8v3V4kXAAAAAElFTkSuQmCC" alt="verified" />';
    }
    if(user['protected'] && !displaySimpleName) {
      userProtected = '<img class="protected" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAcdJREFUOI2t0r2PEkEYBvB3CMMQMpnrZKc5EqNHs8Tef8Aavdy6dFpuBQ3d2GBDA60WJjYs2Zx4vYV21iZsgL3CBBo+ut2sGSZwGRsv4ZBFRJ9mineeXzHzAvzHoKSB67r3R6NRQ0r5fL1eo3Q6rXO5XLdYLL6qVCrfD8ba7fbjxWLxablc5hhjc6VUjxByHkXRvWw2+yOfzz+pVqtf/4h1u91Cv9//tlqtGGPsXAhxdTtrNBrlKIo+YIyjUqn0yLbtyWY3tY0FQdCSUp4wxi42IQAAIcQVY+xCSnkSBEF7u3sH63Q6D8MwLFNKPwsherueQAjRo5R+CcOw7Lrug0RsOBzaAIA45293QbfhnL8BADQYDOxELJPJ2BjjG8dxLvdhjuNcYoxvCCF3MAQA0Gw2X8zn83da68RVSQpCSBuG8bJer79PAQDMZrPTJIhSOkEIvaaUTnbNtdZoOp0WAHb85hY0Nk3zrNVqCdM0zyil433392JKqZ5lWQoAwLIspZT6eDRGCHnmeR4BAPA8jxBCnh6NxXFc8H3/GgDA9/3rOI4LR2O/wNPN85+wv8lBWK1W0wdjhmGMEUIHFX4DUinNOd+7MkflJzFosUyNaRQGAAAAAElFTkSuQmCC" alt="protected" />';
    }
    if(nameAttribute == "both") {
      if(displaySimpleName) bothContent = '';
      header_container = '<div class="header_container"><div class="primary_name"><a ' + userNameHref + ' data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu user" screen_name="' + user.screen_name + '">' + user.name + '</a>' + userVerified + userProtected + bothContent + '<a ' + userNameHref + ' data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu user" screen_name="' + user.screen_name + '">@' + user.screen_name + '</a></div></div>';
    } else if(nameAttribute == "screen_name") {
      header_container = '<div class="header_container"><div class="primary_name"><a ' + userNameHref + ' data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu user" screen_name="' + user.screen_name + '" title="' + user.name + '">@' + user.screen_name + '</a>' + userVerified + userProtected + '</div></div>';
    } else if(nameAttribute == "name") {
      header_container = '<div class="header_container"><div class="primary_name"><a ' + userNameHref + ' data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu user" screen_name="' + user.screen_name + '" title="@' + user.screen_name + '">' + user.name + '</a>' + userVerified + userProtected + '</div></div>';
    }

    // text_container
    text_container = '<div class="text_container">' + this.parseEntities(text, entities, extended_entities) + '</div>';

    // footer_container
    if(this.isComplete() && !hiddenFooter) {
      // timestamp
      if(!hiddenTimestamp) {
        var parsedTime = Date.parse(tweet.created_at);
        timestamp_url = TwitterLib.URLS.BASE + user.screen_name + '/status/' + tweetId;
        footer_content += '<span class="timestamp"><a class="handleLink" data-handle-link-base="' + timestamp_url + '" title="' + Renderer.getTimestampAltText(parsedTime) + '" href="' + timestamp_url + '">' + Renderer.getTimestampText(parsedTime) + '</a></span>';
      }
      // reply
      if(!hiddenReplyInfo && tweet.in_reply_to_status_id) {
        footer_content += '<span class="inReply">' + chrome.i18n.getMessage("inReply_prefix") + '<a class="expandInReply" data-expand-in-reply-tweet="' + escape(JSON.stringify(tweet)) + '" data-expand-in-reply-id="' + tweetspaceId + '" href="#">' + tweet.in_reply_to_screen_name + '</a>' + chrome.i18n.getMessage("inReply_suffix") + '</span>';
      }
      // retweet
      if(!hiddenRetweetInfo && tweet.retweeted_status) {
        var retweet_img = '<img class="retweet" alt="retweet" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAatJREFUOI2dlDGPGjEQhZ/Xl9WuRCRAQrnkn4SO607p0llCWome1HRHqKjpaJCo6NKl5dJE+Qm0VKFxgdgVMja2r4lXXs6rwL3qeTz+RrbGQ+BpNBo94QZNp9Pv/po4Mx6Pfx4Oh8/+plIKSimcz2dorWGMgbW2AkzT9M98Pv8CAHcuyDl/bLfbxE/M8xxCCEgpobWGtfYVTCn16HzkjDGmArpB5bm7uozJZFILZ4zZUDwKBd+qEhZFUVmNUhqs/D+V1+x2u9+EEF8BIEmSH6Hkfr//V2v98TLOGLOU0l3lXbIsWwPAcrl8CMEGg0FXCPHLWvvOjxNCVJIkvRKWZdlaStkDgDiOn68FOtBisfhNLkFO1wABwIEAgIRA1wIBEAcCvIZjjBlvbVerVW3bzGazHef8HgA6nc5uOBx+Aqp9Rmr8K3HOPzi/2WzunX9r0wYL136nLMvWlFLEcYw0TdFoNNBqtdBsNrHdboNnfJj1q0gpe4QQnE4nHI9HFEWBoiiw3+8vGeVvKWFRFBXGmPeVrH8jx1oLYwyUUsjzvEJKkkSG7n7zpAWq0/YFBaXPbFGysNUAAAAASUVORK5CYII="/>';
        if(selfTweet) {
          footer_content += '<span class="selfRetweet">' + retweet_img + chrome.i18n.getMessage("retweetedByMe");
        } else {
          footer_content += '<span class="inRetweet">' + retweet_img + chrome.i18n.getMessage("retweetedBy_prefix") + '<a href="' + TwitterLib.URLS.BASE + tweet.user.screen_name + '" data-create-user-action-menu="' + tweet.user.screen_name + '" class="createUserActionMenu">' + tweet.user.screen_name + '</a>' + chrome.i18n.getMessage("retweetedBy_suffix");
        }
        if(tweet.retweet_count > 0) {
          footer_content += ' (' + chrome.i18n.getMessage("retweetedCount_prefix") + tweet.retweet_count + chrome.i18n.getMessage("retweetedCount_suffix") + ')</span>';
        }
      }
      // from App
      if(!hiddenClientName && tweet.source) {
        footer_content += '<span class="from_app">' + chrome.i18n.getMessage("fromApp_prefix") + tweet.source.replace(/href=/i, 'class="handleLink" href="#" data-handle-link-base=') + chrome.i18n.getMessage("fromApp_suffix") + '</span>';
      }
      // DM
      if(!hiddenDMInfo && templateId == TimelineTemplate.SENT_DMS) {
        footer_content += '<span class="dm_recipient">' + chrome.i18n.getMessage("sentTo_prefix") + '<a href="#" data-create-user-action-menu="' + tweet.recipient.screen_name + '" class="createUserActionMenu">' + tweet.recipient.name + '</a>' + chrome.i18n.getMessage("sentTo_suffix") + '</span>';
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
        var latStr = coords[0] + ',' + coords[1];
        footer_content += '<span class="geo_tag"><a class="handleLink tooltip" data-handle-link-base="http://maps.google.com/maps?q=loc:' + coords[0] + ',' + coords[1] + ' ' + escape('(' + tweet.user.screen_name + ')') + '" data-tooltip-image="http://maps.google.com/maps/api/staticmap?' + $.param({center: latStr, zoom: 15, size: '200x200', maptype: 'roadmap', markers: 'size:small|' + latStr, sensor: false}) + '" href="#"><img src="data:image/gif;base64, R0lGODlhCgAKAMZZAKRFP7NDN5s5RphLU6dUTLdpVbVZbopycK1vZKNxZqxyZ79oe8hSRMVST8xdTNJaWcRlU8FlWtNzXdVpZsh5atN6aKqEe7yFfsaGa8uVe9GUf791hN55h4yGiI6FipuRkKqHhbasrbi2t8KZg8Cal8mRmuObjMehls+nn/2njvewnMO+u8m6v/ykoPCusubFvsG6wv+/yM3Ex//Lz+7Qxe/Ryf/J2f/lzf/l4f/m5//j7//t7P/47f3z8f/19f/39f/88P/59P/49v/59//69v/69/L6/Pb6/fr4+fj6+f/7+fr8+f79+//9+/z5///4//z7//37///6/v/6//n//fn+//v+//39/f/9/f///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////yH5BAEAAH8ALAAAAAAKAAoAAAdJgH+CfyUbBgs2g38gMzMcAgMugjQXLRMPDQAEgi8KEAEMDhUFgwkUEBIpGBmDFggmKhojgywHJCgkijAeIYqCMh0ivoIfK8OCgQA7"/></a></span>';
      }
      // from list
      if(!hiddenListInfo && templateId == TimelineTemplate.LISTS && tweetManager.currentTimelineId != tweetTimeline) {
        var list = tweetManager.getList(tweetTimeline);
        if(list !== null) {
          var linkPath = list.uri.substr(1);
          footer_content += '<span class="from_list">(' + chrome.i18n.getMessage("f_footer_list") + ': <a class="handleLink" data-handle-link-base="' + TwitterLib.URLS.BASE + linkPath + '" href="#" title="@' + linkPath + '">' + list.name + '</a>)</span>';
        }
      }
    }
    if(!hiddenFooter) {
      footer_container = '<div class="footer_container">' + footer_content + '</div>';
    }

    // new_actions
    if(this.isComplete() && !/^Notification/.test(tweet.id)) {
      newActions_container = '<div class="new_actions">';
      if(templateId != TimelineTemplate.RECEIVED_DMS && templateId != TimelineTemplate.SENT_DMS) {
        if(tweet.favorited) {
          newActions_container += '<img class="starred" title="' + chrome.i18n.getMessage('unmarkFavorite') + '" src="img/star_hover.png" />';
        } else {
          newActions_container += '<img class="unStarred" title="' + chrome.i18n.getMessage('markFavorite') + '" src="img/star.png" />';
        }
        newActions_container += '<br />';
      }
      if(selfTweet) {
        var titleStrig;
        if(tweet.retweeted_status) {
          titleString = chrome.i18n.getMessage("deleteRT");
        } else {
          titleString = chrome.i18n.getMessage("Delete");
        }
        newActions_container += '<img class="destroyIcon" title="' + titleString + '" src="img/delete.png" /><br />';
      } else {
        newActions_container += '<img class="replyIcon" title="' + chrome.i18n.getMessage("Reply") + '" src="img/reply.png" /><br />';
        if(tweetManager.isRetweet(tweet)) {
          newActions_container += '<img class="destroyRTIcon" title="' + chrome.i18n.getMessage("deleteRT") + '" src="img/delete.png" /><br />';
        } else {
          if(templateId != TimelineTemplate.RECEIVED_DMS && templateId != TimelineTemplate.SENT_DMS && !user['protected']) {
            newActions_container += '<img class="retweetIcon" title="' + chrome.i18n.getMessage("Retweet") + '" src="img/rt.png" /><br />';
          }
        }
        if(!user['protected']) {
          newActions_container += '<img class="oldRTIcon" title="' + chrome.i18n.getMessage("oldRT") + '" src="img/share.png" />';
        }
      }
      newActions_container += '</div>';
    }

    // build tweetSpace
    if(this.isComplete()) {
      if(useColors) overlayStyle = 'background-color: ' + TimelineTemplate.getTemplate(templateId).overlayColor + ';';
    }
    return '<div class="tweet_space" id="' + tweetspaceId + '"><div class="chromed_bird_tweet tweet" timelineid="' + tweetTimeline + '" tweetid="' + tweet.id + '"><div class="tweet_overlay" style="' + overlayStyle + '"><div class="first_container">' + profile_container + header_container + text_container + footer_container + '</div>' + newActions_container + '</div></div></div>';
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
