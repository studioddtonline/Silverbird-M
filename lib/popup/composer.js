const Composer = {
  __replyTargetUrl: null,
  get replyTargetUrl() {
    return Composer.__replyTargetUrl;
  },
  set replyTargetUrl(url) {
    if(Renderer.entitiesRegexp.replyTargetUrl.test(url)) {
      tweetManager.composerData.replyTargetUrl = Composer.__replyTargetUrl = url;
      document.querySelector("#reply_target_url").setAttribute("text", chrome.i18n.getMessage("l_reply_target_url", Composer.replyTargetUrl));
    } else {
      tweetManager.composerData.replyTargetUrl = Composer.__replyTargetUrl = null;
      document.querySelector("#reply_target_url").setAttribute("text", "");
    }
  },
  get replyId() {
    const result = Renderer.entitiesRegexp.replyTargetUrl.exec(Composer.__replyTargetUrl);
    if(!!result) {
      return result[3] || null;
    } else {
      return null;
    }
  },
  get replyUser() {
    const result = Renderer.entitiesRegexp.replyTargetUrl.exec(Composer.__replyTargetUrl);
    if(!!result) {
      return result[2] || null;
    } else {
      return null;
    }
  },
  mediaIds: new Map(),
  maxTextLength: tweetManager.twitterConfiguration.tweet_text_character_limit,
  maxTweetLength: tweetManager.twitterConfiguration.tweet_text_character_limit,
  maxDMLength: tweetManager.twitterConfiguration.dm_text_character_limit,
  maxAttachableImages: 4,
  maxImageSize: tweetManager.twitterConfiguration.photo_size_limit,
  macCommandKey: false,
  uncountLength: 0,
  __quoteTweetUrl: null,
  get quoteTweetUrl() {
    return Composer.__quoteTweetUrl;
  },
  set quoteTweetUrl(url) {
    if(Renderer.entitiesRegexp.quoteTweet.test(url)) {
      tweetManager.composerData.quoteTweetUrl = Composer.__quoteTweetUrl = url;
      document.querySelector("#quote_tweet_url").setAttribute("text", chrome.i18n.getMessage("l_quote_tweet_url", Composer.quoteTweetUrl));
      Composer.clearUploadedFiles();
    } else {
      tweetManager.composerData.quoteTweetUrl = Composer.__quoteTweetUrl = null;
      document.querySelector("#quote_tweet_url").setAttribute("text", "");
    }
  },
  matchReply: new RegExp(`^\\.?(@[a-zA-Z0-9_]{1,15}\\s+)+`, "u"),
  matchDM: new RegExp('^[dm] ([a-zA-Z0-9_]{1,15}) '),
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
    $("#image_input").on("change.popup", Composer.inputFileOnchange);
    $("#attach_button").on("click.popup", function(event) {
      event.preventDefault();
      if(ThemeManager.isPopup && !(/^Win/i.test(navigator.platform))) {
        Composer.syncComposerData();
        Renderer.detach();
        // close window
        return;
      }
      if(Composer.mediaIds.size >= Composer.maxAttachableImages) {
        Renderer.showError(chrome.i18n.getMessage("ue_max_attached_images"));
        return;
      }
      if(!Composer.uploading) {
        document.getElementById("image_input").dispatchEvent(new MouseEvent("click"));
      } else {
        Renderer.showError("uploading");
      }
    });
  },

  init: function() {
    if(!Composer.uploading) {
      Object.defineProperties(Composer, {
        "__uploading": {
          value: false,
          writable: true
        },
        "uploading": {
          get: () => {
            return this.__uploading;
          },
          set: (bool = false) => {
            this.__uploading = !!bool;
            const attach = document.querySelector("#attach_button");
            if(this.__uploading === true) {
              showLoading();
              attach.setAttribute("disabled", "disabled");
            } else if(this.__uploading === false) {
              hideLoading();
              attach.removeAttribute("disabled");
            } else {
              throw new TypeError("uncaught uploading");
            }
          }
        }
      });
    }
    if(tweetManager.composerData.isComposing) {
      Composer.initMessage(tweetManager.composerData.saveMessage, tweetManager.composerData.replyTargetUrl, tweetManager.composerData.quoteTweetUrl, tweetManager.composerData.mediaIds);
    } else {
      Composer.textareaChanged();
    }
  },

  initMessage: function(message, replyTargetUrl, quoteTweetUrl, mediaIds) {
    Composer.replyTargetUrl = replyTargetUrl;
    Composer.mediaIds = mediaIds || new Map();
    for(var entry of Composer.mediaIds.entries()) {
      Composer.addMediaId(entry[0], entry[1], true);
    }
    Composer.quoteTweetUrl = quoteTweetUrl;
    document.getElementById('tweet_text').value = message || '';
    Composer.showComposeArea(true);
    Composer.textareaChanged();
  },

  quoteTweet: function (url) {
    Composer.showComposeArea(true);
    Composer.quoteTweetUrl = url;
    Composer.textareaChanged();
  },

  confirmDestroy: function(timelineId, destroyId) {
    showLoading();
    tweetManager.destroy(function(success, data, status) {
      hideLoading();
      var notFound = status && /Not Found/i.test(status);
      if(success || notFound) {
        $(".tweet").filter("[tweetid='" + destroyId + "']").parents('.tweet_space').first().hide('blind', { direction: "vertical" });
        for(var entry of tweetManager.retweetsMap.entries()) {
          if(entry[1] == destroyId) {
            tweetManager.retweetsMap.delete(entry[0]);
          }
        }
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_deletingTweet", status));
      }
    }, timelineId, destroyId);
  },

  destroy: function (timelineId, deleteTargetId, retweet) {
    if(!timelineId || !deleteTargetId) {
      return;
    }
    var dialogTitle = '', dialogMessage = '', dialogAction = '';
    if(retweet) {
      deleteTargetId = tweetManager.retweetsMap.get(deleteTargetId) || deleteTargetId;
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
    showLoading();
    tweetManager.postRetweet(function(success, data, status) {
      hideLoading();
      if(success) {
        loadTimeline(true, "home");
      } else if(status === 327) {
        Renderer.showError(chrome.i18n.getMessage("ue_already_retweeting"));
      } else if(data !== null && typeof data["churn"] !== "undefined") {
        Renderer.showError(Renderer.constantStrings.churn_action);
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_retweeting", status));
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
    showLoading();
    tweetManager.createLike(function(success, data, status) {
      hideLoading()
      if(success) {
         Paginator.needsMore = false;
         loadTimeline();
      } else if(data !== null && typeof data["churn"] !== "undefined") {
        Renderer.showError(Renderer.constantStrings.churn_action);
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_markLike", status));
      }
    }, targetId);
  },

  unLike: function (targetId) {
    if(!targetId) {
      return;
    }
    showLoading();
    tweetManager.destroyLike(function(success, data, status) {
      hideLoading();
      if(success) {
         Paginator.needsMore = false;
         loadTimeline();
      } else if(data !== null && typeof data["churn"] !== "undefined") {
        Renderer.showError(Renderer.constantStrings.churn_action);
      } else {
        Renderer.showError(chrome.i18n.getMessage("ue_unmarkLike", status));
      }
    }, targetId);
  },

  addUser: function (replies = []) {
    if(!Array.isArray(replies) || replies.length < 1) {
      return;
    }
    const textArea = $("#tweet_text");
    let currentVal = textArea.val();
    if(currentVal.length > 0 && currentVal[currentVal.length - 1] !== ' ') {
      currentVal += ' ';
    }
    textArea.val(`${currentVal}${replies.join(' ')}`);
  },

  reply: function (targetUrl) {
    if(!targetUrl) {
      tweetManager.composerData.replyTargetUrl = Composer.replyTargetUrl = null;
      return;
    } else {
      tweetManager.composerData.replyTargetUrl = Composer.replyTargetUrl = targetUrl;
    }
    Composer.showComposeArea(true);

    const replies = new Set([`@${Composer.replyUser}`]);
    if(OptionsBackend.get('reply_all')) {
      $(`.tweet[tweetid="${Composer.replyId}"] .text_container > a`).each(function(){
        const memtion = $(this).text();
        if (/^@[A-Z0-9_-]{1,15}$/i.test(memtion)) {
          replies.add(memtion);
        }
      });
      replies.delete(`@${tweetManager.twitterBackend.userName}`);
    }

    const currentText = $("#tweet_text").val();
    if(replies.size > 0) {
      replies.forEach((mention) => {
        if(currentText.includes(mention)) {
          replies.delete(mention);
        }
      });
    }

    this.addUser([...replies]);
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

  showComposeArea: function (showOnly) {
    var composeArea = document.querySelector("silm-composer");
    var textarea = document.getElementById('tweet_text');
    var visible = (composeArea.getAttribute("composed") === "true");
    var tmCompose = tweetManager.composerData;

    if(!visible) {
      composeArea.setAttribute("composed", "true");
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      textarea.focus();
      tmCompose.isComposing = true;
      Composer.syncComposerData();
    } else if(!showOnly) {
      if(Composer.uploading) {
        //TODO abort uploading
      }
      composeArea.setAttribute("composed", "false");
      tmCompose.isComposing = false;
      Composer.resetComposerData(true);
      Composer.textareaChanged();
    }

    if(visible && showOnly) {
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      textarea.focus();
    }
  },

  textareaChanged: function () {
    let str = document.getElementById('tweet_text').value || '';
    tweetManager.composerData.saveMessage = str;
    // check DM
    if(str == '') {
      Composer.maxAttachableImages = 4;
      Composer.uncountLength = 0;
      Composer.maxTextLength = Composer.maxTweetLength;
    } else {
      const isDM = str.match(Composer.matchDM);
      const isReply = str.match(Composer.matchReply);
      if(isDM !== null) {
        // Direct Message with Media is not enabled for 3rd-party applications.
        Composer.maxAttachableImages = 0;
        Composer.uncountLength = isDM[1].length + 3; // "d[space]hogehoge[space]"
        Composer.maxTextLength = Composer.maxDMLength;
        // AttachURL is not enabled in DM
        Composer.quoteTweetUrl = null;
        Composer.replyTargetUrl = null;
      } else if(isReply !== null && !!Composer.replyTargetUrl && OptionsBackend.get("reply_all")) {
        Composer.maxAttachableImages = 4;
        Composer.uncountLength = isReply[0].length;
        Composer.maxTextLength = Composer.maxTweetLength;
      } else {
        Composer.maxAttachableImages = 4;
        Composer.uncountLength = 0;
        Composer.maxTextLength = Composer.maxTweetLength;
      }
      for(let mediaId of Composer.mediaIds.keys()) {
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
    // counting strings
    let countStrings = 0;
    for(let i of str) {
      ++countStrings; // Strings iterator consider surrogate-pair of Unicode
    }
    // result
    const availableChars = Composer.maxTextLength - countStrings + Composer.uncountLength;
    const charsLeftEl = document.getElementById("chars_left");
    charsLeftEl.textContent = availableChars;
    // attention
    if(availableChars < 0) {
      charsLeftEl.style.color = 'red';
    } else {
      charsLeftEl.style.color = 'black';
    }
    // check tweetable
    if((availableChars < 0 || availableChars == Composer.maxTextLength) && Composer.mediaIds.size === 0) {
      $('#tweetit').attr("disabled", "disabled");
    } else {
      $('#tweetit').removeAttr("disabled");
    }
  },

  sendTweet: function () {
    if(document.getElementById("tweetit").getAttribute("disabled") === "disabled") {
      return;
    }
    let message = document.getElementById("tweet_text").value || "";
    let replyId = Composer.replyId;
    let replyUser = Composer.replyUser;
    const resultMatchDM = message.match(Composer.matchDM);
    const isDM = resultMatchDM !== null;
    const resultMatchReply = message.match(Composer.matchReply);
    const isReply = resultMatchReply !== null && !!Composer.replyTargetUrl && OptionsBackend.get("reply_all");
    let mediaIds = Composer.mediaIds;
    let qtUrl = Composer.quoteTweetUrl;
    if(isDM) {
      message = message.substring(resultMatchDM[1].length + 3);
      replyUser = resultMatchDM[1];
      mediaIds = undefined;
      qtUrl = undefined;
    } else {
      if(isReply) {
        message = message.substring(resultMatchReply[0].length);
      }
      if(!!qtUrl) {
        mediaIds = undefined;
      } else {
        qtUrl = undefined;
      }
    }
    tweetManager.enqueueTweet(message, replyId, replyUser, isDM, mediaIds, qtUrl);
    Composer.resetComposerData(true);
    Composer.textareaChanged();
    Composer.showComposeArea();
  },

  refreshNew: function() {
    if(document.querySelector("silm-loadingicon").visible) {
      return;
    }
    loadTimeline(true);
  },

  isVisible: function() {
    var composeArea = document.querySelector("silm-composer");
    var textarea = document.getElementById('tweet_text');
    var visible = (composeArea.getAttribute("composed") === "true");
    return visible && textarea.value.length > 0;
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
      Composer.uploading = true;
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
                  Renderer.showError(chrome.i18n.getMessage("ue_media_upload_error"));
                }
                reader = null;
                resolve();
              }, dataURI.split(',')[1]);
            };
            reader.readAsDataURL(file);
          }));
        } else {
          Renderer.showError(chrome.i18n.getMessage("ue_too_big_image_size"));
        }
      });
      if(pAll.length > 0) {
        pAll = pAll.slice(0, Composer.maxAttachableImages);
        Promise.all(pAll).then(function() {
          Composer.uploading = false;
          Composer.clearLoadedFile();
        }).catch(function(e) {
          console.warn(e);
          Composer.uploading = false;
          Composer.clearLoadedFile();
        });
      } else {
        Composer.uploading = false;
        Composer.clearLoadedFile();
      }
    }
  },

  addMediaId: function(mediaId, dataURI, thumbnailOnly) {
    if(!mediaId || !dataURI || Composer.mediaIds.size > Composer.maxAttachableImages) {
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
    .appendTo('#upload_previews');
  },

  clearLoadedFile: function() {
    document.querySelector("#image_input").value = "";
  },

  clearUploadedFiles: function() {
    $('#upload_previews').empty();
    Composer.clearLoadedFile();
    Composer.mediaIds.clear();
  },

  resetComposerData: function(withSync) {
    document.getElementById('tweet_text').value = '';
    Composer.replyTargetUrl = null;
    Composer.quoteTweetUrl = null;
    Composer.clearUploadedFiles();
    if(withSync) Composer.syncComposerData();
  },

  syncComposerData: function() {
    var tmCompose = tweetManager.composerData;
    tmCompose.saveMessage = document.getElementById('tweet_text').value;
    tmCompose.replyTargetUrl = Composer.replyTargetUrl;
    tmCompose.quoteTweetUrl = Composer.quoteTweetUrl;
    tmCompose.mediaIds = Composer.mediaIds;
  }
};
