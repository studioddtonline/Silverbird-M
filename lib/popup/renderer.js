$.extend(Renderer, {
  assemblyTweets: function (tweets, timelineId) {
    var destination = $("#timeline-" + timelineId).find(".inner_timeline");
    if(destination.length === 0) {
      destination = null;
      return;
    }
    var renderdText = '';

    AnyClick.clearEventListeners();
    for(var entry of tweets.entries()) {
      renderdText += Renderer.renderTweet(entry[1], true);
      tweetManager.readTweet(entry[1].id_str);
    }

    destination
    .empty()
    .html($.parseHTML(renderdText))
    .find('.handleLink')
    .each(Renderer.handleLinkEachFunc)
    .end()
    .on('mouseover mouseout', '.tweet', function(event) {
      var $this = $(this);
      if(event.type == 'mouseover') {
        if(!this.dataset.processed) {
          $this
          .find('.createUserActionMenu')
          .each(Renderer.createUserActionMenuFunc)
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
        .find('.new_actions img')
        .not('.starred')
        .css('display', 'inline-block');
      } else {
        $this
        .find('.new_actions img')
        .not('.starred')
        .css('display', 'none');
      }
    })
    .find('.new_actions')
    .on('click', 'img', function(event) {
      event.preventDefault();
      var targetClass = event.target.getAttribute('class'),
          targetNode = event.target.parentNode.parentNode.parentNode;
      switch(true) {
        case (targetClass.indexOf('unStarred') !== -1):
          Composer.favorite(targetNode);
          break;
        case (targetClass.indexOf('starred') !== -1):
          Composer.unFavorite(targetNode);
          break;
        case (targetClass.indexOf('retweetIcon') !== -1):
          Composer.retweet(targetNode);
          break;
        case (targetClass.indexOf('destroyIcon') !== -1):
          Composer.destroy(targetNode, false);
          break;
        case (targetClass.indexOf('destroyRTIcon') !== -1):
          Composer.destroy(targetNode, true);
          break;
        case (targetClass.indexOf('replyIcon') !== -1):
          Composer.reply(targetNode);
          break;
        case (targetClass.indexOf('oldRTIcon') !== -1):
          Composer.share(targetNode);
          break;
        default:
          break;
      }
      targetClass = null;
      targetNode = null;
    })
    .end()
    .tooltip({
      items: '.tooltip',
      content: function() {
        if(this.dataset.tooltipContent) {
          return this.dataset.tooltipContent;
        } else {
          return this.getAttribute('title') || this.textContent;
        }
      },
      close: function() {
        $('.ui-helper-hidden-accessible').remove();
      }
    });
    renderdText = null;
    destination = null;
  },

  createUserActionMenuFunc: function() {
    if(!this.dataset.userId || !this.dataset.userName) return;
    if(this.dataset.userId !== "1266336019"
    && this.dataset.userId !== 'undefined'
    && this.dataset.userName !== 'undefined') {
      Renderer.createUserActionMenu(this, this.dataset.userId, this.dataset.userName);
    }
    this.removeAttribute("data-user-id");
    this.removeAttribute("data-user-name");
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
        TimelineTab.addNewSearchTab('#' + value, ev.isAlternateClick);
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
    this.setAttribute('data-tooltip-content', '<p>' + baseUrl + '</p>');
    if(OptionsBackend.get('show_expanded_urls') && this.dataset.handleLinkNoexpand !== 'true') {
      this.setAttribute('data-tooltip-do-expand', (mediaUrl || expandedUrl || baseUrl));
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
        if(typeof result.get('content') !== 'undefined') {
          this.setAttribute('data-tooltip-content', result.get('content'));
        } else {
          var reCheck = Renderer.expandImageLink(result.get('url'));
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

  createUserActionMenu: function(element, userId, userName) {
    var reloadTimeline = function() {
      if(tweetManager.currentTimelineId == TimelineTemplate.UNIFIED
      || tweetManager.currentTimelineId == TimelineTemplate.HOME) {
        prepareAndLoadTimeline();
      }
    };
    $(element).actionMenu({
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
            }, username);
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
            }, username);
          },
          condition: function() {
            var mutingUsers = tweetManager.getMutingUsersSet();
            return $.isEmptyObject(mutingUsers) || !mutingUsers.has(username);
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
            }, username);
          },
          condition: function() {
            var mutingUsers = tweetManager.getMutingUsersSet();
            return !$.isEmptyObject(mutingUsers) && mutingUsers.has(username);
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

  expandInReply: function(tweet, targetId, showIfVisible) {
    if(showIfVisible && !tweet.replyVisible) {
      return;
    }

    $("#loading").show();
    tweetManager.getInReplyToTweet(function(success, data, status) {
      if(success) {
        tweet.replyVisible = true;
        var renderedTweet = $.parseHTML(Renderer.renderTweet(data, false));
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
      } else if(status == 179){
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

  warningsCallback: function(msg, isError, showHTML) {
    if(isError) {
      Renderer.showError(msg, null, showHTML);
    } else {
      Renderer.showWarning(msg, showHTML);
    }
  },

  showWarning: function(msg, showHtml) {
    $("#warning").find(".img_area").find("img").attr('src', 'img/warning.png');
    if(showHtml) {
      msg = $(document.createElement('span')).html(msg);
    } else {
      msg = $(document.createElement('span')).text(msg);
    }
    Renderer.showMessage(msg);
  },

  showError: function(msg, tryAgainFunction, showHtml) {
    $("#warning").find(".img_area").find("img").attr('src', 'img/error.png');
    var span = $(document.createElement('span')), link;
    if(showHtml) {
      msg = span.html(msg);
    } else {
      msg = span.text(msg);
    }

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
    $("#warning").find(".content").empty().append(msg);
    $("#absolute_container").slideDown('slow');
  },

  hideMessage: function() {
    var imgSrc = $("#warning").find(".img_area img").attr('src');
    if(imgSrc.match(/warning/)) {
      tweetManager.clearWarning();
    }
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
