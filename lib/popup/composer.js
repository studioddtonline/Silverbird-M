var Composer = {
  replyId: null,
  replyUser: null,
  favoriteId: null,
  destroyTimelineId: null,
  macCommandKey: false,
  dmTargetNameLength: 0,
  picTwitterCom: 0,
  matchDM: new RegExp('^d ([a-zA-Z0-9_]+) '),
  matchHTTPS: new RegExp('https:\/\/[A-Z0-9\-\.\/\?\=\&\%\#]+', 'ig'), // lazy
  matchURL: new RegExp('(http|ftp|file):\/\/[A-Z0-9\-\.\/\?\=\&\%\#]+', 'ig'), // lazy
  matchTLD: new RegExp('[A-Z0-9\-][\.](A(ERO|SIA)|BIZ|C(OOP|AT|OM)|EDU|GOV|I(NFO|NT)|JOBS|M(USEUM|OBI|IL)|N(AME|ET)|ORG|PRO|T(RAVEL|EL)|XXX)(?![A-Z0-9])', 'ig'),
  matchSLD: new RegExp('[A-Z0-9\-][\.][A-Z0-9\-]{2,63}[\.](A(ERO|RPA|SIA|[C-GIL-OQ-UWXZ])|B(IZ|[ABD-JMNORSTVWYZ])|C(OOP|AT|OM|[ACDF-IK-ORU-Z])|D[EJKMOZ]|E(DU|[CEGR-U])|F[IJKMOR]|G(OV|[ABD-ILMNP-UWY])|H[KMNRTU]|I(NFO|NT|[DEL-OQ-T])|J(OBS|[EMOP])|K[EGHIMNPRWYZ]|L[ABCIKR-VY]|M(USEUM|OBI|IL|[ACDEGHK-Z])|N(AME|ET?|[ACFGILOPRUZ])|O(RG|M)|P(OST|RO?|[AE-HK-NSTWY])|QA|R[EOSUW]|S[A-EG-ORTUVXYZ]|T(RAVEL|EL|[CDFGHJ-PRTVWZ])|U[AGKSYZ]|V[ACEGINU]|W[FS]|X(XX|N)|Y[ET]|Z[AMW])(?![A-Z0-9])', 'ig'),
  fullMatchTLD: new RegExp('[^\/@]([A-Z0-9\-\.]+\.)?[A-Z0-9\-]{2,63}[\.](A(ERO|RPA|SIA|[C-GIL-OQ-UWXZ])|B(IZ|[ABD-JMNORSTVWYZ])|C(OOP|AT|OM|[ACDF-IK-ORU-Z])|D[EJKMOZ]|E(DU|[CEGR-U])|F[IJKMOR]|G(OV|[ABD-ILMNP-UWY])|H[KMNRTU]|I(NFO|NT|[DEL-OQ-T])|J(OBS|[EMOP])|K[EGHIMNPRWYZ]|L[ABCIKR-VY]|M(USEUM|OBI|IL|[ACDEGHK-Z])|N(AME|ET?|[ACFGILOPRUZ])|O(RG|M)|P(OST|RO?|[AE-HK-NSTWY])|QA|R[EOSUW]|S[A-EG-ORTUVXYZ]|T(RAVEL|EL|[CDFGHJ-PRTVWZ])|U[AGKSYZ]|V[ACEGINU]|W[FS]|X(XX|N)|Y[ET]|Z[AMW])(?![A-Z0-9])', 'ig'),

  bindEvents: function() {
    var baseElement = $("#compose_tweet_area");

    baseElement.find("textarea")
    .on("keyup blur", Composer.textareaChanged.bind(Composer))
    .on("keydown", Composer.checkMacCommandKey.bind(Composer));
    $("#tweetit").on("click", Composer.sendTweet.bind(Composer));
    if(OptionsBackend.get('image_upload_service') !== 'pic.twitter.com') {
      $("#image_input").on("change", ImageUpload.upload.bind(ImageUpload));
    } else {
      $("#image_input").on("change", Composer.pictureLoaded.bind(Composer));
    }
    $("#compose_tweet").on("click", function() {
      Composer.showComposeArea();
    });

    $("#shortener_area").find("input")
    .on("focus", Shortener.focus.bind(Shortener))
    .on("keyup", Shortener.changed.bind(Shortener))
    .on("blur", Shortener.blur.bind(Shortener));
    $("#shorten_current").on("click", function(ev) {
      if(ev.ctrlKey) {
        Shortener.shortenCurrentPageWithoutQuery();
      } else {
        Shortener.shortenCurrentPage();
      }
    });
    $("#shortener_button").on("click", function() {
      Shortener.shortenIt();
    });

  },

  init: function() {
    if(tweetManager.composerData.isComposing) {
      Composer.initMessage(tweetManager.composerData.saveMessage, tweetManager.composerData.replyId, tweetManager.composerData.replyUser, false);
    }
    Composer.textareaChanged();
  },

  initMessage: function(message, replyId, replyUser, shouldAnimate) {
    Composer.replyId = replyId;
    Composer.replyUser = replyUser;
    $("#compose_tweet_area").find("textarea").val(message || '');
    Composer.showComposeArea(true, !shouldAnimate);
    Composer.textareaChanged();
  },

  share: function (node) {
    Composer.showComposeArea(true);
    var $node = $(node);
    var el = $("#compose_tweet_area").find("textarea");
    var user = $node.find(".user").attr('screen_name');
    var msg = $node.find(".text_container").text();
    $node.find(".text_container").find("a").each(function() {
      var $this = $(this);
      var linkHref = $this.attr('href'),
          linkText = $this.text();
      if (linkHref && linkHref !== '#') {
        msg = msg.replace(linkText, linkHref);
      }
      $this = null;
    });

    el.val("RT @" + user + ": " + msg);
    Composer.textareaChanged();
  },

  confirmDestroy: function(destroyId, destroyRT) {
    $("#loading").show();

    tweetManager.destroy(function(success, data, status) {
      $("#loading").hide();
      var notFound = status && status.match(/Not Found/);
      if(success || notFound) {
        $(".tweet").find("[tweetid='" + destroyId + "']").parents('.tweet_space').first().hide('blind', { direction: "vertical" });
        if(parseInt(destroyRT, 10) > 0) {
          delete tweetManager.retweets[destroyRT];
          loadTimeline(true);
        } else {
          for(var tweetId in tweetManager.retweets) {
            if(!tweetManager.retweets.hasOwnProperty(tweetId)) continue;
            if(tweetManager.retweets[tweetId] == destroyId) {
              delete tweetManager.retweets[tweetId];
              break;
            }
          }
        }
        var currentCount = tweetManager.getCurrentTimeline().getTweetsCache().length;
        if(currentCount < OptionsBackend.get('tweets_per_page')) {
          Paginator.nextPage();
        }
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_deletingTweet", status), Composer.confirmDestroy.bind(Composer));
      }
    }, this.destroyTimelineId, destroyId);
  },

  destroy: function (node, retweet) {
    var $node = $(node), dialogTitle = '', dialogMessage = '', destroyId = '', destroyRT = '0';
    if(retweet) {
      destroyRT = $node.attr('tweetid');
      destroyId = tweetManager.retweets[destroyRT];
      dialogTitle = chrome.i18n.getMessage("deleteRT");
      dialogMessage = chrome.i18n.getMessage("deleteRTConfirm");
    } else {
      destroyId = $node.attr('tweetid');
      dialogTitle = chrome.i18n.getMessage("Delete");
      dialogMessage = chrome.i18n.getMessage("deleteConfirm");
    }
    this.destroyTimelineId = $node.attr('timelineid');
    $('#confirm_dialog')
    .attr('data-tweet-action', 'destroy')
    .attr('data-tweet-id', destroyId)
    .attr('data-tweet-option', destroyRT)
    .text(dialogMessage)
    .dialog('option', 'title', dialogTitle)
    .dialog('open');
  },

  confirmRT: function(rtId) {
    $("#loading").show();
    tweetManager.postRetweet(function(success, data, status) {
      $("#loading").hide();
      if(success) {
        loadTimeline(true, "home");
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_retweeting", status), Composer.confirmRT.bind(Composer));
      }
    }, rtId);
  },

  retweet: function (node) {
    $('#confirm_dialog')
    .attr('data-tweet-action', 'retweet')
    .attr('data-tweet-id', $(node).attr('tweetid'))
    .text(chrome.i18n.getMessage("retweetConfirm"))
    .dialog('option', 'title', chrome.i18n.getMessage("Retweet"))
    .dialog('open');
  },

  favorite: function (node) {
    if(node) {
      this.favoriteId = $(node).attr('tweetid');
    }
    var loading = $("#loading");
    loading.show();
    tweetManager.favorite(function(success, data, status) {
      loading.hide();
      if(success) {
         Paginator.needsMore = false;
         loadTimeline();
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_markFavorite", status), Composer.favorite.bind(Composer));
      }
    }, this.favoriteId);
  },

  unFavorite: function (node) {
    if(node) {
      this.favoriteId = $(node).attr('tweetid');
    }
    var loading = $("#loading");
    loading.show();
    tweetManager.unFavorite(function(success, data, status) {
      loading.hide();
      if(success) {
         Paginator.needsMore = false;
         loadTimeline();
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_unmarkFavorite", status), Composer.unFavorite.bind(Composer));
      }
    }, this.favoriteId);
  },

  addUser: function (replies) {
    var textArea = $("#compose_tweet_area").find("textarea");
    var currentVal = textArea.val();
    replies =  (function(array) {
      var result = [], hash = {};
      for(var i = 0, len = array.length; i < len; i++) {
        if(!hash[array[i]]) {
          result[result.length] = array[i];
          hash[array[i]] = true;
        }
      }
      return result;
    })(replies || []);
    if(currentVal.length > 0 && currentVal[currentVal.length - 1] != ' ') {
      currentVal += ' ';
    }
    currentVal += replies.join(' ') + ' ';
    textArea.val(currentVal);
  },

  reply: function (node) {
    Composer.showComposeArea(true);

    var $node = $(node);
    var textArea = $("#compose_tweet_area").find("textarea");
    var user = $node.find(".user").eq(0).attr('screen_name');
    var timelineId = $node.attr('timelineid');

    if(timelineId == TimelineTemplate.RECEIVED_DMS || timelineId == TimelineTemplate.SENT_DMS) {
      textArea.val("d " + user + " ");
      Composer.textareaChanged();
      return;
    }

    var currentVal = textArea.val();
    var replies = ['@'+user];
    var ownName = tweetManager.twitterBackend.username();
    if (reply_all) {
      $node.find(".text_container").find('a').each(function(){
        var t = $(this).text();
        if (t !== ownName && (/^[A-Z0-9_-]{1,15}$/i).test(t)) {
          var user = '@' + t;
          if (replies.indexOf(user) == -1)
            replies.push(user);
        }
      });
    }

    if(Composer.replyId && currentVal.indexOf(Composer.replyUser) != -1) {
      this.addUser(replies);
      Composer.textareaChanged();
      return;
    }

    this.addUser(replies);
    tweetManager.composerData.replyId = Composer.replyId = $node.attr('tweetid');
    tweetManager.composerData.replyUser = Composer.replyUser = user;

    Composer.textareaChanged();
  },

  showComposeArea: function (showOnly, noAnimation) {
    var composeArea = $("#compose_tweet_area");
    var textarea = composeArea.find("textarea");
    var visible = (composeArea.css('display') != 'none');
    var tmCompose = tweetManager.composerData;

    if(!visible) {
      if(noAnimation) {
        composeArea.show();
      } else {
        composeArea.show('blind', { direction: "vertical" }, 'normal', function() {
          textarea[0].selectionStart = textarea[0].selectionEnd = textarea.val().length;
          textarea.focus();
        });
      }
      $("#compose_tweet").find("img").attr('src', 'img/arrow_up.gif');
      $("#composeTweet").text(chrome.i18n.getMessage('closeComposeTweet'));
      tmCompose.isComposing = true;
      tmCompose.replyId = Composer.replyId;
      tmCompose.replyUser = Composer.replyUser;
    } else if(!showOnly) {
      if(noAnimation) {
        composeArea.hide();
      } else {
        composeArea.hide('blind', { direction: "vertical" });
      }
      $("#compose_tweet").find("img").attr('src', 'img/arrow_down.gif');
      $("#composeTweet").text(chrome.i18n.getMessage('composeTweet'));
      tmCompose.saveMessage = '';
      tmCompose.isComposing = false;
      tmCompose.replyId = null;
      tmCompose.replyUser = null;
      Shortener.closeArea();
    }

    if((visible && showOnly) || (!visible && noAnimation)) {
      textarea[0].selectionStart = textarea[0].selectionEnd = textarea.val().length;
      textarea.focus();
    }
  },

  textareaChanged: function (e) {
    var composeArea = $("#compose_tweet_area");
    var el = composeArea.find("textarea");
    var str = el.val();
    tweetManager.composerData.saveMessage = str;
    if(typeof str !== 'string' || str === '') {
      Composer.dmTargetNameLength = 0;
    } else {
      var isDM = str.match(Composer.matchDM);
      if(isDM !== null) {
        if(OptionsBackend.get('image_upload_service') === 'pic.twitter.com') {
          $('#image_input').val('').attr("disabled", "disabled");
        } else {
          $('#image_input').removeAttr("disabled");
        }
        Composer.dmTargetNameLength = isDM[1].length + 3;
      } else {
        Composer.dmTargetNameLength = 0
      }
      if(str.match(Composer.matchHTTPS) !== null) {
        str = str.replace(Composer.matchHTTPS, '!!!!!!!!!!!!!!!!!!!!!!!');
      }
      if(str.match(Composer.matchURL) !== null) {
        str = str.replace(Composer.matchURL, '!!!!!!!!!!!!!!!!!!!!!!');
      }
      if(str.match(Composer.matchTLD) !== null) {
        str = str.replace(Composer.matchTLD, '!!!!!!!!!!!!!!!!!!!!!!');
      }
      if(str.match(Composer.matchSLD) !== null) {
        str = str.replace(Composer.matchSLD, '!!!!!!!!!!!!!!!!!!!!!!');
      }
    }
    var availableChars = MAX_TWEET_SIZE - str.length - Composer.picTwitterCom + Composer.dmTargetNameLength;
    var charsLeftEl = composeArea.find(".chars_left");
    charsLeftEl.text(availableChars);
    if(availableChars < 0 || availableChars == MAX_TWEET_SIZE) {
      if(availableChars < 0) {
        charsLeftEl.css('color', 'red');
      }
      composeArea.find("input").find("[type='button']").attr("disabled", "disabled");
    } else {
      charsLeftEl.css('color', 'black');
      composeArea.find("input").find("[type='button']").removeAttr("disabled");
      if(e && e.ctrlKey && e.which == 13) {
        this.sendTweet();
      }
    }
  },

  sendTweet: function () {
    var textarea = $("#compose_tweet_area").find("textarea");
    var message = textarea.val();
    var regexpResult = message.match(Composer.matchDM);

    if(regexpResult !== null) {
      message = message.substring(regexpResult[1].length + 3);
      tweetManager.enqueueTweet(message, regexpResult[1], Composer.replyUser, true, false);
    } else {
      if(OptionsBackend.get('image_upload_service') === 'pic.twitter.com') {
        tweetManager.enqueueTweet(message, Composer.replyId, Composer.replyUser, false, document.getElementById('image_input').files[0]);
      } else {
        tweetManager.enqueueTweet(message, Composer.replyId, Composer.replyUser, false, false);
      }
    }

    textarea.val("");
    Composer.replyId = null;
    Composer.textareaChanged();
    Composer.showComposeArea();
    Shortener.clear();
  },

  refreshNew: function() {
    if(loadingNewTweets) return;
    loadTimeline(true);
  },

  isVisible: function() {
    var composeArea = $("#compose_tweet_area");
    var textarea = composeArea.find("textarea");
    var visible = (composeArea.css("display") != 'none');
    return visible && textarea.val().length > 0;
  },

  addText: function(value) {
    var textarea = $("#compose_tweet_area").find("textarea");
    var tmpText = textarea.val();
    if(tmpText.length > 0) {
      if((textarea[0].selectionStart > 0) &&
        (tmpText[textarea[0].selectionStart-1] != ' ')) {
        value = ' ' + value;
      }
      if((textarea[0].selectionEnd < tmpText.length) &&
         (tmpText[textarea[0].selectionEnd+1] != ' ')) {
         value += ' ';
      }
    }
    textarea.insertAtCaret(value);
    Composer.textareaChanged();
  },

  pictureLoaded: function() {
    var file = $('#image_input').val();
    if(file == null || file == '') {
      Composer.picTwitterCom = 0;
    } else {
      Composer.picTwitterCom = 23;
    }
  },

  checkMacCommandKey: function(e) {
    if(!e) return;
    if(Composer.macCommandKey && e.which == 13) {
      Composer.macCommandKey = false;
      this.sendTweet();
      return;
    }
    if(e && (e.which == 91 || e.which == 93)) {
      Composer.macCommandKey = true;
    } else {
      Composer.macCommandKey = false;
    }
  }
};
