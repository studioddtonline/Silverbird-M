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

  isOnPage: function() {
    return this.context == 'onpage';
  },

  isComplete: function() {
    return this.context == 'popup' || this.context == 'standalone';
  },

  isStandalone: function() {
    return this.context == 'standalone';
  },

  isNotification: function() {
    return this.context == 'onpage' || this.context == 'desktop';
  },

  getTimestampText: function (inputTimestampStr) {
    var diff = (Date.now() - Date.parse(inputTimestampStr)) * 0.001 | 0;

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

  getTimestampAltText: function (inputTimestampStr) {
    var inputTimestamp = Date.parse(inputTimestampStr);
    return new Date(inputTimestamp).toLocaleDateString() + ' ' + new Date(inputTimestamp).toLocaleTimeString();
  },

  expandImageLink: function (url) {
    var thumbUrl = null;
    thumbUrl = ImageService.getThumb(url);
    if(!thumbUrl && /\.(png|jpg|jpeg|gif|bmp|tiff)(\?.*)?$/.test(url)) thumbUrl = url;
    return thumbUrl;
  },

  entitiesFuncs: {
    typeMap: function(type) {
      return function(e) {e.type = type; return e;};
    },
    indexSort: function(e1, e2) {
      return e1.indices[0] - e2.indices[0];
    },
    handleHashTag: function(link, value) {
      if(Renderer.isOnPage()) {
        link.setAttribute('href', TwitterLib.URLS.SEARCH + "%23" + value);
        link.setAttribute('target', '_blank');
        return;
      }
      AnyClick.anyClick(link, function(ev) {
        if(Renderer.isNotification() || !OptionsBackend.get('open_searches_internally')) {
          openTab(TwitterLib.URLS.SEARCH + "%23" + value);
        } else {
          TimelineTab.addNewSearchTab('#' + value, ev.isAlternateClick);
        }
      });
    },
    handleLink: function(link, baseUrl, expandedUrl, mediaUrl) {
      if(Renderer.isOnPage()) {
        link.setAttribute('href', baseUrl);
        link.setAttribute('target', '_blank');
        return;
      }
      var toExpandUrl = mediaUrl || expandedUrl || baseUrl;
      AnyClick.anyClick(link, function() {
        openTab(baseUrl);
      });
      if(Renderer.isNotification() || !OptionsBackend.get('show_expanded_urls')) {
        return;
      }
      var url = Renderer.expandImageLink(toExpandUrl),
          changeContent = null,
          d = document,
          loadingEl = $(d.createElement('span')).html('<img src="img/loading.gif" />' + chrome.i18n.getMessage("loading"));
      var loadImage = function(url) {
        var img = new Image();
        img.onerror = function() {
          img = null;
          $('.ui-tooltip-content').html(url);
        };
        img.onload = function() {
          $('.ui-tooltip-content').html(img);
        };
        img.src = url;
      };
      $(link).tooltip({
        items: '*',
        content: function() {
          if(url) {
            loadImage(url);
            return loadingEl;
          }
          urlExpander.expand(toExpandUrl, function expanded(success, isShortened, longUrl) {
            var changeContent = null;
            if(!isShortened) {
              changeContent = link.getAttribute('title') || link.textContent;
            } else {
              var reCheck = Renderer.expandImageLink(longUrl);
              if(reCheck) {
                loadImage(reCheck);
              } else if(success) {
                changeContent = decodeURI(longUrl);
              } else {
                changeContent = chrome.i18n.getMessage("errorExpandingUrl");
              }
            }
            if(changeContent) {
              setTimeout(function() {$('.ui-tooltip-content').html(changeContent);}, 0);
              return;
            }
          });
          return loadingEl;
        }
      });
    }
  },

  parseEntities: function(text, entities) {
    var d = document;
    var mapFunc = this.entitiesFuncs.typeMap,
        sortFunc = this.entitiesFuncs.indexSort;
    var mediaEntities = entities.media || [];
    var orderedEntities = [].concat(
        entities.hashtags.map(mapFunc('hashtag')),
        entities.urls.map(mapFunc('url')),
        entities.user_mentions.map(mapFunc('mention')),
        mediaEntities.map(mapFunc('media')));
    orderedEntities.sort(sortFunc);
    var totalInc = 0,
        elements = d.createDocumentFragment(),
        i, len, entity, indices, link, textContent;
    for (i = 0, len = orderedEntities.length; i < len; ++i) {
      entity = orderedEntities[i];
      indices = entity.indices;
      link = null;
      var temp = d.createElement('span');
      temp.innerHTML = text.substring(totalInc, indices[0]).replace(/\r|\r?\n/g, '<br>');
      elements.appendChild(temp);
      temp = null;
      if (entity.type === 'mention') {
        elements.appendChild(Renderer.makeText('@'));
        link = d.createElement('a');
        link.setAttribute('href', '#');
        link.setAttribute('class', 'createUserActionMenu');
        link.setAttribute('data-create-user-action-menu', entity.screen_name);
        link.innerHTML = entity.screen_name;
      } else if (entity.type === 'hashtag') {
        link = d.createElement('a');
        link.setAttribute('href', '#');
        link.setAttribute('class', 'handleHashTag');
        link.setAttribute('data-handle-hash-tag', entity.text);
        link.innerHTML = '#' + entity.text;
      } else if (entity.type === 'url' || entity.type === "media") {
        entity.display_url = entity.display_url || entity.url;
        link = d.createElement('a');
        link.setAttribute('href', entity.url);
        link.innerHTML = entity.display_url;
        if (entity.display_url[entity.display_url.length - 1].charCodeAt(0) == 8230) { // Ends with ...
          link.setAttribute('title', entity.expanded_url);
        }
        this.entitiesFuncs.handleLink(link, entity.url, entity.expanded_url, entity.media_url);
      } else {
        var temp = d.createElement('span');
        temp.innerHTML = text.substring(indices[0], indices[1]).replace(/\r|\r?\n/g, '<br>');
        elements.appendChild(temp);
        temp = null;
      }
      if (link) {
        elements.appendChild(link);
        link = null;
      }
      totalInc = indices[1];
    }
    var temp = d.createElement('span');
    temp.innerHTML = text.substring(totalInc, text.length).replace(/\r|\r?\n/g, '<br>');
    elements.appendChild(temp);
    temp = null;
    return elements;
  },

  makeText: function (content) {
    return document.createTextNode(content);
  },

  renderTweet: function (tweet, useColors) {
    var user = tweet.user;
    var text = tweet.text;
    var tweetId = tweet.id;
    var entities = tweet.entities;
    if(tweet.retweeted_status) {
      user = tweet.retweeted_status.user;
      text = tweet.retweeted_status.text;
      tweetId = tweet.retweeted_status.id;
      entities = tweet.retweeted_status.entities;
    }
    var tweetTimeline = 'home';
    if(!this.isOnPage()) {
      tweetTimeline = tweet.originalTimelineId || tweet.timelineId || tweetManager.currentTimelineId;
    }
    var templateId = tweetTimeline.replace(/_.*$/, '');
    var tweetClass = 'chromed_bird_tweet tweet';

    // Twitter Display Requirements Options
    var compliantTDR, hiddenUserIcons, hiddenTimestamp, nameAttribute, displaySimpleName, hiddenFooter, aggressiveFlat;
    if(typeof OptionsBackend === 'undefined' || OptionsBackend.get('compliant_twitter_display_requirements')) {
      compliantTDR = true;
      hiddenUserIcons = false;
      hiddenTimestamp = false;
      nameAttribute = 'both';
      displaySimpleName = false;
      hiddenFooter = false;
      aggressiveFlat = false;
    } else {
      compliantTDR = false;
      hiddenUserIcons = OptionsBackend.get('hidden_user_icons');
      hiddenTimestamp = OptionsBackend.get('hidden_timestamp');
      nameAttribute = OptionsBackend.get('name_attribute');
      displaySimpleName = OptionsBackend.get('display_simple_name');
      hiddenFooter = OptionsBackend.get('hidden_footer');
      aggressiveFlat = OptionsBackend.get('aggressive_flat');;
    }

    // Text Contents
    var content = this.parseEntities(text, entities);

    // timestamp
    var statusLinkSpan;
    if(!hiddenTimestamp) {
      var statusLinkDst = TwitterLib.URLS.BASE + user.screen_name + '/status/' + tweetId;
      statusLinkSpan = $($.parseHTML('<span class="timestamp"><a title="' + Renderer.getTimestampAltText(tweet.created_at) + '" href="' + statusLinkDst + '">' + Renderer.getTimestampText(tweet.created_at) + '</a></span>'));
      if(Renderer.isOnPage()) {
        statusLinkSpan.find('a').attr('target', '_blank');
      } else {
        AnyClick.anyClick(statusLinkSpan.find('a')[0], function() {openTab(statusLinkDst);});
      }
    }

    // tweet space
    var overlayStyle = '', profile_container = '', footer_container = '', newActions_container = '';
    if(!hiddenUserIcons) {
      profile_container = '<div class="profile_container"></div>';
    }
    if(!hiddenFooter) {
      footer_container = '<div class="footer_container"></div>';
    }
    if(this.isComplete()) {
      if(useColors) overlayStyle = 'background-color: ' + TimelineTemplate.getTemplate(templateId).overlayColor + ';';
      newActions_container = '<div class="new_actions"></div>';
    }
    var tweetSpace = $($.parseHTML('<div class="tweet_space"><div class="chromed_bird_tweet tweet" timelineid="' + tweetTimeline + '" tweetid="' + tweet.id + '"><div class="tweet_overlay" style="' + overlayStyle + '"><div class="first_container">' + profile_container + '<div class="header_container"></div><div class="text_container"></div>' + footer_container + '</div>' + newActions_container + '</div></div></div>'));

    // profile_container
    if(!hiddenUserIcons) {
      if(tweet.retweeted_status) {
        tweetSpace.find('.profile_container').html($.parseHTML('<img data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu profile retweet_source" src="' + user.profile_image_url + '"/><img data-create-user-action-menu="' + tweet.user.screen_name + '" class="createUserActionMenu profile retweet_retweeter" src="' + tweet.user.profile_image_url + '"/>'));
      } else {
        tweetSpace.find('.profile_container').html($.parseHTML('<img data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu profile" src="' + user.profile_image_url + '" />'));
     }
    }

    // header_container
    var userName = '', userVerified = '', userProtected = '', bothContent = '</div><div class="secondary_name">';
    if(user.verified && !displaySimpleName) {
      userVerified = '<img class="verified" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAhhJREFUOI21lL9rU1EUxz/3xkblVWpThBbBOHRqC4JYmvaP0KXFMdWxQkFcpB0sBcX/wcHUuphOukl3IVS3pjgUbBRtiphGSNIkL+8ch/fDmCalKB64vHMf5/vh3i/nXPjfIaKOiN4T0U0R/SKiGnw3g//OaUFzIloMAL1WUURnO7WmA/QQeAKYrbLLi69NcmWXbzWXkZjHVCJO+orDZOIsgAJL1pqnx2AiOge8aomaR7tHrB8oWAsK6rVQtwnNOgDppMPq2AAxYxS4ba3ZiGCBB7vA8NLHCi+/G8yZuA9DfVizidZrIF4EfDx+EaAIjFprqjY42DwwvHXYYH3f9SHhMhZjLCbYzwzFAVgrVHl/2AAYDvSEsFsAmb2a74QGlqgSmqMoM4k+NlKXIo+f71XD9GY7bBwgV6r7V/JapPoFghyvxcwFw8bkICs75QiWKzXCdKIdNgRQcgVcl+l+ITsRJ+V4qNtg2hGy1/vJ7FV49ik6jV/fpg9hPwASfb7h7w4qZAo1stfOc/+yiUDL+Z+0h1//Wx/u8gBTfv8AsLx9yNviEQ9Gu4M66rfbYa8B5pN/TsndDyVWdspdQQB3rkb1b6BLny3ny6wVql3F7dGzz6w1VWAR0NWxAdLJk+c4nAD8rlkM9CfMZqnB2ucquVKT/brHyLkYqUScdNLhxmD32TwWIjr7t69GL6Ajogs93rOFU79n/xK/AOwlZ8v3V4kXAAAAAElFTkSuQmCC" alt="verified" />';
    }
    if(user['protected'] && !displaySimpleName) {
      userProtected = '<img class="protected" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAcdJREFUOI2t0r2PEkEYBvB3CMMQMpnrZKc5EqNHs8Tef8Aavdy6dFpuBQ3d2GBDA60WJjYs2Zx4vYV21iZsgL3CBBo+ut2sGSZwGRsv4ZBFRJ9mineeXzHzAvzHoKSB67r3R6NRQ0r5fL1eo3Q6rXO5XLdYLL6qVCrfD8ba7fbjxWLxablc5hhjc6VUjxByHkXRvWw2+yOfzz+pVqtf/4h1u91Cv9//tlqtGGPsXAhxdTtrNBrlKIo+YIyjUqn0yLbtyWY3tY0FQdCSUp4wxi42IQAAIcQVY+xCSnkSBEF7u3sH63Q6D8MwLFNKPwsherueQAjRo5R+CcOw7Lrug0RsOBzaAIA45293QbfhnL8BADQYDOxELJPJ2BjjG8dxLvdhjuNcYoxvCCF3MAQA0Gw2X8zn83da68RVSQpCSBuG8bJer79PAQDMZrPTJIhSOkEIvaaUTnbNtdZoOp0WAHb85hY0Nk3zrNVqCdM0zyil433392JKqZ5lWQoAwLIspZT6eDRGCHnmeR4BAPA8jxBCnh6NxXFc8H3/GgDA9/3rOI4LR2O/wNPN85+wv8lBWK1W0wdjhmGMEUIHFX4DUinNOd+7MkflJzFosUyNaRQGAAAAAElFTkSuQmCC" alt="protected" />';
    }
    if(displaySimpleName) {
      bothContent = '';
    }
    if(nameAttribute == "both") {
      userName = '<div class="primary_name"><a href="#" data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu user" screen_name="' + user.screen_name + '">' + user.name + '</a>' + userVerified + userProtected + bothContent + '<a href="#" data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu user" screen_name="' + user.screen_name + '">@' + user.screen_name + '</a></div>';
    } else if(nameAttribute == "screen_name") {
      userName = '<div class="primary_name"><a href="#" data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu user" screen_name="' + user.screen_name + '" title="' + user.name + '">@' + user.screen_name + '</a>' + userVerified + userProtected + '</div>';
    } else if(nameAttribute == "name") {
      userName = '<div class="primary_name"><a href="#" data-create-user-action-menu="' + user.screen_name + '" class="createUserActionMenu user" screen_name="' + user.screen_name + '" title="@' + user.screen_name + '">' + user.name + '</a>' + userVerified + userProtected + '</div>';
    }
    tweetSpace.find('.header_container').html(userName);
    if(!Renderer.isNotification() && !hiddenTimestamp) {
      tweetSpace.find('.header_container').prepend(statusLinkSpan);
    }

    // text_container
    tweetSpace.find('.text_container').html(content);
    if(tweet.retweeted_status) {
      tweetSpace.find('.text_container').prepend('<img class="retweet" alt="retweet" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAatJREFUOI2dlDGPGjEQhZ/Xl9WuRCRAQrnkn4SO607p0llCWome1HRHqKjpaJCo6NKl5dJE+Qm0VKFxgdgVMja2r4lXXs6rwL3qeTz+RrbGQ+BpNBo94QZNp9Pv/po4Mx6Pfx4Oh8/+plIKSimcz2dorWGMgbW2AkzT9M98Pv8CAHcuyDl/bLfbxE/M8xxCCEgpobWGtfYVTCn16HzkjDGmArpB5bm7uozJZFILZ4zZUDwKBd+qEhZFUVmNUhqs/D+V1+x2u9+EEF8BIEmSH6Hkfr//V2v98TLOGLOU0l3lXbIsWwPAcrl8CMEGg0FXCPHLWvvOjxNCVJIkvRKWZdlaStkDgDiOn68FOtBisfhNLkFO1wABwIEAgIRA1wIBEAcCvIZjjBlvbVerVW3bzGazHef8HgA6nc5uOBx+Aqp9Rmr8K3HOPzi/2WzunX9r0wYL136nLMvWlFLEcYw0TdFoNNBqtdBsNrHdboNnfJj1q0gpe4QQnE4nHI9HFEWBoiiw3+8vGeVvKWFRFBXGmPeVrH8jx1oLYwyUUsjzvEJKkkSG7n7zpAWq0/YFBaXPbFGysNUAAAAASUVORK5CYII="/>');
    }

    // footer_container
    if(Renderer.isNotification()) {
      tweetSpace.find('.footer_container').html(statusLinkSpan);
      return tweetSpace;
    }
    if(this.isComplete() && !hiddenFooter) {
      var footerContent = '';
      // reply
      if(tweet.in_reply_to_status_id) {
        footerContent += '<span class="inReply">' + chrome.i18n.getMessage("inReply_prefix") + '<a href="#">' + tweet.in_reply_to_screen_name + '</a>' + chrome.i18n.getMessage("inReply_suffix") + '</span>';
      }
      // retweet
      if(tweet.retweeted_status) {
        if(tweet.user.screen_name == tweetManager.twitterBackend.username()) {
          if(!tweetManager.isRetweet(tweet)) {
            tweetManager.retweets[tweetId] = tweet.id;
          }
          footerContent += '<span class="selfRetweet">' + chrome.i18n.getMessage("retweetedByMe") + '</span>';
        } else {
          footerContent += '<span class="inRetweet">' + chrome.i18n.getMessage("retweetedBy_prefix") + '<a href="' + TwitterLib.URLS.BASE + tweet.user.screen_name + '" data-create-user-action-menu="' + tweet.user.screen_name + '" class="createUserActionMenu">' + tweet.user.screen_name + '</a>' + chrome.i18n.getMessage("retweetedBy_suffix") + '</span>';
        }
        if(tweet.retweet_count > 0) {
          footerContent += '<span class="retweetCount">' + chrome.i18n.getMessage("retweetedCount_prefix") + tweet.retweet_count + chrome.i18n.getMessage("retweetedCount_suffix") + '</span>';
        }
      }
      // from App
      if(tweet.source) {
        footerContent += '<span class="from_app">' + chrome.i18n.getMessage("fromApp_prefix") + tweet.source + chrome.i18n.getMessage("fromApp_suffix") + '</span>';
      }
      // DM
      if(templateId == TimelineTemplate.SENT_DMS) {
        footerContent += '<span class="dm_recipient">' + chrome.i18n.getMessage("sentTo_prefix") + '<a href="#" data-create-user-action-menu="' + tweet.recipient.screen_name + '" class="createUserActionMenu">' + tweet.recipient.name + '</a>' + chrome.i18n.getMessage("sentTo_suffix") + '</span>';
      }
      // geo
      if(tweet.geo) {
        var coords = tweet.geo.coordinates;
        if(typeof coords[0] != 'number') {
          coords[0] = 0.0;
        }
        if(typeof coords[1] != 'number') {
          coords[1] = 0.0;
        }
        var href = "http://maps.google.com/maps?q=loc:" + coords[0] + "," + coords[1] + " " + encodeURI("(" + tweet.user.screen_name + ")");
        footerContent += '<span class="geo_tag"><a href="#"><img src="data:image/gif;base64, R0lGODlhCgAKAMZZAKRFP7NDN5s5RphLU6dUTLdpVbVZbopycK1vZKNxZqxyZ79oe8hSRMVST8xdTNJaWcRlU8FlWtNzXdVpZsh5atN6aKqEe7yFfsaGa8uVe9GUf791hN55h4yGiI6FipuRkKqHhbasrbi2t8KZg8Cal8mRmuObjMehls+nn/2njvewnMO+u8m6v/ykoPCusubFvsG6wv+/yM3Ex//Lz+7Qxe/Ryf/J2f/lzf/l4f/m5//j7//t7P/47f3z8f/19f/39f/88P/59P/49v/59//69v/69/L6/Pb6/fr4+fj6+f/7+fr8+f79+//9+/z5///4//z7//37///6/v/6//n//fn+//v+//39/f/9/f///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////yH5BAEAAH8ALAAAAAAKAAoAAAdJgH+CfyUbBgs2g38gMzMcAgMugjQXLRMPDQAEgi8KEAEMDhUFgwkUEBIpGBmDFggmKhojgywHJCgkijAeIYqCMh0ivoIfK8OCgQA7"/></a></span>';
      }
      // from list
      if(templateId == TimelineTemplate.LISTS && tweetManager.currentTimelineId != tweetTimeline) {
        var list = tweetManager.getList(tweetTimeline);
        if(list !== null) {
          var linkPath = list.uri.substr(1);
          footerContent += '<span class="from_list">(' + chrome.i18n.getMessage("f_footer_list") + ': <a href="' + TwitterLib.URLS.BASE + linkPath + '" title="@' + linkPath + '">' + list.name + '</a>)</span>';
        }
      }

      // fotterContent apply here
      tweetSpace.find('.footer_container').html($.parseHTML(footerContent));

      // bind events for link
      if(tweet.in_reply_to_status_id) {
        AnyClick.anyClick(tweetSpace.find('.inReply').find('a')[0], function() {
          Renderer.toggleInReply(tweet, tweetSpace);
        });
        Renderer.expandInReply(tweet, tweetSpace, true);
      }
      if(tweet.source) {
        var sourceAnchor = tweetSpace.find('.from_app').find('a');
        if(sourceAnchor.length > 0) {
          var sourceHref = sourceAnchor.attr('href');
          AnyClick.anyClick(sourceAnchor[0], function() {
            openTab(sourceHref);
          });
        }
      }
      if(tweet.geo) {
        AnyClick.anyClick(tweetSpace.find('.geo_tag').find('a')[0], function() {
          openTab("http://maps.google.com/maps?q=loc:" + coords[0] + "," + coords[1] + " " + encodeURI("(" + tweet.user.screen_name + ")"));
        });
        tweetSpace.find('.geo_tag').tooltip({
          items: 'img',
          position: {
            my: "left bottom",
            at: "center top"
          },
          content: function() {
            var latStr = coords[0] + ',' + coords[1];
            return '<img src="http://maps.google.com/maps/api/staticmap?' + $.param({center: latStr, zoom: 15, size: '200x200', maptype: 'roadmap', markers: 'size:small|' + latStr, sensor: false}) + '" />';
          }
        });
      }
      if(templateId == TimelineTemplate.LISTS && tweetManager.currentTimelineId != tweetTimeline) {
        AnyClick.anyClick(tweetSpace.find('.from_list').find('a')[0], function() {
          openTab(TwitterLib.URLS.BASE + linkPath);
        });
      }
    }

    // new_actions
    if(this.isComplete()) {
      var newActionsContent = '';
      if(templateId != TimelineTemplate.RECEIVED_DMS && templateId != TimelineTemplate.SENT_DMS) {
        if(tweet.favorited) {
          newActionsContent += '<img class="starred" title="' + chrome.i18n.getMessage('unmarkFavorite') + '" src="img/star_hover.png" />';
        } else {
          newActionsContent += '<img class="unstarred" title="' + chrome.i18n.getMessage('markFavorite') + '" src="img/star.png" />';
        }
        newActionsContent += '<br />';
      }
      if(tweet.user.screen_name == tweetManager.twitterBackend.username()) {
        var titleStrig, confirmString, deleteTweetId;
        if(tweet.retweeted_status) {
          titleString = chrome.i18n.getMessage("deleteRT");
          confirmString = chrome.i18n.getMessage("deleteRTConfirm");
        } else {
          titleString = chrome.i18n.getMessage("Delete");
          confirmString = chrome.i18n.getMessage("deleteConfirm");
        }
        newActionsContent += '<img class="destroyIcon" title="' + titleString + '" src="img/delete.png" /><br /><div class="rt_confirm destroy">' + confirmString + '<a href="#" class="destroyYes">' + chrome.i18n.getMessage("Yes") + '</a> <a href="#" class="destroyNo">' + chrome.i18n.getMessage("No") + '</a></div>';
      } else {
        newActionsContent += '<img class="replyIcon" title="' + chrome.i18n.getMessage("Reply") + '" src="img/reply.png" /><br />';
        if(tweetManager.isRetweet(tweet)) {
          newActionsContent += '<img class="destroyIcon" title="' + chrome.i18n.getMessage("deleteRT") + '" src="img/delete.png" /><br /><div class="rt_confirm destroy">' + chrome.i18n.getMessage("deleteRTConfirm") + '<a href="#" class="destroyYes">' + chrome.i18n.getMessage("Yes") + '</a> <a href="#" class="destroyNo">' + chrome.i18n.getMessage("No") + '</a></div>';
        } else {
          if(templateId != TimelineTemplate.RECEIVED_DMS && templateId != TimelineTemplate.SENT_DMS && !user['protected']) {
            newActionsContent += '<img class="retweetIcon" title="' + chrome.i18n.getMessage("Retweet") + '" src="img/rt.png" /><br /><div class="rt_confirm">' + chrome.i18n.getMessage("retweetConfirm") + '<a href="#" class="retweetYes">' + chrome.i18n.getMessage("Yes") + '</a> <a href="#" class="retweetNo">' + chrome.i18n.getMessage("No") + '</a></div>';
          }
        }
        if(!user['protected']) {
          newActionsContent += '<img class="oldRTIcon" title="' + chrome.i18n.getMessage("oldRT") + '" src="img/share.png" />';
        }
      }

      // newActionsContent apply here
      tweetSpace.find('.new_actions').html($.parseHTML(newActionsContent));

      // bind events for new_actions
      var newActionsElement = tweetSpace.find('.new_actions');
      if(templateId != TimelineTemplate.RECEIVED_DMS && templateId != TimelineTemplate.SENT_DMS) {
        if(tweet.favorited) {
          newActionsElement.find('.starred').click(function() {
            Composer.unFavorite(this.parentNode.parentNode.parentNode);
          });
        } else {
          newActionsElement.find('unstarred').click(function() {
            Composer.favorite(this.parentNode.parentNode.parentNode);
          });
        }
      }
      if(tweet.user.screen_name == tweetManager.twitterBackend.username()) {
        newActionsElement.find('.destroyIcon').click(function() {
          Composer.destroy(this.parentNode.parentNode.parentNode, false);
        });
        newActionsElement.find('.destroyYes').click(function() {
          Composer.confirmDestroy();
        });
        newActionsElement.find('.destroyNo').click(function() {
          Composer.denyDestroy();
        });
      } else {
        newActionsElement.find('.replyIcon').click(function() {
          Composer.reply(this.parentNode.parentNode.parentNode);
        });
        if(tweetManager.isRetweet(tweet)) {
          newActionsElement.find('.destroyIcon').click(function() {
            Composer.destroy(this.parentNode.parentNode.parentNode, false);
          });
          newActionsElement.find('.destroyYes').click(function() {
            Composer.confirmDestroy();
          });
          newActionsElement.find('.destroyNo').click(function() {
            Composer.denyDestroy();
          });
        } else {
          if(templateId != TimelineTemplate.RECEIVED_DMS && templateId != TimelineTemplate.SENT_DMS && !user['protected']) {
            newActionsElement.find('.retweetIcon').click(function() {
              Composer.retweet(this.parentNode.parentNode.parentNode);
            });
            newActionsElement.find('.retweetYes').click(function() {
              Composer.confirmRT();
            });
            newActionsElement.find('.retweetNo').click(function() {
              Composer.denyRT();
            });
          }
        }
        if(!user['protected']) {
          newActionsElement.find('.oldRTIcon').click(function() {
            Composer.share(this.parentNode.parentNode.parentNode);
          });
        }
      }
    }
    if(aggressiveFlat) {
      tweetSpace.find('br').remove();
      tweetSpace.find('img').removeClass().css({maxWidth: "16px", maxHeight: "16px"});
      tweetSpace.find('.tweet').css({padding: "0"});
      tweetSpace.find('.tweet_overlay').removeClass();
      tweetSpace.find('.first_container').find('div').removeClass().css({display: "inline", wordWrap: "break-word", margin: "4px"});
      tweetSpace.find('.new_actions').css({position: "static", display: "inline-box"});
    }
    return tweetSpace;
  },

  createUserActionMenu: function(element, username) {
    if(Renderer.isOnPage()) {
      if(element.nodeName.toLowerCase() == 'a') {
        element.attr({href: TwitterLib.URLS.BASE + username, target: '_blank'});
      } else {
        element.wrap('<a href="' + TwitterLib.URLS.BASE + username +'" target="_blank" />');
      }
      return;
    } else if(Renderer.isNotification()) {
      AnyClick.anyClick(element, function(event) {
        openTab(TwitterLib.URLS.BASE + username);
      });
      return;
    }
    var reloadTimeline = function() {
      if(tweetManager.currentTimelineId == TimelineTemplate.UNIFIED || tweetManager.currentTimelineId == TimelineTemplate.HOME) {
        prepareAndLoadTimeline();
      }
    };
    $(element).actionMenu({
      showMenu: function(event) {
        if(event.isAlternateClick) {
          openTab(TwitterLib.URLS.BASE + username);
          return false;
        }
        return true;
      },
      actions: [
        {
          name: chrome.i18n.getMessage("tweets_action"),
          action: function(event) {
            var searchQuery = 'from:' + username;
            TimelineTab.addNewSearchTab(searchQuery, event.isAlternateClick);
          }
        },
        {
          name: chrome.i18n.getMessage("profile_action"),
          action: function() {
            openTab(TwitterLib.URLS.BASE + username);
          }
        },
        {
          name: chrome.i18n.getMessage("add_mention_action"),
          action: function() {
            Composer.addUser(['@' + username]);
          },
          condition: function() {
            return ($("#compose_tweet_area").css("display") != 'none');
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
            }, username);
          },
          condition: function() {
            var followingUsers = tweetManager.getFollowingUsersMap();
            return !$.isEmptyObject(followingUsers) && !followingUsers.hasOwnProperty(username);
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
            }, username);
          },
          condition: function() {
            var followingUsers = tweetManager.getFollowingUsersMap();
            return !$.isEmptyObject(followingUsers) && followingUsers.hasOwnProperty(username);
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
            }, username);
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
            }, username);
          },
          second_level: true
        }
      ],
      parentContainer: '.inner_timeline'
    });
  },

  expandInReply: function(tweet, target, showIfVisible) {
    if(showIfVisible && !tweet.replyVisible) {
      return;
    }

    $("#loading").show();
    tweetManager.getInReplyToTweet(function(success, data, status) {
      if(success) {
        tweet.replyVisible = true;
        var renderedTweet = Renderer.renderTweet(data, false);
        var separator = $(document.createElement('div'))
        .addClass('reply_separator')
        .text("\u2193")
        .click(function() {
          Renderer.toggleInReply(tweet, target);
        })
        .prependTo(renderedTweet);
        target.append(renderedTweet);
        
        if(!showIfVisible) {
          $(renderedTweet).show('blind', { direction: "vertical" });
        }
      }
      $("#loading").hide();
    }, tweet);
  },

  toggleInReply: function(tweet, target) {
    if(tweet.replyVisible) {
      tweet.replyVisible = false;
      var tweetSpace = $(target).find("[tweetid='" + tweet.in_reply_to_status_id + "']").parents('.tweet_space');
      tweetSpace.first().hide('blind', { direction: "vertical" }, 'normal', function() {
        $(this).remove();
      });
      return;
    }

    Renderer.expandInReply(tweet, target);
  },

  assemblyTweetsOnPage: function (tweets, fadeTimeout) {
    var tweetsArray = [];
    for(var i = 0; i < tweets.length; ++i) {
      tweetsArray[i] = Renderer.renderTweet(tweets[i], false);
    }
    var existingDestination = $("#chromed_bird_container");
    if(existingDestination.length == 1) {
      existingDestination.append(tweetsArray);
    } else {
      var d = document,
          destination = $(d.createElement('div')).attr('id', 'chromed_bird_container');
      var closeLink = $(d.createElement('a'))
        .attr({id: 'close_trigger', href: '#'})
        .text("Close")
        .on('click', function(ev) {
          ev.preventDefault();
          destination.remove();
        });
      var controlBar = $(d.createElement('div'))
        .attr('id', 'chromed_bird_control')
        .append($(d.createElement('span')).text(' ' + chrome.i18n.getMessage("changeNotificationSettings")))
        .append(closeLink);
      destination
        .append(controlBar)
        .append(tweetsArray)
        .hide()
        .prependTo(d.body)
        .slideDown('fast', function(){
          $(this)
            .fadeOut(fadeTimeout, this.remove)
            .hover(
              function() {
                $(this).stop().show().css('opacity', '1.0');
              },
              function() {
                $(this).fadeOut(fadeTimeout, this.remove);
              }
            );
        });
    }
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
  if(!background || Renderer.isNotification()) {
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

if(location.protocol != 'chrome-extension:' && document.body.tagName != 'FRAMESET') {
  chrome.runtime.sendMessage({
    cb_requesting_tweets: true,
    frame_area: $(window).width() * $(window).height()
  }, function(response) {
    var tweets = response.tweets;
    if(tweets && tweets.length > 0) {
      Renderer.setContext('onpage');
      Renderer.assemblyTweetsOnPage(tweets, response.fadeTimeout);
    }
  });
}
