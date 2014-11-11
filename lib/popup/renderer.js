$.extend(Renderer, {
  assemblyTweets: function (tweets, timelineId) {
    var destination = $("#timeline-" + timelineId).find(".inner_timeline");
    if(destination.length === 0) {
      destination = null;
      return;
    }
    var renderdText = '', doAggressive = (!OptionsBackend.get('compliant_twitter_display_requirements') && OptionsBackend.get('aggressive_flat'));

    AnyClick.clearEventListeners();
    for(var i = 0, len = tweets.length; i < len; i++) {
      renderdText += Renderer.renderTweet(tweets[i], true);
      tweetManager.readTweet(tweets[i].id);
    }
    if(doAggressive) {
      renderdText = renderdText.replace(/<br \/>/g, '');
    }

    destination
    .empty()
    .html($.parseHTML(renderdText))
    .on('mouseover', function(event) {
      $(this)
      .find('.createUserActionMenu')
      .each(function() {
        if(!this.dataset.createUserActionMenu) return;
        if(this.dataset.createUserActionMenu !== "Silverbird_M") {
          Renderer.createUserActionMenu(this, this.dataset.createUserActionMenu);
        }
        this.removeAttribute("data-create-user-action-menu");
      })
      .end()
      .find('.handleHashTag')
      .each(function() {
        if(!this.dataset.handleHashTag) return;
        Renderer.handleHashTag(this, this.dataset.handleHashTag);
        this.removeAttribute("data-handle-hash-tag");
      })
      .end()
      .removeClass('createUserActionMenu handleHashTag');
    })
    .on('mouseover', '.expandInReply', function(event) {
      if(!this.dataset.expandInReplyId || !this.dataset.expandInReplyTweet) return;
      var tweet = JSON.parse(unescape(this.dataset.expandInReplyTweet)), tweetSpaceId = this.dataset.expandInReplyId;
      AnyClick.anyClick(this, function() {
        Renderer.toggleInReply(tweet, tweetSpaceId);
      });
      Renderer.expandInReply(tweet, tweetSpaceId, true);
      this.removeAttribute("data-expand-in-reply-tweet");
      this.removeAttribute("data-expand-in-reply-id");
    })
    .tooltip({
      items: '.tooltip',
      content: function() {
        if(this.dataset.tooltipContent) {
          return this.dataset.tooltipContent;
        } else {
          return this.getAttribute('title') || this.textContent;
        }
      }
    })
    .end()
    .find('.tweet')
    .on('mouseover mouseout', function(event) {
      var img = $(".new_actions", this).find("img").not(".starred");
      if(event.type == 'mouseover') {
        img.css('display', 'inline');
      } else {
        img.css('display', 'none');
      }
      img = null;
    })
    .end()
    .find('.new_actions')
    .on('mouseover mouseout click', "img", function(event) {
      if(event.type === 'click') {
        var targetClass = event.target.getAttribute('class');
        event.preventDefault();
        switch(true) {
          case (targetClass.indexOf('unStarred') !== -1):
            Composer.favorite(event.target.parentNode.parentNode.parentNode);
            break;
          case (targetClass.indexOf('starred') !== -1):
            Composer.unFavorite(event.target.parentNode.parentNode.parentNode);
            break;
          case (targetClass.indexOf('retweetIcon') !== -1):
            Composer.retweet(event.target.parentNode.parentNode.parentNode);
            break;
          case (targetClass.indexOf('destroyIcon') !== -1):
            Composer.destroy(event.target.parentNode.parentNode.parentNode, false);
            break;
          case (targetClass.indexOf('destroyRTIcon') !== -1):
            Composer.destroy(event.target.parentNode.parentNode.parentNode, true);
            break;
          case (targetClass.indexOf('replyIcon') !== -1):
            Composer.reply(event.target.parentNode.parentNode.parentNode);
            break;
          case (targetClass.indexOf('oldRTIcon') !== -1):
            Composer.share(event.target.parentNode.parentNode.parentNode);
            break;
          default:
            break;
        }
        targetClass = null;
      } else {
        var old_src = this.getAttribute('src');
        if(!old_src) return;
        var new_src = old_src, isStarred = (this.getAttribute('class').indexOf('starred') !== -1), isHoverImage = old_src.match(/hover/);
        if((!isStarred && event.type == 'mouseover') || (isStarred && event.type == 'mouseout')) {
          if(!isHoverImage) new_src = old_src.replace(/\.png/, '_hover.png');
        } else if(isHoverImage) {
          new_src = old_src.replace(/_hover/, '');
        }
        this.setAttribute('src', new_src);
        old_src = null;
        new_src = null;
      }
    });
    $('.first_container').one('mouseover', function(event) {
      $(this)
      .find('.handleLink')
      .each(Renderer.handleLinkEachFunc)
    })
    if(doAggressive) {
      destination.find('img').removeClass('profile retweet_source retweet_retweeter verified protected retweet').css({maxWidth: "16px", maxHeight: "16px"});
      destination.find('.tweet').css({padding: "0"});
      destination.find('.tweet_overlay').removeClass();
      destination.find(".text_container").css({display: "inline", wordWrap: "break-word", margin: "0", padding: "0"});
      destination.find('.first_container').find('div').not(".text_container").removeClass().css({display: "inline", wordWrap: "break-word", margin: "4px", padding: "0"});
      destination.find('.new_actions').css({position: "static", display: "inline-box"});
    }
    renderdText = null;
    doAggressive = null;
    destination = null;
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

  handleLinkEachFunc: function() {
    var baseUrl, expandedUrl, mediaUrl;
    baseUrl = (this.dataset.handleLinkBase === "undefined")? null: this.dataset.handleLinkBase;
    expandedUrl = (this.dataset.handleLinkExpanded === "undefined")? null: this.dataset.handleLinkExpanded;
    mediaUrl = (this.dataset.handleLinkMedia === "undefined")? null: this.dataset.handleLinkMedia;
    Renderer.handleLink(this, baseUrl, expandedUrl, mediaUrl);
    baseUrl = null;
    expandedUrl = null;
    mediaUrl = null;
  },

  handleLink: function(link, baseUrl, expandedUrl, mediaUrl) {
    var toExpandUrl = mediaUrl || expandedUrl || baseUrl;
    AnyClick.anyClick(link, function() {
      openTab(baseUrl);
    });
    link.setAttribute('class', 'tooltip');
    if(!OptionsBackend.get('show_expanded_urls') || link.dataset.handleLinkNoexpand == 'true') {
      if(!link.dataset.tooltipContent) {
        link.setAttribute('data-tooltip-content', '<p>' + toExpandUrl + '</p>');
      }
      return;
    }
    link.setAttribute('title', chrome.i18n.getMessage("expanding_url"));
    tweetManager.urlExpander.expand({
      url: toExpandUrl,
      callback: function(result) {
        if(typeof result.get('content') !== 'undefined') {
          link.setAttribute('data-tooltip-content', result.get('content'));
        } else {
          var reCheck = Renderer.expandImageLink(result.get('url'));
          if(reCheck) {
            link.setAttribute('data-tooltip-content', '<img src="' + reCheck + '" />');
          } else {
            link.setAttribute('data-tooltip-content', '<p>' + result.get('url') + '</p>');
          }
        }
      }
    });
  },

  expandImageLink: function (url) {
    var thumbUrl = null;
    thumbUrl = ImageService.getThumb(url);
    if(!thumbUrl && /\.(png|jpg|jpeg|gif|bmp|tiff)(\?.*)?$/.test(url)) thumbUrl = url;
    return thumbUrl;
  },

  createUserActionMenu: function(element, username) {
    var reloadTimeline = function() {
      if(tweetManager.currentTimelineId == TimelineTemplate.UNIFIED
      || tweetManager.currentTimelineId == TimelineTemplate.HOME) {
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
            TimelineTab.addNewSearchTab('from:' + username, event.isAlternateClick);
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
            return !(tweetManager.getFollowingUsersMap().has(username));
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
            return tweetManager.getFollowingUsersMap().has(username);
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
