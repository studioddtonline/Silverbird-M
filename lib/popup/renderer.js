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

    var nameAttribute = OptionsBackend.get('name_attribute');
    var fragment = document.createDocumentFragment();
    destination.empty();
    $.each(tweets, function(i, val) {
      $(Renderer.renderTweet(val, useColors, nameAttribute)).appendTo(fragment);
      tweetManager.readTweet(val.id);
    });
    destination.append(fragment);
    destination = null;

    $(document)
    .on('mouseover mouseout', ".tweet", function(event) {
      var img = $(".new_actions", this).find("img").not(".starred");
      if(event.type == 'mouseover') {
        img.css('display', 'inline');
      } else {
        img.css('display', 'none');
      }
      img = null;
    })
    .on('mouseover mouseout', ".new_actions img", function(event) {
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
