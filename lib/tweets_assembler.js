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
    var diff = ($.now() - Date.parse(inputTimestampStr)) / 1000;

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
    return [new Date(inputTimestamp).toLocaleDateString(), new Date(inputTimestamp).toLocaleTimeString()].join(' ');
  },

  expandImageLink: function (url) {
    var thumbUrl = null;
    thumbUrl = ImageService.getThumb(url);
    if(!thumbUrl && /\.(png|jpg|jpeg|gif|bmp|tiff)$/.test(url)) thumbUrl = url;
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
      AnyClick.anyClick(link[0], function(ev) {
        if(Renderer.isNotification() || !OptionsBackend.get('open_searches_internally')) {
          openTab(TwitterLib.URLS.SEARCH + "%23" + value);
        } else {
          TimelineTab.addNewSearchTab('#' + value, ev.isAlternateClick);
        }
      });
    },
    handleLink: function(link, baseUrl, expandedUrl, mediaUrl) {
      var toExpandUrl = mediaUrl || expandedUrl || baseUrl;
      AnyClick.anyClick(link[0], function() {
        openTab(baseUrl);
      });
      if(!OptionsBackend.get('show_expanded_urls') || !Renderer.isComplete()) {
        return;
      }
      var url = Renderer.expandImageLink(toExpandUrl),
          changeContent = null,
          d = document,
          cloneBaseImage = $(d.createElement('img')),
          loadingEl = $(d.createElement('span')).append(cloneBaseImage.clone().attr('src', "img/loading.gif"));
      var loadImage = function(url) {
        var img = new Image();
        img.onload = function() {
          $('.ui-tooltip-content').html(img);
        };
        img.src = url;
      };
      link.tooltip({
        items: '*',
        position: {
          my: 'center top+10',
          within: '.inner_timeline'
        },
        content: function() {
          if(url) {
            loadImage(url);
            return loadingEl.clone().append(chrome.i18n.getMessage("loadingImage"));
          }
          urlExpander.expand(toExpandUrl, function expanded(success, isShortened, longUrl) {
            var changeContent = null;
            if(!isShortened) {
              changeContent = link.attr('title') || link.text();
            } else {
              var reCheck = Renderer.expandImageLink(longUrl);
              if(reCheck) {
                loadImage(reCheck);
                // no changeContent
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
          return loadingEl.clone().append(chrome.i18n.getMessage("loadingLongUrl"));
        }
      });
    }
  },

  parseEntities: function(text, entities) {
    var mapFunc = this.entitiesFuncs.typeMap,
        sortFunc = this.entitiesFuncs.indexSort;

    var mediaEntities = entities.media || [];

    var orderedEntities = [].concat(
        entities.hashtags.map(mapFunc('hashtag')),
        entities.urls.map(mapFunc('url')),
        entities.user_mentions.map(mapFunc('mention')),
        mediaEntities.map(mapFunc('media')));
    var d = document, cloneBaseAnchor = $(d.createElement('a')).attr('href', '#');

    orderedEntities.sort(sortFunc);

    var totalInc = 0,
        elements = d.createDocumentFragment(),
        i, len, entity, indices, link, textContent;

    for (i = 0, len = orderedEntities.length; i < len; ++i) {
      entity = orderedEntities[i];
      indices = entity.indices;
      link = null;

      textContent = d.createElement("span");
      textContent.innerHTML = text.substring(totalInc, indices[0]).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      elements.appendChild(Renderer.makeTweetText(textContent.textContent));

      if (entity.type === 'mention') {

        elements.appendChild(Renderer.makeText('@'));
        link = cloneBaseAnchor.clone().text(entity.screen_name);
        Renderer.createUserActionMenu(link, entity.screen_name);

      } else if (entity.type === 'hashtag') {

        link = cloneBaseAnchor.clone().text('#' + entity.text);
        this.entitiesFuncs.handleHashTag(link, entity.text);

      } else if (entity.type === 'url' || entity.type === "media" || entity.type === "photo") {

        entity.display_url = entity.display_url || entity.url;

        link = cloneBaseAnchor.clone().attr('href', entity.url).text(entity.display_url);
        if (entity.display_url[entity.display_url.length - 1].charCodeAt(0) == 8230) { // Ends with ...
          link.attr('title', entity.expanded_url);
        }

        this.entitiesFuncs.handleLink(link, entity.url, entity.expanded_url, entity.media_url);

      } else {

        textContent = d.createElement("span");
        textContent.innerHTML = text.substring(indices[0], indices[1]).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        elements.appendChild(Renderer.makeTweetText(textContent.textContent));

      }

      if (link) {
        link.appendTo(elements);
      }

      totalInc = indices[1];
    }

    textContent = d.createElement("span");
    textContent.innerHTML = text.substring(totalInc, text.length).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    elements.appendChild(Renderer.makeTweetText(textContent.textContent));

    return elements;
  },

  makeText: function (content) {
    return document.createTextNode(content);
  },

  makeTweetText: function (content) {
    var d = document;
    var splited = content.split(/\r?\n/);
    var result = d.createElement("span");
    for(var i = 0, j = splited.length; i < j; i++) {
      result.appendChild(d.createTextNode(splited[i]));
      if(i < j - 1) result.appendChild(d.createElement('br'));
    }
    return result;
  },

  renderTweet: function (tweet, useColors, nameAttribute) {
    var d = document;
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
    var content = this.parseEntities(text, entities);

    var tweetTimeline = 'home';
    if(!this.isOnPage()) {
      tweetTimeline = tweet.originalTimelineId || tweet.timelineId || tweetManager.currentTimelineId;
    }
    var templateId = tweetTimeline.replace(/_.*$/, '');
    var tweetClass = 'chromed_bird_tweet tweet';
    var cloneBaseImg = $(d.createElement("img")),
        cloneBaseAnchor = $(d.createElement('a')).attr('href', '#'),
        cloneBaseSpan = $(d.createElement("span")),
        cloneBaseDiv = $(d.createElement("div")),
        cloneBaseBr = $(d.createElement("br"));

    // timestamp
    var statusLinkDst = [TwitterLib.URLS.BASE, user.screen_name, '/status/', tweetId].join('');
    var statusLinkSpan = cloneBaseSpan.clone().addClass('timestamp');
    var statusLink = cloneBaseAnchor.clone()
      .attr({title: Renderer.getTimestampAltText(tweet.created_at), href: statusLinkDst})
      .text(Renderer.getTimestampText(tweet.created_at))
      .appendTo(statusLinkSpan);
    AnyClick.anyClick(statusLink[0], function() {openTab(statusLinkDst);});

    // tweet space
    var tweetSpace = cloneBaseDiv.clone()
      .addClass('tweet_space');
    var container = cloneBaseDiv.clone()
      .addClass(tweetClass)
      .attr({timelineid: tweetTimeline, tweetid: tweet.id})
      .appendTo(tweetSpace);

    var overlayStyle = '';
    if(this.isComplete() && useColors) {
      overlayStyle = ['background-color: ', TimelineTemplate.getTemplate(templateId).overlayColor, ';'].join('');
    }
    var overlay = cloneBaseDiv.clone()
      .addClass('tweet_overlay')
      .attr('style', overlayStyle)
      .appendTo(container);
    // Now in container -> overlay

    var first_container = cloneBaseDiv.clone()
      .addClass('first_container')
      .appendTo(overlay);

    var profileDiv = cloneBaseDiv.clone()
      .addClass('profile')
      .appendTo(first_container);
    // now in container -> overlay -> first_container -> profileDev
    if(tweet.retweeted_status) {
      var img1 = cloneBaseImg.clone()
        .addClass('profile retweet_source')
        .attr('src', user.profile_image_url)
        .appendTo(profileDiv);
      var img2 = cloneBaseImg.clone()
        .addClass('profile retweet_retweeter')
        .attr('src', tweet.user.profile_image_url)
        .appendTo(profileDiv);
      Renderer.createUserActionMenu(img1, user.screen_name);
      Renderer.createUserActionMenu(img2, tweet.user.screen_name);
    } else {
      var img = cloneBaseImg.clone()
        .addClass('profile')
        .attr('src', user.profile_image_url)
        .appendTo(profileDiv);
      Renderer.createUserActionMenu(img, user.screen_name);
    }

    var headerDiv = cloneBaseDiv.clone()
     .addClass('header')
     .appendTo(first_container);
    // now in container -> overlay -> first_container -> headerDev
    if(!Renderer.isNotification()) {
      statusLinkSpan.appendTo(headerDiv);
    }

    var primaryUserName;
    var primaryNameDiv = cloneBaseDiv.clone()
      .addClass('primary_name')
      .appendTo(headerDiv);
    if(nameAttribute == "both") {
      primaryUserName = cloneBaseAnchor.clone()
        .addClass('user')
        .attr({href: '#', screen_name: user.screen_name, title: ''})
        .text(user.name)
        .appendTo(primaryNameDiv);
      var secondaryNameDiv = cloneBaseDiv.clone()
        .addClass('secondary_name')
        .appendTo(headerDiv);
      var secondaryUserName = cloneBaseAnchor.clone()
        .addClass('user')
        .attr({href: '#', screen_name: user.screen_name, title: ''})
        .text("@" + user.screen_name)
        .appendTo(secondaryNameDiv);
      Renderer.createUserActionMenu(secondaryUserName, user.screen_name);
    } else if(nameAttribute == "screen_name") {
      primaryUserName = cloneBaseAnchor.clone()
        .addClass('user')
        .attr({href: '#', screen_name: user.screen_name, title: user.name})
        .text("@" + user.screen_name)
        .appendTo(primaryNameDiv);
    } else if(nameAttribute == "name") {
      primaryUserName = cloneBaseAnchor.clone()
        .addClass('user')
        .attr({href: '#', screen_name: user.screen_name, title: "@" + user.screen_name})
        .text(user.name)
        .appendTo(primaryNameDiv);
    }
    Renderer.createUserActionMenu(primaryUserName, user.screen_name);

    if(user.verified) {
      cloneBaseImg.clone()
        .addClass('verified')
        .attr({src: 'img/verified.png', alt: 'verified'})
        .appendTo(primaryNameDiv);
    }
    if(user['protected']) {
      cloneBaseImg.clone()
        .addClass('protected')
        .attr({src: 'img/lock.png', alt: 'protected'})
        .appendTo(primaryNameDiv);
    }

    var textDiv = cloneBaseDiv.clone()
      .addClass('text')
      .append(content)
      .appendTo(first_container);
    // now in: container -> overlay -> first_container -> textDiv
    if(tweet.retweeted_status) {
      cloneBaseImg.clone()
        .addClass('retweet')
        .attr({src: 'img/retweet.png', alt: 'retweet'})
        .prependTo(textDiv);
    }

    // exiting textDiv, now container -> overlay -> first_container

    var footer = cloneBaseDiv.clone()
      .addClass('footer')
      .appendTo(first_container);
    // now in container -> overlay -> footer
    if(Renderer.isNotification()) {
      statusLinkSpan.appendTo(footer);
    }

    // reply
    if(tweet.in_reply_to_status_id) {
      var linkDst = [TwitterLib.URLS.BASE, tweet.in_reply_to_screen_name, '/status/', tweet.in_reply_to_status_id].join('');
      var inReply = cloneBaseAnchor.clone()
        .text(tweet.in_reply_to_screen_name);
      var replyAction;
      if(this.isNotification()) {
        replyAction = function() {
          openTab(linkDst);
        };
      } else {
        replyAction = function() {
          Renderer.toggleInReply(tweet, tweetSpace);
        };
      }
      AnyClick.anyClick(inReply[0], replyAction);
      Renderer.expandInReply(tweet, tweetSpace, true);
      cloneBaseSpan.clone()
        .addClass('inReply')
        .append(Renderer.makeText(chrome.i18n.getMessage("inReply_prefix")))
        .append(inReply)
        .append(Renderer.makeText(chrome.i18n.getMessage("inReply_suffix")))
        .appendTo(footer);
    }

    // retweet
    if(tweet.retweeted_status) {
      if(tweet.user.screen_name == tweetManager.twitterBackend.username()) {
        if(!tweetManager.isRetweet(tweet)) {
          tweetManager.retweets[tweetId] = tweet.id;
        }
        cloneBaseSpan.clone()
          .addClass('selfRetweet')
          .append(Renderer.makeText(chrome.i18n.getMessage("retweetedByMe")))
          .appendTo(footer);
      } else {
        var rtLink = cloneBaseAnchor.clone()
          .attr('href', TwitterLib.URLS.BASE + tweet.user.screen_name)
          .text(tweet.user.screen_name);
        Renderer.createUserActionMenu(rtLink, tweet.user.screen_name);
        cloneBaseSpan.clone()
          .addClass('inRetweet')
          .append(Renderer.makeText(chrome.i18n.getMessage("retweetedBy_prefix")))
          .append(rtLink)
          .append(Renderer.makeText(chrome.i18n.getMessage("retweetedBy_suffix")))
          .appendTo(footer);
      }
      if(tweet.retweet_count > 0 && this.isComplete()) {
        cloneBaseSpan.clone()
          .addClass('retweetCount')
          .append(Renderer.makeText(chrome.i18n.getMessage("retweetedCount_prefix")))
          .append(Renderer.makeText(tweet.retweet_count))
          .append(Renderer.makeText(chrome.i18n.getMessage("retweetedCount_suffix")))
          .appendTo(footer);
      }
    }

    // from App
    if(tweet.source && this.isComplete()) {
      cloneBaseSpan.clone()
        .addClass('from_app')
        .append(Renderer.makeText(chrome.i18n.getMessage("fromApp_prefix")))
        .append($.parseHTML(tweet.source))
        .append(Renderer.makeText(chrome.i18n.getMessage("fromApp_suffix")))
        .appendTo(footer);
    }

    // DM
    if(templateId == TimelineTemplate.SENT_DMS) {
      var recipientUsername = cloneBaseAnchor.clone().text(tweet.recipient.name);
      Renderer.createUserActionMenu(recipientUsername, tweet.recipient.screen_name);
      cloneBaseSpan.clone()
        .addClass('dm_recipient')
        .append(Renderer.makeText(chrome.i18n.getMessage("sentTo_prefix")))
        .append(recipientUsername)
        .append(Renderer.makeText(chrome.i18n.getMessage("sentTo_suffix")))
        .appendTo(footer);
    }

    // geo
    if(tweet.geo && this.isComplete()) {
      var coords = tweet.geo.coordinates;
      if(typeof coords[0] != 'number') {
        coords[0] = 0.0;
      }
      if(typeof coords[1] != 'number') {
        coords[1] = 0.0;
      }
      var href = ["http://maps.google.com/maps?q=loc:", coords[0], ",", coords[1], " ", encodeURI(["(", tweet.user.screen_name, ")"].join(''))].join('');
      var geo = cloneBaseAnchor.clone()
        .append(
          cloneBaseImg.clone()
            .attr('src', "data:image/gif;base64, R0lGODlhCgAKAMZZAKRFP7NDN5s5RphLU6dUTLdpVbVZbopycK1vZKNxZqxyZ79oe8hSRMVST8xdTNJaWcRlU8FlWtNzXdVpZsh5atN6aKqEe7yFfsaGa8uVe9GUf791hN55h4yGiI6FipuRkKqHhbasrbi2t8KZg8Cal8mRmuObjMehls+nn/2njvewnMO+u8m6v/ykoPCusubFvsG6wv+/yM3Ex//Lz+7Qxe/Ryf/J2f/lzf/l4f/m5//j7//t7P/47f3z8f/19f/39f/88P/59P/49v/59//69v/69/L6/Pb6/fr4+fj6+f/7+fr8+f79+//9+/z5///4//z7//37///6/v/6//n//fn+//v+//39/f/9/f///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////yH5BAEAAH8ALAAAAAAKAAoAAAdJgH+CfyUbBgs2g38gMzMcAgMugjQXLRMPDQAEgi8KEAEMDhUFgwkUEBIpGBmDFggmKhojgywHJCgkijAeIYqCMh0ivoIfK8OCgQA7")
        );
      AnyClick.anyClick(geo[0], function() {openTab(href);});
      cloneBaseSpan.clone()
        .addClass('geo_tag')
        .append(geo)
        .appendTo(footer)
        .tooltip({
          items: 'img',
          position: {
            my: "left bottom",
            at: "center top"
          },
          content: function() {
            var latStr = [coords[0], coords[1]].join(',');
            return cloneBaseImg.clone().attr('src', 'http://maps.google.com/maps/api/staticmap?' + $.param({
              center: latStr,
              zoom: 15,
              size: '200x200',
              maptype: 'roadmap',
              markers: 'size:small|' + latStr,
              sensor: false
            }));
          }
        });
    }

    // from list
    if(templateId == TimelineTemplate.LISTS && this.isComplete() && tweetManager.currentTimelineId != tweetTimeline) {
      var list = tweetManager.getList(tweetTimeline);
      if(list !== null) {
        var path = list.uri.substr(1);
        var listLink = cloneBaseAnchor.clone()
          .attr({href: TwitterLib.URLS.BASE + path, title: "@"+path})
          .text(list.name);
        AnyClick.anyClick(listLink[0], function() {openTab(TwitterLib.URLS.BASE + path);});
        cloneBaseSpan.clone()
          .addClass('from_list')
          .append(Renderer.makeText(['(', chrome.i18n.getMessage("f_footer_list"), ': '].join('')))
          .append(listLink)
          .append(Renderer.makeText(")"))
          .appendTo(footer);
      }
    }
    // exit footer, first_container, now in container -> overlay

    if(!this.isNotification()) {
      var actions = cloneBaseDiv.clone()
        .addClass('new_actions')
        .appendTo(overlay);
      if(templateId != TimelineTemplate.RECEIVED_DMS && templateId != TimelineTemplate.SENT_DMS) {
        if(tweet.favorited) {
          cloneBaseImg.clone()
            .addClass('starred')
            .attr({title: chrome.i18n.getMessage('unmarkFavorite'), src: 'img/star_hover.png'})
            .click(function() {
              Composer.unFavorite(this.parentNode.parentNode.parentNode);
            })
            .appendTo(actions);
        } else {
          cloneBaseImg.clone()
            .addClass('unstarred')
            .attr({title: chrome.i18n.getMessage('markFavorite'), src: 'img/star.png'})
            .click(function() {
              Composer.favorite(this.parentNode.parentNode.parentNode);
            })
            .appendTo(actions);
        }
        cloneBaseBr.clone().appendTo(actions);
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
        cloneBaseImg.clone()
          .attr({'title': titleString, 'src': 'img/delete.png'})
          .click(function() {
            Composer.destroy(this.parentNode.parentNode.parentNode, false);
          })
          .appendTo(actions);
        cloneBaseBr.clone().appendTo(actions);
        var confirmDeleteDiv = cloneBaseDiv.clone()
          .addClass('rt_confirm destroy')
          .text(confirmString)
          .append(
            cloneBaseAnchor.clone()
              .text(chrome.i18n.getMessage("Yes"))
              .click(function() {
                Composer.confirmDestroy();
              })
          )
          .append(Renderer.makeText(' '))
          .append(
            cloneBaseAnchor.clone()
              .text(chrome.i18n.getMessage("No"))
              .click(function() {
                Composer.denyDestroy();
              })
          )
          .appendTo(actions);
      } else {
        cloneBaseImg.clone()
          .attr({title: chrome.i18n.getMessage("Reply"), src: 'img/reply.png'})
          .click(function() {
            Composer.reply(this.parentNode.parentNode.parentNode);
          })
          .appendTo(actions);
        cloneBaseBr.clone().appendTo(actions);
        if(tweetManager.isRetweet(tweet)) {
          cloneBaseImg.clone()
            .attr({title: chrome.i18n.getMessage("deleteRT"), src: 'img/delete.png'})
            .click(function() {
              Composer.destroy(this.parentNode.parentNode.parentNode, true);
            })
            .appendTo(actions);
          cloneBaseBr.clone().appendTo(actions);
          var confirmDeleteDiv = cloneBaseDiv.clone()
            .addClass('rt_confirm destroy')
            .text(chrome.i18n.getMessage("deleteRTConfirm"))
            .append(
              cloneBaseAnchor.clone()
                .text(chrome.i18n.getMessage("Yes"))
                .click(function() {
                  Composer.confirmDestroy();
                })
            )
            .append(Renderer.makeText(' '))
            .append(
              cloneBaseAnchor.clone()
                .text(chrome.i18n.getMessage("No"))
                .click(function() {
                  Composer.denyDestroy();
                })
            )
            .appendTo(actions);
        } else {
          if(templateId != TimelineTemplate.RECEIVED_DMS && templateId != TimelineTemplate.SENT_DMS && !user['protected']) {
            cloneBaseImg.clone()
              .attr({title: chrome.i18n.getMessage("Retweet"), src: 'img/rt.png'})
              .click(function() {
                Composer.retweet(this.parentNode.parentNode.parentNode);
              })
              .appendTo(actions);
            cloneBaseBr.clone().appendTo(actions);
            var confirmRTDiv = cloneBaseDiv.clone()
              .addClass('rt_confirm')
              .text(chrome.i18n.getMessage("retweetConfirm"))
              .append(
                cloneBaseAnchor.clone()
                  .text(chrome.i18n.getMessage("Yes"))
                  .click(function() {
                    Composer.confirmRT();
                  })
              )
              .append(Renderer.makeText(' '))
              .append(
                cloneBaseAnchor.clone()
                  .text(chrome.i18n.getMessage("No"))
                  .click(function() {
                    Composer.denyRT();
                  })
              )
              .appendTo(actions);
          }
        }
        if(!user['protected']) {
          cloneBaseImg.clone()
            .attr({title: chrome.i18n.getMessage("oldRT"), src: 'img/share.png'})
            .click(function() {
              Composer.share(this.parentNode.parentNode.parentNode);
            })
            .appendTo(actions);
          cloneBaseBr.clone().appendTo(actions);
        }
      }
    }
    return tweetSpace;
  },

  createUserActionMenu: function(element, username) {
    if(Renderer.isNotification()) {
      AnyClick.anyClick(element[0], function(event) {
        openTab(TwitterLib.URLS.BASE + username);
      });
      return;
    }
    var reloadTimeline = function() {
      if(tweetManager.currentTimelineId == TimelineTemplate.UNIFIED || tweetManager.currentTimelineId == TimelineTemplate.HOME) {
        prepareAndLoadTimeline();
      }
    };
    element.actionMenu({
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
        var renderedTweet = Renderer.renderTweet(data, false, OptionsBackend.get('name_attribute'));
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
      var tweetSpace = $(target).find(["[tweetid='", tweet.in_reply_to_status_id, "']"].join('')).parents('.tweet_space');
      tweetSpace.first().hide('blind', { direction: "vertical" }, 'normal', function() {
        $(this).remove();
      });
      return;
    }

    Renderer.expandInReply(tweet, target);
  },

  assemblyTweetsOnPage: function (tweets, nameAttribute, fadeTimeout) {
    var tweetsArray = [];
    for(var i = 0; i < tweets.length; ++i) {
      tweetsArray[i] = Renderer.renderTweet(tweets[i], false, nameAttribute);
    }

    var existingDestination = $("#chromed_bird_container");
    if(existingDestination.length == 1) {
      existingDestination.append(tweetsArray);
    } else {
      var d = document, div = $(d.createElement('div'));
          destination = div.clone().attr('id', 'chromed_bird_container');
      var closeLink = $(d.createElement('a'))
        .attr({id: 'close_trigger', href: '#'})
        .text("Close")
        .on('click', function(ev) {
          ev.preventDefault();
          destination.remove();
        });
      var controlBar = div.clone()
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
            .fadeOut(fadeTimeout, $('chromed_bird_container').remove)
            .hover(
              function() {
                $(this).stop().show().css('opacity', '1.0');
              },
              function() {
                $(this).fadeOut(fadeTimeout, $('chromed_bird_container').remove);
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
  if(tabUrl.match(/^www/i)) {
    tabUrl = "http://" + tabUrl;
  }
  tabUrl.replace(/\W.*$/, "");
  if(!background || Renderer.isNotification()) {
    var obj =     chrome.tabs.create({
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
  chrome.extension.sendRequest({
    cb_requesting_tweets: true,
    frame_area: $(window).width() * $(window).height()
  }, function(response) {
    var tweets = response.tweets;
    if(tweets && tweets.length > 0) {
      Renderer.setContext('onpage');
      Renderer.assemblyTweetsOnPage(tweets, response.nameAttribute, response.fadeTimeout);
    }
  });
}
