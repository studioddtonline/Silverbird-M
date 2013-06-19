$.extend(Renderer, {
  assemblyTweets: function (tweets, timelineId) {
    var destination = $("#timeline-" + timelineId).find(".inner_timeline");
    if(destination.length === 0)
      return;

    var useColors = true;
    if(OptionsBackend.get('tweets_color_only_unified')) {
      if(timelineId != TimelineTemplate.UNIFIED) {
        useColors = false;
      }
    }

    AnyClick.clearEventListeners();
    var fragment = document.createDocumentFragment();
    for(var i = 0, j = tweets.length; i < j; i++) {
      $(Renderer.renderTweet(tweets[i], useColors))
      .appendTo(fragment)
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
      .tooltip({
        items: '.tooltip',
        content: function() {
          if(this.dataset.tooltipImage) {
            return '<img src="' + this.dataset.tooltipImage + '"/>';
          } else {
            return this.dataset.tooltipLink;
          }
        }
      })
      .find(".tweet")
      .on('mouseover mouseout', function(event) {
        var img = $(".new_actions", this).find("img").not(".starred");
        if(event.type == 'mouseover') {
          img.css('display', 'inline');
        } else {
          img.css('display', 'none');
        }
        img = null;
      })
      .find(".new_actions")
      .on('mouseover mouseout', "img", function(event) {
        var $this = $(this);
        var old_src = $this.attr('src');
        if(!old_src) {
          $this = null;
          return;
        }
        var new_src = old_src;
        var isStarred = $this.is('.starred');
        var isHoverImage = old_src.match(/hover/);
        if((!isStarred && event.type == 'mouseover') || (isStarred && event.type == 'mouseout')) {
          if(!isHoverImage) {
            new_src = old_src.replace(/\.png/, '_hover.png');
          }
        } else {
          if(isHoverImage) {
            new_src = old_src.replace(/_hover/, '');
          }
        }
        $this.attr('src', new_src);
        $this = null;
      });
      tweetManager.readTweet(tweets[i].id);
    }
    destination
    .empty()
    .append(fragment);
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
      msg = $("<span>").html(msg);
    } else {
      msg = $("<span>").text(msg);
    }
    Renderer.showMessage(msg);
  },

  showError: function(msg, tryAgainFunction, showHtml) {
    $("#warning").find(".img_area").find("img").attr('src', 'img/error.png');
    var span = $(document.createElement('span'));
    if(showHtml) {
      msg = span.html(msg);
    } else {
      msg = span.text(msg);
    }

    if(tryAgainFunction) {
      var link = $(document.createElement('a')).attr('href', '#').text(chrome.i18n.getMessage("tryAgain"));

      link.on('click', function(ev) {
        ev.preventDefault();
        tryAgainFunction();
        Renderer.hideMessage();
      });

      msg.append(link);
    }
    Renderer.showMessage(msg);
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
