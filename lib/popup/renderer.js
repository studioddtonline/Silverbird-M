$.extend(Renderer, {
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
        .css('display', 'inline-block');
      } else {
        $this
        .find('.new_actions_item')
        .not('.glyphicon-star')
        .css('display', 'none');
      }
    })
    .find('.new_actions')
    .on('click.popup', '.new_actions_item', function(event) {
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
    .end()
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
    var reloadTimeline = function() {
      if(tweetManager.currentTimelineId == TimelineTemplate.UNIFIED
      || tweetManager.currentTimelineId == TimelineTemplate.HOME) {
        prepareAndLoadTimeline();
      }
    };
    $(this).actionMenu({
      showMenu: function(event) {
        if(event.isAlternateClick) {
          openTab(TwitterLib.URLS.BASE + userName);
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
          action: function() {
            openTab(TwitterLib.URLS.BASE + userName);
          }
        },
        {
          name: chrome.i18n.getMessage("add_mention_action"),
          action: function() {
            Composer.addUser(['@' + userName]);
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
            }, userName);
          },
          condition: function() {
            return !(tweetManager.getFollowingIdsMap().has(userId));
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
            }, userName);
          },
          condition: function() {
            return tweetManager.getFollowingIdsMap().has(userId);
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
            }, userName);
          },
          condition: function() {
            return tweetManager.getMutingIdsSet().has(userId);
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
            }, userName);
          },
          condition: function() {
            return tweetManager.getMutingIdsSet().has(userId);
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
            }, userName);
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
            }, userName);
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
    AnyClick.anyClick(link, function(ev) {
      if(!OptionsBackend.get('open_searches_internally')) {
        openTab(TwitterLib.URLS.SEARCH + "%23" + value);
      } else {
        TimelineTab.addNewSearchTab(value, ev.isAlternateClick);
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
  },

  handleLinkEachFunc: function() {
    if(this.dataset.tooltipDoExpand) return;
    var baseUrl, expandedUrl, mediaUrl;
    baseUrl = (this.dataset.handleLinkBase === "undefined")? null: this.dataset.handleLinkBase;
    expandedUrl = (this.dataset.handleLinkExpanded === "undefined")? null: this.dataset.handleLinkExpanded;
    mediaUrl = (this.dataset.handleLinkMedia === "undefined")? null: this.dataset.handleLinkMedia;
    AnyClick.anyClick(this, function() {
      openTab(this.dataset.handleLinkBase);
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
          var reCheck = Renderer.expandImageLink(resultUrl);
          if(reCheck) {
            this.setAttribute('data-tooltip-content', '<img src="' + reCheck + '" />');
          } else {
            this.setAttribute('data-tooltip-content', '<p>' + result.get('url') + '</p>');
          }
        }
      }.bind(this)
    });
  },

  expandImageLink: function (url) {
    var thumbUrl = null;
    thumbUrl = ImageService.getThumb(url);
    if(!thumbUrl && /\.(png|jpg|jpeg|gif|bmp|tiff)(\?.*)?$/.test(url)) thumbUrl = url;
    return thumbUrl;
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
      } else if(status == 179 || status == 144){
        Renderer.showError(chrome.i18n.getMessage("ue_expand_in_reply"), null);
      } else {
        Renderer.showError(chrome.i18n.getMessage("undefined_message"), null);
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
  }
});
