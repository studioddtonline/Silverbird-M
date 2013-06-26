$.extend(Renderer, {
  assemblyTweets: function (tweets, timelineId) {
    var destination = $("#timeline-" + timelineId).find(".inner_timeline");
    if(destination.length === 0) {
      destination = null;
      return;
    }
    var useColors = true, renderdText = '', doAggressive = (!OptionsBackend.get('compliant_twitter_display_requirements') && OptionsBackend.get('aggressive_flat'));
    if(OptionsBackend.get('tweets_color_only_unified') && timelineId != TimelineTemplate.UNIFIED) {
        useColors = false;
    }

    AnyClick.clearEventListeners();
    for(var i = 0, len = tweets.length; i < len; i++) {
      renderdText += Renderer.renderTweet(tweets[i], useColors);
      tweetManager.readTweet(tweets[i].id);
    }
    if(doAggressive) {
      renderdText = renderdText.replace(/<br \/>/g, '');
    }

    destination
    .empty()
    .html($.parseHTML(renderdText))
    .on('mouseover', function(event) {
      $(this).find('.handleLink').each(function() {
        if(!this.dataset.handleLinkBase) return;
        var baseUrl, expandedUrl, mediaUrl;
        baseUrl = (this.dataset.handleLinkBase === "undefined")? null: this.dataset.handleLinkBase;
        expandedUrl = (this.dataset.handleLinkExpanded === "undefined")? null: this.dataset.handleLinkExpanded;
        mediaUrl = (this.dataset.handleLinkMedia === "undefined")? null: this.dataset.handleLinkMedia;
        Renderer.entitiesFuncs.handleLink(this, baseUrl, expandedUrl, mediaUrl);
        this.removeAttribute("data-handle-link-base");
        this.removeAttribute("data-handle-link-expanded");
        this.removeAttribute("data-handle-link-media");
        baseUrl = null;
        expandedUrl = null;
        mediaUrl = null;
      });
    })
    .on('mouseover', '.createUserActionMenu', function(event) {
      if(!this.dataset.createUserActionMenu) return;
      Renderer.createUserActionMenu(this, this.dataset.createUserActionMenu);
      this.removeAttribute("data-create-user-action-menu");
    })
    .on('mouseover', '.handleHashTag', function(event) {
      if(!this.dataset.handleHashTag) return;
      Renderer.entitiesFuncs.handleHashTag(this, this.dataset.handleHashTag);
      this.removeAttribute("data-handle-hash-tag");
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
        if(this.dataset.tooltipImage) {
          return '<img src="' + this.dataset.tooltipImage + '"/>';
        } else {
          return this.dataset.tooltipLink || this.textContent;
        }
      }
    });
    destination
    .find('.tweet')
    .on('mouseover mouseout', function(event) {
      var img = $(".new_actions", this).find("img").not(".starred");
      if(event.type == 'mouseover') {
        img.css('display', 'inline');
      } else {
        img.css('display', 'none');
      }
      img = null;
    });
    destination
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
    if(doAggressive) {
      destination.find('img').removeClass('profile retweet_source retweet_retweeter verified protected retweet').css({maxWidth: "16px", maxHeight: "16px"});
      destination.find('.tweet').css({padding: "0"});
      destination.find('.tweet_overlay').removeClass();
      destination.find(".text_container").css({display: "inline", wordWrap: "break-word", margin: "0", padding: "0"});
      destination.find('.first_container').find('div').not(".text_container").removeClass().css({display: "inline", wordWrap: "break-word", margin: "4px", padding: "0"});
      destination.find('.new_actions').css({position: "static", display: "inline-box"});
    }
    useColors = null;
    renderdText = null;
    doAggressive = null;
    destination = null;
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
