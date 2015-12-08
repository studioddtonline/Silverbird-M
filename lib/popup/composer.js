var Composer = {
  replyId: null,
  replyUser: null,
  mediaIds: new Map(),
  maxTextLength: tweetManager.twitterConfiguration.tweet_text_character_limit,
  maxTweetLength: tweetManager.twitterConfiguration.tweet_text_character_limit,
  maxDMLength: tweetManager.twitterConfiguration.dm_text_character_limit,
  maxAttachableImages: 4,
  maxImageSize: tweetManager.twitterConfiguration.photo_size_limit,
  uploadable: false,
  uploading: false,
  macCommandKey: false,
  dmTargetNameLength: 0,
  picTwitterCom: 0,
  quoteTweetUrl: null,
  matchDM: new RegExp('^d ([a-zA-Z0-9_]{1,15}) '),
  matchURL: new RegExp('(http|https|ftp|file):\/\/[A-Z0-9\-\.\/\?\=\&\%\#\_]+', 'ig'), // lazy
  matchTLD: new RegExp('[A-Z0-9\-]{2,63}[\.](A(ERO|SIA)|BIZ|C(OOP|AT|OM)|EDU|GOV|I(NFO|NT)|JOBS|M(USEUM|OBI|IL)|N(AME|ET)|ORG|PRO|T(RAVEL|EL)|XXX)(?![A-Z0-9])', 'ig'),
  matchSLD: new RegExp('[A-Z0-9\-]{2,63}[\.][A-Z0-9\-]{2,63}[\.](A(ERO|RPA|SIA|[C-GIL-OQ-UWXZ])|B(IZ|[ABD-JMNORSTVWYZ])|C(OOP|AT|OM|[ACDF-IK-ORU-Z])|D[EJKMOZ]|E(DU|[CEGR-U])|F[IJKMOR]|G(OV|[ABD-ILMNP-UWY])|H[KMNRTU]|I(NFO|NT|[DEL-OQ-T])|J(OBS|[EMOP])|K[EGHIMNPRWYZ]|L[ABCIKR-VY]|M(USEUM|OBI|IL|[ACDEGHK-Z])|N(AME|ET?|[ACFGILOPRUZ])|O(RG|M)|P(OST|RO?|[AE-HK-NSTWY])|QA|R[EOSUW]|S[A-EG-ORTUVXYZ]|T(RAVEL|EL|[CDFGHJ-PRTVWZ])|U[AGKSYZ]|V[ACEGINU]|W[FS]|X(XX|N)|Y[ET]|Z[AMW])(?![A-Z0-9])', 'ig'),
  fullMatchTLD: new RegExp('[^\/@]([A-Z0-9\-\.]+\.)?[A-Z0-9\-]{2,63}[\.](A(ERO|RPA|SIA|[C-GIL-OQ-UWXZ])|B(IZ|[ABD-JMNORSTVWYZ])|C(OOP|AT|OM|[ACDF-IK-ORU-Z])|D[EJKMOZ]|E(DU|[CEGR-U])|F[IJKMOR]|G(OV|[ABD-ILMNP-UWY])|H[KMNRTU]|I(NFO|NT|[DEL-OQ-T])|J(OBS|[EMOP])|K[EGHIMNPRWYZ]|L[ABCIKR-VY]|M(USEUM|OBI|IL|[ACDEGHK-Z])|N(AME|ET?|[ACFGILOPRUZ])|O(RG|M)|P(OST|RO?|[AE-HK-NSTWY])|QA|R[EOSUW]|S[A-EG-ORTUVXYZ]|T(RAVEL|EL|[CDFGHJ-PRTVWZ])|U[AGKSYZ]|V[ACEGINU]|W[FS]|X(XX|N)|Y[ET]|Z[AMW])(?![A-Z0-9])', 'ig'),
  dummyURLStrings: "!".repeat(tweetManager.twitterConfiguration.short_url_length_https),

  bindEvents: function() {
    $("#tweet_text")
    .on("keyup.popup blur.popup", Composer.textareaChanged.bind(Composer))
    .on("keydown.popup", Composer.checkMacCommandKey.bind(Composer));
    $("#tweetit").on("click.popup", Composer.sendTweet.bind(Composer));
    var imageInput = $("#image_input");
    $("#upload_selector").on("click.popup", function(event) {
      if(Composer.mediaIds.size >= Composer.maxAttachableImages) {
        Renderer.showError(chrome.i18n.getMessage("ue_max_attached_images"), null);
        return;
      }
      if(!Composer.uploading) {
        imageInput.trigger(event.type);
      }
    });
    if(ThemeManager.isPopup && !(/^Win/i.test(navigator.platform))) {
      Composer.uploadable = false;
      $('#upload_area')
      .text(chrome.i18n.getMessage('detach_window_for_upload'))
      .off('.popup');
    } else {
      Composer.uploadable = true;
      imageInput
      .on("change.popup", Composer.inputFileOnchange);
      $('#upload_selector').text(chrome.i18n.getMessage('select_images_for_upload'));
    }
    $("#compose_tweet").on("click.popup", function() {
      Composer.showComposeArea();
    });
    $("#shortener_area input")
    .on("focus.popup", Shortener.focus.bind(Shortener))
    .on("keyup.popup", Shortener.changed.bind(Shortener))
    .on("blur.popup", Shortener.blur.bind(Shortener));
    $("#shortener_button").on("click.popup", function(event) {
      Shortener.shortenIt({withoutQuery: event.ctrlKey || Composer.macCommandKey});
    });
  },

  init: function() {
    if(tweetManager.composerData.isComposing) {
      Composer.initMessage(tweetManager.composerData.saveMessage, tweetManager.composerData.replyId, tweetManager.composerData.replyUser, tweetManager.composerData.quoteTweetUrl, tweetManager.composerData.mediaIds, false);
    }
    Composer.textareaChanged();
  },

  initMessage: function(message, replyId, replyUser, quoteTweetUrl, mediaIds, shouldAnimate) {
    Composer.replyId = replyId;
    Composer.replyUser = replyUser;
    Composer.quoteTweetUrl = quoteTweetUrl;
    Composer.mediaIds = mediaIds || new Map();
    for(var entry of Composer.mediaIds.entries()) {
      Composer.addMediaId(entry[0], entry[1], true);
    }
    document.getElementById('tweet_text').value = message || '';
    Composer.showComposeArea(true, !shouldAnimate);
    Composer.textareaChanged();
  },

  quoteTweet: function (url) {
    Composer.showComposeArea(true);
    Composer.quoteTweetUrl = url;
    Composer.textareaChanged();
  },

  confirmDestroy: function(timelineId, destroyId) {
    $("#loading").show();

    tweetManager.destroy(function(success, data, status) {
      $("#loading").hide();
      var notFound = status && status.match(/Not Found/);
      if(success || notFound) {
        $(".tweet").filter("[tweetid='" + destroyId + "']").parents('.tweet_space').first().hide('blind', { direction: "vertical" });
        for(var entry of tweetManager.retweetsMap.entries()) {
          if(entry[1] == destroyId) {
            tweetManager.retweetsMap.delete(entry[0]);
          }
        }
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_deletingTweet", status), Composer.confirmDestroy.bind(Composer));
      }
    }, timelineId, destroyId);
  },

  destroy: function (timelineId, deleteTargetId, retweet) {
    if(!timelineId || !deleteTargetId) {
      return;
    }
    var dialogTitle = '', dialogMessage = '', dialogAction = '';
    if(retweet) {
      deleteTargetId = tweetManager.retweetsMap.get(deleteTargetId);
      dialogTitle = chrome.i18n.getMessage("deleteRT");
      dialogMessage = chrome.i18n.getMessage("deleteRTConfirm");
    } else {
      dialogTitle = chrome.i18n.getMessage("Delete");
      dialogMessage = chrome.i18n.getMessage("deleteConfirm");
    }
    $('#confirm_dialog')
    .attr('data-tweet-action', 'destroy')
    .attr('data-tweet-id', deleteTargetId)
    .attr('data-timeline-id', timelineId)
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
      } else if(data.churn) {
        Renderer.showError(chrome.i18n.getMessage("ue_churn_action"));
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_retweeting", status), Composer.confirmRT.bind(Composer));
      }
    }, rtId);
  },

  retweet: function (targetId) {
    if(!targetId) {
      return;
    }
    $('#confirm_dialog')
    .attr('data-tweet-action', 'retweet')
    .attr('data-tweet-id', targetId)
    .text(chrome.i18n.getMessage("retweetConfirm"))
    .dialog('option', 'title', chrome.i18n.getMessage("Retweet"))
    .dialog('open');
  },

  like: function (targetId) {
    if(!targetId) {
      return;
    }
    var loading = $("#loading");
    loading.show();
    tweetManager.createLike(function(success, data, status) {
      loading.hide();
      if(success) {
         Paginator.needsMore = false;
         loadTimeline();
      } else if(data.churn) {
        Renderer.showError(chrome.i18n.getMessage("ue_churn_action"));
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_markLike", status), Composer.like.bind(Composer));
      }
    }, targetId);
  },

  unLike: function (targetId) {
    if(!targetId) {
      return;
    }
    var loading = $("#loading");
    loading.show();
    tweetManager.destroyLike(function(success, data, status) {
      loading.hide();
      if(success) {
         Paginator.needsMore = false;
         loadTimeline();
      } else if(data.churn) {
        Renderer.showError(chrome.i18n.getMessage("ue_churn_action"));
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_unmarkLike", status), Composer.unLike.bind(Composer));
      }
    }, targetId);
  },

  addUser: function (replies) {
    var textArea = $("#tweet_text");
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

  reply: function (targetId, targetName) {
    if(!targetId || !targetName) {
      return;
    }
    Composer.showComposeArea(true);

    var replies = [`@${targetName}`];
    if(OptionsBackend.get('reply_all')) {
      var ownName = tweetManager.twitterBackend.userName;
      $(`.tweet[tweetid=${targetId}] .text_container > a`).each(function(){
        var t = $(this).text();
        if (t !== ownName && (/^[A-Z0-9_-]{1,15}$/i).test(t)) {
          var user = `@${t}`;
          if(replies.indexOf(user) === -1) {
            replies.push(user);
          }
        }
      });
    }

    if(Composer.replyId && $("#tweet_text").val().indexOf(Composer.replyUser) != -1) {
      this.addUser(replies);
      Composer.textareaChanged();
      return;
    }

    this.addUser(replies);
    tweetManager.composerData.replyId = Composer.replyId = targetId;
    tweetManager.composerData.replyUser = Composer.replyUser = targetName;

    Composer.textareaChanged();
  },

  message: function(targetName) {
    if(!targetName) {
      return;
    }
    Composer.showComposeArea(true);
    $("#tweet_text").val(`d ${targetName} `);
    Composer.textareaChanged();
  },

  showComposeArea: function (showOnly, noAnimation) {
    var composeArea = $("#compose_tweet_area");
    var textarea = document.getElementById('tweet_text');
    var visible = (composeArea.css('display') != 'none');
    var tmCompose = tweetManager.composerData;

    if(!visible) {
      if(noAnimation) {
        composeArea.show();
      } else {
        composeArea.show('blind', { direction: "vertical" }, 'normal', function() {
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
          textarea.focus();
        });
      }
      $("#compose_tweet > .glyphicon").removeClass('glyphicon-menu-down').addClass('glyphicon-menu-up');
      $("#composeText").text(chrome.i18n.getMessage('closeComposeTweet'));
      tmCompose.isComposing = true;
      Composer.syncComposerData();
      Composer.nowUploading(Composer.uploading);
    } else if(!showOnly) {
      if(noAnimation) {
        composeArea.hide();
      } else {
        composeArea.hide('blind', { direction: "vertical" });
      }
      $("#compose_tweet > .glyphicon").removeClass('glyphicon-menu-up').addClass('glyphicon-menu-down');
      $("#composeText").text(chrome.i18n.getMessage('composeText'));
      tmCompose.isComposing = false;
      Composer.nowUploading(false);
      Composer.resetComposerData(true);
      Composer.textareaChanged();
    }

    if((visible && showOnly) || (!visible && noAnimation)) {
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      textarea.focus();
    }
  },

  textareaChanged: function () {
    var str = document.getElementById('tweet_text').value || '';
    tweetManager.composerData.saveMessage = str;
    // check DM
    if(str == '') {
      Composer.maxAttachableImages = 4;
      Composer.dmTargetNameLength = 0;
      Composer.maxTextLength = Composer.maxTweetLength;
    } else {
      var isDM = str.match(Composer.matchDM);
      if(isDM !== null) {
        // Direct Message with Media is not enabled for 3rd-party applications.
        Composer.maxAttachableImages = 0;
        Composer.dmTargetNameLength = isDM[1].length + 3; // "d[space]hogehoge[space]"
        Composer.maxTextLength = Composer.maxDMLength;
      } else {
        Composer.maxAttachableImages = 4;
        Composer.dmTargetNameLength = 0;
        Composer.maxTextLength = Composer.maxTweetLength;
      }
      for(var mediaId of Composer.mediaIds.keys()) {
        if(Composer.mediaIds.size > Composer.maxAttachableImages) {
          Composer.mediaIds.delete(mediaId);
          $('#thumbnail-' + mediaId).off('.thumbnail').remove();
        } else break;
      }
    }
    // replace link anchor for counting strings
    str = str.replace(Composer.matchURL, Composer.dummyURLStrings)
             .replace(Composer.matchTLD, Composer.dummyURLStrings)
             .replace(Composer.matchSLD, Composer.dummyURLStrings);
    // check quote tweet
    var lengthOfQuoteTweet = 0;
    if(Composer.quoteTweetUrl && Composer.quoteTweetUrl.length > 0) {
      lengthOfQuoteTweet = 24; // a white space and reserved https link
      tweetManager.composerData.quoteTweetUrl = Composer.quoteTweetUrl;
      $('#quote_tweet_url')
      .find('#quote_tweet_text')
      .text(chrome.i18n.getMessage("l_quote_tweet_url", Composer.quoteTweetUrl))
      .end()
      .attr('style', 'display: flex; align-items: center;')
      .on('click.quote', '#quote_tweet_dismiss', function(event) {
        Composer.quoteTweetUrl = null;
        $(event.target.parent).hide();
        $(event.target).off('.quote');
        Composer.textareaChanged();
      });
      Composer.clearUploadedFiles();
      $('#upload_area').hide();
    } else {
      lengthOfQuoteTweet = 0;
      tweetManager.composerData.quoteTweetUrl = null;
      $('#quote_tweet_url')
      .find('#quote_tweet_text')
      .text('')
      .end()
      .attr('style', 'display: none')
      .off('.quote', '#quote_tweet_dismiss');
      $('#upload_area').show();
    }
    // check mediaIds
    if(Composer.mediaIds.size == 0) {
      Composer.picTwitterCom = 0;
    } else {
      Composer.picTwitterCom = tweetManager.twitterConfiguration.characters_reserved_per_media;
    }
    // counting strings
    var countStrings = 0;
    for(var i of str) ++countStrings; // Strings iterator consider surrogate-pair of Unicode
    // result
    var availableChars = Composer.maxTextLength - countStrings - Composer.picTwitterCom - lengthOfQuoteTweet + Composer.dmTargetNameLength;
    var charsLeftEl = document.getElementById("chars_left");
    charsLeftEl.textContent = availableChars;
    // attention
    if(availableChars < 0) {
      charsLeftEl.style.color = 'red';
    } else {
      charsLeftEl.style.color = 'black';
    }
    // check tweetable
    if(availableChars < 0 || availableChars == Composer.maxTextLength) {
      $('#tweetit').attr("disabled", "disabled");
    } else {
      $('#tweetit').removeAttr("disabled");
    }
  },

  sendTweet: function () {
    if(document.getElementById('tweetit').getAttribute('disabled') == 'disabled') return;
    var message = document.getElementById('tweet_text').value || '';
    var regexpResult = message.match(Composer.matchDM);
    if(regexpResult !== null) {
      message = message.substring(regexpResult[1].length + 3);
      tweetManager.enqueueTweet(message, regexpResult[1], Composer.replyUser, true, Composer.mediaIds);
    } else {
      if(Composer.quoteTweetUrl && Composer.quoteTweetUrl.length > 0) {
        message = message + ' ' + Composer.quoteTweetUrl;
      }
      tweetManager.enqueueTweet(message, Composer.replyId, Composer.replyUser, false, Composer.mediaIds);
    }
    Composer.resetComposerData(true);
    Composer.nowUploading(false);
    Composer.textareaChanged();
    Composer.showComposeArea();
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
    var textarea = $("#tweet_text");
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

  checkMacCommandKey: function(e) {
    if(!e) return;
    if((Composer.macCommandKey || e.ctrlKey) && e.which == 13) {
      Composer.macCommandKey = false;
      this.sendTweet();
      return;
    }
    if(e && (e.which == 91 || e.which == 93)) {
      Composer.macCommandKey = true;
    } else {
      Composer.macCommandKey = false;
    }
  },

  inputFileOnchange: function(event) {
    var files = Array.prototype.slice.call(event.target.files) || [];
    if(files.length > 0) {
      var pAll = [];
      files.forEach(function(file, index) {
        if(file.size <= Composer.maxImageSize) {
          if(Composer.mediaIds.size >= Composer.maxAttachableImages) {
            return;
          }
          pAll.push(new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(event) {
              var dataURI = event.target.result;
              tweetManager.twitterBackend.uploadMedia(function(success, data) {
                if(success && data.media_id_string) {
                  Composer.addMediaId(data.media_id_string, dataURI);
                } else {
                  console.warn(data);
                  Renderer.showError(chrome.i18n.getMessage("ue_media_upload_error"), null);
                }
                reader = null;
                resolve();
              }, dataURI.split(',')[1]);
            };
            reader.readAsDataURL(file);
          }));
        } else {
          Renderer.showError(chrome.i18n.getMessage("ue_too_big_image_size"), null);
        }
      });
      if(pAll.length > 0) {
        pAll = pAll.slice(0, Composer.maxAttachableImages);
        var loading = $("#loading");
        loading.show();
        Composer.nowUploading(true);
        Promise.all(pAll).then(function() {
          loading.hide();
          Composer.nowUploading(false);
          loading = null;
        }).catch(function(e) {
          console.warn(e);
          loading.hide();
          Composer.nowUploading(false);
          loading = null;
        });
      }
    }
  },

  addMediaId: function(mediaId, dataURI, thumbnailOnly) {
    if(!mediaId || !dataURI || Composer.mediaIds.size >= Composer.maxAttachableImages) {
      return;
    }
    $(document.createElement('img'))
    .attr({
      "src": dataURI,
      "id": 'thumbnail-' + mediaId,
      "data-media-id": mediaId
    })
    .on({
      "load.thumbnail": function(event) {
        if(thumbnailOnly) return;
        var thumbnail = './img/dummy_thumbnail.png';
        try {
          var canvas = document.createElement('canvas');
          canvas.width = 16;
          canvas.height = 16;
          var context2d = canvas.getContext('2d');
          context2d.drawImage(event.target, 0, 0, canvas.width, canvas.height)
          thumbnail = canvas.toDataURL();
        } catch(e) {
          console.warn(e);
        } finally {
          context2d = null;
          canvas = null;
        }
        Composer.mediaIds.set(mediaId, thumbnail);
        tweetManager.composerData.mediaIds = Composer.mediaIds;
        Composer.quoteTweetUrl = ''; // quote tweet with multiple meida is not effect
        Composer.textareaChanged();
      },
      "click.thumbnail": function(event) {
        var clickedEl = $(event.target),
            mediaId = clickedEl.data('mediaId');
        if(Composer.mediaIds.has(mediaId)) {
          Composer.mediaIds.delete(mediaId);
          tweetManager.composerData.mediaIds = Composer.mediaIds;
          $('#dismiss-' + event.target.dataset.mediaId).remove();
          clickedEl.off('.thumbnail').remove();
          Composer.textareaChanged();
        }
      },
      "mouseover.thumbnail": function(event) {
        $('<span class="ui-icon ui-icon-circle-close" id="dismiss-' + event.target.dataset.mediaId + '"></span>').insertAfter(event.target).css('marginLeft', '-20px');
      },
      "mouseout.thumbnail": function(event) {
        $('#dismiss-' + event.target.dataset.mediaId).remove();
      }
    })
    .appendTo('#upload_preview');
  },

  clearLoadedFile: function() {
    var inputEl = $("#image_input");
    inputEl.replaceWith(inputEl.clone()).on("change.popup", Composer.inputFileOnchange);
  },

  clearUploadedFiles: function() {
    $('#upload_preview').empty();
    Composer.clearLoadedFile();
    Composer.mediaIds.clear();
  },

  resetComposerData: function(withSync) {
    document.getElementById('tweet_text').value = '';
    Composer.replyId = null;
    Composer.replyUser = null;
    Composer.quoteTweetUrl = null;
    Composer.clearUploadedFiles();
    Shortener.clear();
    if(withSync) Composer.syncComposerData();
  },

  syncComposerData: function() {
    var tmCompose = tweetManager.composerData;
    tmCompose.saveMessage = document.getElementById('tweet_text').value;
    tmCompose.replyId = Composer.replyId;
    tmCompose.replyUser = Composer.replyUser;
    tmCompose.quoteTweetUrl = Composer.quoteTweetUrl;
    tmCompose.mediaIds = Composer.mediaIds;
    Shortener.sync(document.getElementById('shortener_text').value);
  },

  nowUploading: function(status) {
    if(!Composer.uploadable) {
      return;
    }
    Composer.uploading = status || false;
    if(Composer.uploading === true) {
      $('#upload_selector').text(chrome.i18n.getMessage("now_uploading"));
    } else {
      $('#upload_selector').text(chrome.i18n.getMessage("select_images_for_upload"));
    }
  }
};
