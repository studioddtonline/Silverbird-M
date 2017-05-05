const Renderer = {
  URLS: {
    BASE: 'https://twitter.com/',
    SEARCH: 'https://twitter.com/search?q='
  },

  removeListenerForNewActions: (target = document) => {
    if(!target.querySelectorAll) {
      return;
    }
    const targets = target.querySelectorAll(".new_actions_item");
    if(!targets) {
      return;
    }
    targets.forEach((el) => {
      if(!!el.handlerClick) {
        el.removeEventListener("click", el.handlerClick);
        el.handlerClick = null;
      }
    })
  },

  io: new IntersectionObserver((changes) => {
    const now = Date.now();
    for(let change of changes) {
      let target = change.target;
      if(change.intersectionRatio < 0.01) {
        if(!!target.idleId) {
          cancelIdleCallback(target.idleId);
          target.idleId = null;
        }
        Renderer.removeListenerForNewActions(target);
      } else {
        requestIdleCallback(() => {
          const handleLinks = target.querySelectorAll(".handleLink");
          if(!!handleLinks) {
            handleLinks.forEach(Renderer.handleLinkEachFunc);
          }
          const createUserActionMenus = target.querySelectorAll(".createUserActionMenu");
          if(!!createUserActionMenus) {
            createUserActionMenus.forEach((el) => {
              Renderer.createUserActionMenu.bind(el)();
            });
          }
          const handleHashTags = target.querySelectorAll(".handleHashTag");
          if(!!handleHashTags) {
            handleHashTags.forEach(Renderer.handleHashTagFunc);
          }
          const expandInReplies = target.querySelectorAll(".expandInReply");
          if(!!expandInReplies) {
            expandInReplies.forEach(Renderer.expandInReplyFunc);
          }
          const newActionsItems = target.querySelectorAll(".new_actions_item");
          if(!!newActionsItems) {
            newActionsItems.forEach((item) => {
              if(!!item.handlerClick) {
                return;
              }
              item.handlerClick = (event) => {
                const cl = event.target.classList;
                switch(true) {
                  case (cl.contains('action_like')):
                    Composer.like(event.target.dataset.likeTargetId);
                    break;
                  case (cl.contains('action_unlike')):
                    Composer.unLike(event.target.dataset.likeTargetId);
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
                      Composer.reply(event.target.dataset.replyTargetUrl);
                    } else {
                      const targetName = Renderer.entitiesRegexp.replyTargetUrl.exec(event.target.dataset.replyTargetUrl)[2];
                      Composer.message(targetName);
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
              };
              item.addEventListener("click", item.handlerClick);
            });
          }
        });
        const dataCreatedAt = target.querySelectorAll("[data-created-at]");
        if(!!dataCreatedAt && !target.idleId) {
          target.idleId = requestIdleCallback(() => {
            dataCreatedAt.forEach((el) => {
              el.textContent = Renderer.getTimestampText(new Date(el.dataset.createdAt), now);
            });
            target.idleId = null;
          });
        }
        const newActions = target.querySelector(".new_actions");
        if(!!newActions) {
          requestIdleCallback(() => {
            newActions.style.maxHeight = `${target.clientHeight}px`;
          });
        }
      }
    }
  }, {
    root: document.querySelector("#tabs"),
    threshold: [0, 0.01]
  }),

  observed: new WeakSet(),

  applyObserve: (target = document) => {
    if(!target.querySelectorAll) {
      target = document;
    }
    let targets;
    if(!!target.classList && target.classList.contains("tweet")) {
      targets = [target];
    } else {
      targets = target.querySelectorAll(".tweet") || [];
    }
    targets.forEach((el) => {
      if(!Renderer.observed.has(el)) {
        Renderer.io.observe(el);
        Renderer.observed.add(el);
      }
    });
  },

  applyUnobserve: (target = document) => {
    if(!target.querySelectorAll) {
      target = document;
    }
    let targets;
    if(!!target.classList && target.classList.contains("tweet")) {
      targets = [target];
    } else {
      targets = target.querySelectorAll(".tweet") || [];
    }
    targets.forEach((el) => {
      if(Renderer.observed.has(el)) {
        Renderer.io.unobserve(el);
        Renderer.observed.delete(el);
      }
    });
  },

  constantStrings: {
    justNow: chrome.i18n.getMessage("justNow"),
    minuteAgo: chrome.i18n.getMessage("minuteAgo"),
    minute_singular: chrome.i18n.getMessage("minute_singular"),
    minute_plural: chrome.i18n.getMessage("minute_plural"),
    hour_singular: chrome.i18n.getMessage("hour_singular"),
    hour_plural: chrome.i18n.getMessage("hour_plural"),
    day_singular: chrome.i18n.getMessage("day_singular"),
    day_plural: chrome.i18n.getMessage("day_plural"),
    expand_quote: chrome.i18n.getMessage("expand_quote_tweet"),
    retweetedByMe: chrome.i18n.getMessage("retweetedByMe"),
    retweetedBy_prefix: chrome.i18n.getMessage("retweetedBy_prefix"),
    retweetedBy_suffix: chrome.i18n.getMessage("retweetedBy_suffix"),
    sentTo_prefix: chrome.i18n.getMessage("sentTo_prefix"),
    sentTo_suffix: chrome.i18n.getMessage("sentTo_suffix"),
    footer_list: chrome.i18n.getMessage("f_footer_list"),
    verified_account: chrome.i18n.getMessage("verified_account"),
    protected_account: chrome.i18n.getMessage("protected_account"),
    fromApp_prefix: chrome.i18n.getMessage("fromApp_prefix"),
    fromApp_suffix: chrome.i18n.getMessage("fromApp_suffix"),
    inReply_prefix: chrome.i18n.getMessage("inReply_prefix"),
    inReply_suffix: chrome.i18n.getMessage("inReply_suffix"),
    unmarkLike: chrome.i18n.getMessage("unmarkLike"),
    markLike: chrome.i18n.getMessage("markLike"),
    reply: chrome.i18n.getMessage("Reply"),
    retweet: chrome.i18n.getMessage("Retweet"),
    quoteTweet: chrome.i18n.getMessage("quoteTweet"),
    deleteTweet: chrome.i18n.getMessage("Delete"),
    deleteRT: chrome.i18n.getMessage("deleteRT"),
    directMessage: chrome.i18n.getMessage("directMessage"),
    tweets_action: chrome.i18n.getMessage("tweets_action"),
    profile_action: chrome.i18n.getMessage("profile_action"),
    churn_action: chrome.i18n.getMessage("ue_churn_action"),
    add_mention_action: chrome.i18n.getMessage("add_mention_action"),
    follow_action: chrome.i18n.getMessage("follow_action"),
    unfollow_action: chrome.i18n.getMessage("unfollow_action"),
    mute_action: chrome.i18n.getMessage("mute_action"),
    unmute_action: chrome.i18n.getMessage("unmute_action"),
    block_action: chrome.i18n.getMessage("block_action"),
    unblock_action: chrome.i18n.getMessage("unblock_action"),
    report_action: chrome.i18n.getMessage("report_action"),
    expanding_url: chrome.i18n.getMessage("expanding_url")
  },
  
  getTimestampText: function (inputTimestamp, now = Date.now()) {
    if(!(inputTimestamp instanceof Date)) {
      throw new TypeError("inputTimestamp is not Date object");
    }
    const diff = (now - inputTimestamp) * 0.001 | 0;

    if(diff < 15) {
      return Renderer.constantStrings.justNow;
    } else if(diff < 60) {
      return Renderer.constantStrings.minuteAgo;
    } else if(diff < 60 * 60) {
      const minutes = diff / 60 | 0;
      const minute_string = minutes > 1 ? "minute_plural" : "minute_singular";
      return chrome.i18n.getMessage("minutes", [minutes, Renderer.constantStrings[minute_string]]);
    } else if(diff < 60 * 60 * 24) {
      const hours = diff / (60 * 60) | 0;
      const hour_string = hours > 1 ? "hour_plural" : "hour_singular";
      return chrome.i18n.getMessage("timeAgo", [hours, Renderer.constantStrings[hour_string]]);
    } else if(diff < 60 * 60 * 24 * 7) {
      const days = diff / (60 * 60 * 24) | 0;
      const day_string = days > 1 ? "day_plural" : "day_singular";
      return chrome.i18n.getMessage("timeAgo", [days, Renderer.constantStrings[day_string]]);
    } else {
      return inputTimestamp.toLocaleString();
    }
  },

  entitiesRegexp: {
    quoteTweet: new RegExp('^https?://(mobile\\.)?twitter.com/[\\w\\d_]{1,15}/statuse?s?/(\\d+)[^\\d]*?', 'i'),
    replyTargetUrl: new RegExp('^https?://(mobile\\.)?twitter.com/([\\w\\d_]{1,15})/statuse?s?/(\\d+)[^\\d]*?', 'i'),
    searchTweet: new RegExp('^https?://twitter.com/search\\?(.*)?$', 'i')
  },

  parseEntities: function(tweet, isRetweet = true) {
    const baseTweet = Renderer.decideBaseTweet(tweet, isRetweet);
    let ret = [...baseTweet.text];
    for(let i in baseTweet.entities) {
      let entity = baseTweet.entities[i];
      switch(i) {
        case "user_mentions":
          ret = Renderer.parseUserMentionsEntity(ret, entity);
          break;
        case "hashtags":
          ret = Renderer.parseHashtagsEntity(ret, entity);
          break;
        case "urls":
          ret = Renderer.parseUrlsEntity(ret, entity, tweet.silm_tweetSpaceId, baseTweet.quoted_status);
          break;
        case "media":
          ret = Renderer.parseMediaEntity(ret, entity, baseTweet.extended_entities);
          break;
        case "symbols":
        //  ret = Renderer.parseSymbolsEntity(ret, entity);
          break;
        default:
          console.warn(`unknown entity: ${i}`);
          break;
      }
    }
    return ret.join("").replace(/\r?\n/g, "<br />");
  },

  parseUserMentionsEntity: function(texts = [], entity = []) {
    let ret = texts;
    entity.forEach((item) => {
      if(!!item.indices || Array.isArray(item.indices)) {
        const [indexStart, indexEnd] = item.indices;
        const suspiciousTarget = ret.slice(indexStart, indexEnd).join("");
        ret.splice(indexStart, 1, `<a href="${Renderer.URLS.BASE}${item.screen_name}" class="createUserActionMenu" data-user-id="${item.id_str}" data-user-name="${item.screen_name}">${ret[indexStart] || ""}`);
        ret.splice(indexEnd - 1, 1, `${ret[indexEnd - 1] || ""}</a>`);
      }
    });
    return ret;
  },

  parseHashtagsEntity: function(texts = [], entity = []) {
    let ret = texts;
    entity.forEach((item) => {
      if(!!item.indices || Array.isArray(item.indices)) {
        const [indexStart, indexEnd] = item.indices;
        const suspiciousTarget = ret.slice(indexStart, indexEnd).join("");
        ret.splice(indexStart, 1, `<a href="${item.url}" class="handleHashTag" data-handle-hash-tag="#${item.text}">${ret[indexStart] || ""}`);
        ret.splice(indexEnd - 1, 1, `${ret[indexEnd - 1] || ""}</a>`);
      }
    });
    return ret;
  },

  parseUrlsEntity: function(texts = [], entity = [], tweetSpaceId = "", quotedStatus = {id_str: null}) {
    let ret = texts;
    const searchRegexp = Renderer.entitiesRegexp.searchTweet;
    const quoteRegexp = Renderer.entitiesRegexp.quoteTweet;
    entity.forEach((item) => {
      if(!!item.indices || Array.isArray(item.indices)) {
        const [indexStart, indexEnd] = item.indices;
        const suspiciousTarget = ret.slice(indexStart, indexEnd).join("");
        const spliceLength = indexEnd - indexStart;
        const spliceArray = new Array(spliceLength).fill("");
        if(searchRegexp.test(item.expanded_url)) {
          let decodedUrl = item.expanded_url;
          try {
            decodedUrl = decodeURIComponent(item.expanded_url);
          } catch(e) {
            console.warn(`parseUrlsEntity error: %o, target: %s`, e, item.expanded_url);
          }
          const searchStrings = new URLSearchParams(searchRegexp.exec(decodedUrl)[1] || "");
          if(!searchStrings.has("q")) {
            spliceArray[0] = `<a href="${item.url}" class="handleLink" data-handle-link-base="${item.url}" data-handle-link-expanded="${item.expanded_url}" data-handle-link-media="${item.media_url_https || ""}" title="${item.expanded_url}">${item.display_url}</a>`;
          } else {
            const displayStrings = searchStrings.get("q").replace(/^"(.*)?"$/, `$1`);
            spliceArray[0] = `<a href="${item.url}" class="handleHashTag" data-handle-hash-tag="${displayStrings}">${displayStrings}</a>`;
          }
        } else if(quoteRegexp.test(item.expanded_url)) {
          let quotedTweetId = quoteRegexp.exec(item.expanded_url)[2] || "";
          let quotedTweetEntity = {
            in_reply_to_status_id_str: quotedTweetId
          };
          if(!!quotedStatus && quotedStatus.id_str === quotedTweetId) {
            quotedTweetEntity.inReplyToTweet = quotedStatus;
          }
          spliceArray[0] = `<span><span class="glyphicon glyphicon-link"></span><a href="${item.url}" class="expandInReply" data-handle-link-base="${item.url}" data-handle-link-expanded="${item.expanded_url}" data-handle-link-media="${item.media_url_https || ""}" data-expand-in-reply-tweet="${escape(JSON.stringify(quotedTweetEntity))}" data-expand-in-reply-id="${tweetSpaceId}" title="${Renderer.constantStrings.expand_quote}">${item.display_url}</a></span>`;
        } else {
          spliceArray[0] = `<a href="${item.url}" class="handleLink" data-handle-link-base="${item.url}" data-handle-link-expanded="${item.expanded_url}" data-handle-link-media="${item.media_url_https || ""}" title="${item.expanded_url}">${item.display_url}</a>`;
        }
        ret.splice(indexStart, spliceLength, ...spliceArray);
      }
    });
    return ret;
  },

  parseMediaEntity: function(texts = [], entity = [], extendedEntities = null) {
    let ret = texts;
    entity.forEach((item) => {
      if(!!item.indices || Array.isArray(item.indices)) {
        const [indexStart, indexEnd] = item.indices;
        const suspiciousTarget = ret.slice(indexStart, indexEnd).join("");
        const spliceLength = indexEnd - indexStart;
        const spliceArray = new Array(spliceLength).fill("");
        let extendedAttribute = "";
        let suffixContent = "";
        if(!!extendedEntities && Array.isArray(extendedEntities.media) && extendedEntities.media.length > 1) {
          extendedAttribute = `data-handle-link-base="${item.expanded_url}" data-handle-link-expanded="undefined" data-handle-link-media="undefined" data-handle-link-noexpand="true"`;
          suffixContent = ` ${extendedEntities.media.map(function(value, index) {
            return `<a href="${value.url}" class="handleLink" data-handle-link-base="${value.url}" data-handle-link-expanded="${value.expanded_url}" data-handle-link-media="${value.media_url_https}" title="${value.expanded_url}">[${(index + 1)}]</a>`;
          }).join(' ')}`;
        } else {
          extendedAttribute = `data-handle-link-base="${item.url}" data-handle-link-expanded="${item.expanded_url}" data-handle-link-media="${item.media_url_https}" title="${item.expanded_url}"`;
        }
        spliceArray[0] = `<a href="${item.url}" class="handleLink" ${extendedAttribute}>${item.display_url}</a>${suffixContent}`;
        ret.splice(indexStart, spliceLength, ...spliceArray);
      }
    });
    return ret;
  },

  parseSymbolsEntity: function(texts = [], entity = []) {
    return texts;
  },

  renderTweet: function (tweet, now, displayOptions) {
    tweet = Renderer.toCompatTweet(tweet);
    const selfTweet = (tweet.user.id_str == tweetManager.twitterBackend.userId);
    if(selfTweet && !tweetManager.isRetweeted(tweet) && !!tweet.retweeted_status) {
      tweetManager.retweetsMap.set(tweet.retweeted_status.id_str, tweet.id_str);
    }
    tweet.silm_tweetSpaceId = `id${now}${tweet.id_str}`;
    if(!tweet.silm_tweetTimelineId) {
      tweet.silm_tweetTimelineId = tweet.timelineId || tweetManager.currentTimelineId || 'home';
    }
    const templateId = tweet.silm_tweetTimelineId.replace(/_.*$/, '');
    const hereIsDM = (templateId == TimelineTemplate.RECEIVED_DMS) || (templateId == TimelineTemplate.SENT_DMS) || false;
    const isDummy = !!tweet.is_dummy || false;

    // retweets_container
    let retweets_container = "";
    if(!displayOptions.hiddenRetweetInfo && (!!tweet.retweeted_status || !!tweet.current_user_retweet)) {
      retweets_container += `<div class="retweets_container">`;
      retweets_container += Renderer.buildDeleteRetweetAction(tweet, selfTweet);
      retweets_container += `<span class="glyphicon glyphicon-retweet"></span>`;
      if(selfTweet || !!tweet.current_user_retweet) {
        retweets_container += `<span class="selfRetweet">${Renderer.constantStrings.retweetedByMe}</span>`;
      } else {
        retweets_container += `<span class="inRetweet">${Renderer.buildIcon(tweet, false, {hiddenUserIcons: displayOptions.hiddenUserIcons, iconSize: "retweeter"})}${Renderer.constantStrings.retweetedBy_prefix}<a href="${Renderer.URLS.BASE}${tweet.user.screen_name}" data-user-id="${tweet.user.id_str}" data-user-name="${tweet.user.screen_name}" class="createUserActionMenu">${tweet.user.screen_name}</a>${Renderer.constantStrings.retweetedBy_suffix}</span>`;
      }
      retweets_container += Renderer.buildTimestamp(tweet, now, false, true, displayOptions);
      retweets_container += Renderer.buildFromApp(tweet, false, displayOptions);
      retweets_container += `</div>`;
    }

    // icon_conteiner
    let icon_container = `<div class="icon_container">${Renderer.buildIcon(tweet, true, displayOptions)}</div>`;

    // name_container
    let name_container = Renderer.buildName(tweet, true, displayOptions);

    // text_container
    let text_container = `<div class="text_container">${Renderer.parseEntities(tweet)}</div>`;

    // footer_container
    let footer_container = "";
    if(!displayOptions.hiddenFooter) {
      let footer_content = "";
      // timestamp
      footer_content += Renderer.buildTimestamp(tweet, now, true, !isDummy, displayOptions);
      // reply
      footer_content += Renderer.buildReply(tweet, true, displayOptions);
      // retweet count
      footer_content += Renderer.buildRetweetCounts(tweet, true, displayOptions);
      // favorite count
      footer_content += Renderer.buildLikeCounts(tweet, true, displayOptions);
      // from App
      footer_content += Renderer.buildFromApp(tweet, true, displayOptions);
      // DM
      if(!displayOptions.hiddenDMInfo && templateId == TimelineTemplate.SENT_DMS) {
        footer_content += `<span class="dm_recipient">${Renderer.constantStrings.sentTo_prefix}<a href="#" data-user-id="${tweet.recipient.id_str}" data-user-name="${tweet.recipient.screen_name}" class="createUserActionMenu">${tweet.recipient.name}</a>${Renderer.constantStrings.sentTo_suffix}</span>`;
      }
      // geo
      footer_content += Renderer.buildGeo(tweet, true, displayOptions);
      // from list
      if(!displayOptions.hiddenListInfo && templateId == TimelineTemplate.LISTS && tweetManager.currentTimelineId !== tweet.silm_tweetTimelineId) {
        let list = tweetManager.getList(tweet.silm_tweetTimelineId) || null;
        if(!!list) {
          let linkPath = list.uri.substr(1);
          footer_content += `<span class="from_list">(${Renderer.constantStrings.footer_list}: <a class="handleLink" data-handle-link-noexpand="true" data-handle-link-base="${Renderer.URLS.BASE}${linkPath}" href="#" title="@${linkPath}">${list.name}</a>)</span>`;
        }
      }
      footer_container = `<div class="footer_container">${footer_content}</div>`;
    }

    // content_container
    let content_container = `<div class="content_container">${name_container}${text_container}</div>`;

    // main_container
    let main_container = `<div class="main_container">${icon_container}${content_container}</div>`;

    // new_actions
    let newActions_container = "";
    if(!isDummy) {
      newActions_container = '<div class="new_actions">';
      // favorite
      newActions_container += Renderer.buildFavoriteAction(tweet, true, hereIsDM);
      // reply
      newActions_container += Renderer.buildReplyAction(tweet, true, hereIsDM, selfTweet);
      // retweet and quote
      newActions_container += Renderer.buildRetweetAction(tweet, true, hereIsDM, selfTweet);
      // delete
      newActions_container += Renderer.buildDeleteAction(tweet, hereIsDM, selfTweet);
      // dm
      newActions_container += Renderer.buildDmAction(tweet, true, hereIsDM);
      newActions_container += '</div>';
    }

    // build tweetSpace
    let overlayStyle = "";
    if(displayOptions.useColors) {
      const color = displayOptions.colors[`${hereIsDM? "dms": templateId}_tweets_color`];
      overlayStyle = ` style="background-color: ${color};"`;
    }
    return `
      <div class="tweet_space" id="${tweet.silm_tweetSpaceId}">
        <div class="chromed_bird_tweet tweet" timelineid="${tweet.silm_tweetTimelineId}" tweetid="${tweet.id_str}">
          <div class="tweet_overlay"${overlayStyle}>
            <div class="first_container">${retweets_container}${main_container}${footer_container}</div>
            ${newActions_container}
          </div>
        </div>
      </div>
    `;
  },

  toCompatTweet: function(tweet) {
    if(tweet.hasOwnProperty("extended_tweet")) {
      tweet.entities = tweet.extended_tweet.entities;
      tweet.extended_entities = {
        media: tweet.extended_tweet.entities.media
      };
      tweet.full_text = tweet.extended_tweet.full_text;
    }
    if(tweet.hasOwnProperty("full_text")) {
      tweet.text = tweet.full_text;
    }
    if(tweet.hasOwnProperty("retweeted_status")) {
      tweet.retweeted_status = Renderer.toCompatTweet(tweet.retweeted_status);
    }
    if(tweet.hasOwnProperty("quoted_status")) {
      tweet.quoted_status = Renderer.toCompatTweet(tweet.quoted_status);
    }
    return tweet;
  },

  decideBaseTweet: function(tweet, isRetweet = true, prop = null) {
    const baseTweet = (isRetweet && !!tweet.retweeted_status)? tweet.retweeted_status: tweet;
    if(!!prop) {
      if(baseTweet.hasOwnProperty(prop)) {
        return baseTweet[prop];
      } else {
        return undefined;
      }
    } else  {
      return baseTweet;
    }
  },

  buildTimestamp: function(tweet, now = Date.now(), isRetweet, withAnchor, displayOptions = {hiddenTimestamp: false}) {
    let ret = "";
    if(!displayOptions.hiddenTimestamp) {
      const baseTime = Renderer.decideBaseTweet(tweet, isRetweet, "created_at");
      let processedTime = "";
      if(!!withAnchor) {
        let timestamp_url = Renderer.buildTimestampUrl(tweet, isRetweet);
        processedTime = `<a class="handleLink"
                            data-handle-link-noexpand="true"
                            data-handle-link-base="${timestamp_url}"
                            title="${timestamp_url}"
                            data-created-at="${baseTime}"
                            href="${timestamp_url}"></a>`;
      }
      ret = `<span class="timestamp">${processedTime}</span>`;
    }
    return ret;
  },

  buildTimestampUrl: function(tweet, isRetweet = true) {
    const baseTweet = Renderer.decideBaseTweet(tweet, isRetweet);
    return `${Renderer.URLS.BASE}${baseTweet.user.screen_name}/status/${baseTweet.id_str}`;
  },

  buildName: function(tweet, isRetweet = true, displayOptions = {displaySimpleName: false, nameAttribute: "both"}) {
    const user = Renderer.decideBaseTweet(tweet, isRetweet, "user");
    const usn = user.screen_name;
    const uid = user.id_str;
    let ret = `<a href="#" data-user-id="${uid}" data-user-name="${usn}" class="createUserActionMenu user" screen_name="${usn}"`;
    if(displayOptions.nameAttribute == "both") {
      const bothContent = !displayOptions.displaySimpleName? `</div><div class="secondary_name">`: "";
      ret += `>${user.name}</a>${bothContent}<a href="#" data-user-id="${uid}" data-user-name="${usn}" class="createUserActionMenu user" screen_name="${usn}">@${usn}</a>`;
    } else if(displayOptions.nameAttribute == "screen_name") {
      ret += ` title="${user.name}">@${usn}</a>`;
    } else if(displayOptions.nameAttribute == "name") {
      ret += ` title="@${usn}">${user.name}</a>`;
    }
    const userVerified = (!!user.verified && !displayOptions.displaySimpleName)? `<span class="glyphicon glyphicon-check verifiedAccount" title="${Renderer.constantStrings.verified_account}"></span>`: "";
    const userProtected = (!!user.protected && !displayOptions.displaySimpleName)? `<span class="glyphicon glyphicon-lock protectedAccount" title="${Renderer.constantStrings.protected_account}"></span>`: "";
    return `<div class="name_container"><div class="primary_name">${ret}</div>${userVerified}${userProtected}</div>`;
  },

  buildFromApp: function(tweet, isRetweet = true, displayOptions = {hiddenClientName: false}) {
    let source = Renderer.decideBaseTweet(tweet, isRetweet, "source");
    let ret = "";
    if(!displayOptions.hiddenClientName && !!source) {
      source = source.replace(/href=/i, `class="handleLink" href="#" data-handle-link-noexpand="true" data-handle-link-base=`);
      ret = `<span class="from_app">${Renderer.constantStrings.fromApp_prefix}${source}${Renderer.constantStrings.fromApp_suffix}</span>`;
    }
    return ret;
  },

  buildIcon: function(tweet, isRetweet = true, displayOptions = {hiddenUserIcons: false, iconSize: "icon_normal"}) {
    let ret = "";
    if(!displayOptions.hiddenUserIcons) {
      const user = Renderer.decideBaseTweet(tweet, isRetweet, "user");
      let iconSize = "";
      let iconStyle = "";
      switch(displayOptions.iconSize) {
        case "retweeter":
          iconSize = "_mini.";
          iconStyle = "retweeter"; // 1.4em
          break;
        case "icon_small":
          iconSize = "_mini.";
          iconStyle = "icon_small"; // 24px
          break;
        case 'icon_large':
          iconSize = "_bigger.";
          iconStyle = "icon_large"; // 73px
          break;
        case 'icon_max':
          iconSize = ".";
          iconStyle = "icon_max"; // 128px
          break;
        case 'icon_normal':
        default:
          iconSize = "_normal.";
          iconStyle = "icon_normal"; // 48px
          break;
      }
      ret = `<img class="profile ${iconStyle}" src="${user.profile_image_url_https.replace(/_(mini|normal|bigger)\./, iconSize)}" />`;
    }
    return ret;
  },

  buildGeo: function(tweet, isRetweet = true, displayOptions = {hiddenGeoInfo: false}) {
    let ret = "";
    const geo = Renderer.decideBaseTweet(tweet, isRetweet, "geo");
    if(!displayOptions.hiddenGeoInfo && !!geo) {
      let coords = geo.coordinates;
      if(typeof coords[0] !== "number") {
        coords[0] = 0.0;
      }
      if(typeof coords[1] !== "number") {
        coords[1] = 0.0;
      }
      const latStr = coords.join(",");
      const mapParam = [
          ["center", `${latStr}`],
          ["zoom", "15"],
          ["size", "200x200"],
          ["maptype", "roadmap"],
          ["markers", `size:small|${latStr}`],
          ["sensor", "false"]
        ].map(([q, v]) => `${q}=${v}`).join("&");
      ret = `<span class="geo_tag"><a class="handleLink tooltip" data-handle-link-base="http://maps.google.com/maps?q=loc:${latStr}" data-tooltip-content="<img src=\'http://maps.google.com/maps/api/staticmap?${mapParam}\' />" href="#"><span class="glyphicon glyphicon-map-marker"></span></a></span>`;
    }
    return ret;
  },

  buildRetweetCounts: function(tweet, isRetweet = true, displayOptions = {hiddenRetweetCount: false}) {
    let ret = "";
    const retweetCounts = Renderer.decideBaseTweet(tweet, isRetweet, "retweet_count");
    if(!displayOptions.hiddenRetweetCount && parseInt(retweetCounts, 10) > 0) {
      ret = `<span class="inRetweet"><span class="glyphicon glyphicon-retweet"></span>${retweetCounts}</span>`;
    }
    return ret;
  },

  buildLikeCounts: function(tweet, isRetweet = true, displayOptions = {hiddenLikeCount: false}) {
    let ret = "";
    const LikeCounts = Renderer.decideBaseTweet(tweet, isRetweet, "favorite_count") || 0;
    if(!displayOptions.hiddenLikeCount && parseInt(LikeCounts, 10) > 0) {
      ret = `<span class="inLike"><span class="glyphicon glyphicon-heart"></span>${LikeCounts}</span>`;
    }
    return ret;
  },

  buildReply: function(tweet, isRetweet = true, displayOptions = {hiddenReplyInfo: false}) {
    let ret = "";
    const baseTweet = Renderer.decideBaseTweet(tweet, isRetweet);
    if(!displayOptions.hiddenReplyInfo && !!baseTweet.in_reply_to_status_id_str) {
      ret = `<span class="inReply">${Renderer.constantStrings.inReply_prefix}<a class="expandInReply" data-expand-in-reply-tweet="${escape(JSON.stringify({"in_reply_to_status_id_str": baseTweet.in_reply_to_status_id_str}))}" data-expand-in-reply-id="${tweet.silm_tweetSpaceId}" href="#">${baseTweet.in_reply_to_screen_name}</a>${Renderer.constantStrings.inReply_suffix}</span>`;
    }
    return ret;
  },

  buildFavoriteAction: function(tweet, isRetweet = true, isDM = false) {
    let ret = "";
    if(!isDM) {
      const baseTweet = Renderer.decideBaseTweet(tweet, isRetweet) || 0;
      ret = `<span class="glyphicon new_actions_item `;
      if(!!baseTweet.favorited) {
        ret += `glyphicon-heart action_unlike" title="${Renderer.constantStrings.unmarkLike}"`;
      } else {
        ret += `glyphicon-heart-empty action_like" title="${Renderer.constantStrings.markLike}"`;
      }
      ret += ` data-like-target-id="${baseTweet.id_str}"></span>`;
    }
    return ret;
  },

  buildReplyAction: function(tweet, isRetweet = true, isDM = false, isSelf = false) {
    let ret = "";
    if(!(isDM && isSelf)) {
      ret = `<span class="glyphicon glyphicon-reply new_actions_item action_reply" title="${Renderer.constantStrings.reply}" data-reply-target-url="${Renderer.buildTimestampUrl(tweet, isRetweet)}" data-reply-to-dm="${isDM}"></span>`;
    }
    return ret;
  },

  buildRetweetAction: function(tweet, isRetweet = true, isDM = false, isSelf = false) {
    let ret = "";
    const baseTweet = Renderer.decideBaseTweet(tweet, isRetweet);
    if(!isDM && !(baseTweet.user.protected && !isSelf) && !baseTweet.retweeted) {
      ret += `<span class="glyphicon glyphicon-retweet new_actions_item action_retweet" title="${Renderer.constantStrings.retweet}" data-retweet-target-id="${baseTweet.id_str}"></span>`;
    }
    if(!isDM && !(baseTweet.user.protected && !isSelf)) {
      ret += `<span class="glyphicon glyphicon-comment new_actions_item action_quote" title="${Renderer.constantStrings.quoteTweet}" data-quote-tweet-url="${Renderer.buildTimestampUrl(tweet, isRetweet)}"></span>`
    }
    return ret;
  },

  buildDeleteAction: function(tweet, isDM = false, isSelf = false) {
    let ret = "";
    if(!!isDM || !!isSelf) {
      ret = `<span class="glyphicon glyphicon-trash new_actions_item action_delete_tweet" title="${Renderer.constantStrings.deleteTweet}" data-delete-target-id="${tweet.id_str}" data-timeline-id="${tweet.silm_tweetTimelineId}"></span>`;
    }
    return ret;
  },

  buildDeleteRetweetAction: function(tweet, isSelf = true) {
    let ret = "";
    if((!!tweet.retweeted_status && !!isSelf) || !!tweet.current_user_retweet) {
      const tweetId = (!!tweet.current_user_retweet)? tweet.current_user_retweet.id_str: tweet.id_str;
      ret = `<span class="glyphicon glyphicon-remove-circle new_actions_item action_cancel_retweet" title="${Renderer.constantStrings.deleteRT}" data-delete-target-id="${tweetId}" data-timeline-id="${tweet.silm_tweetTimelineId}"></span>`;
    } 
    return ret;
  },

  buildDmAction: function(tweet, isRetweet = true, isDM = false) {
    let ret = "";
    const baseTweet = Renderer.decideBaseTweet(tweet, isRetweet);
    const enableDM = (baseTweet.user.allow_dms_from === "everyone") || !!tweetManager.isFollowedBy(baseTweet.user.id_str);
    if(!isDM && enableDM) {
      ret = `<span class="glyphicon glyphicon-envelope new_actions_item action_message" title="${Renderer.constantStrings.directMessage}" data-message-target-name="${baseTweet.user.screen_name}"></span>`;
    }
    return ret;
  },

  assemblyTweets: function (tweets, timelineId) {
    let destination = $("#timeline-" + timelineId).find(".inner_timeline");
    if(destination.length === 0) {
      destination = null;
      return;
    }
    let displayOptions = Renderer.getDisplayOptions(true);
    let renderdText = "", pNow = performance.now(), dNow = Date.now();

    for(let tweet of tweets) {
      renderdText += Renderer.renderTweet(tweet, dNow, displayOptions);
      tweetManager.readTweet(tweet.id_str);
    }

    Renderer.preClearance();
    destination
    .empty()
    .html(renderdText);
    Renderer.applyObserve();
    Renderer.adaptiveFetchSettings(performance.now() - pNow);
    renderdText = null;
    destination = null;
  },

  getDisplayOptions: (useColors) => {
    // Twitter Display Requirements Options
    const option = {
      useColors: !!useColors,
      compliantTDR: true,
      hiddenUserIcons: false,
      nameAttribute: 'both',
      displaySimpleName: false,
      hiddenFooter: false,
      hiddenTimestamp: false,
      hiddenReplyInfo: false,
      hiddenRetweetInfo: false,
      hiddenRetweetCount: false,
      hiddenLikeCount: false,
      hiddenClientName: false,
      hiddenDMInfo: false,
      hiddenGeoInfo: false,
      hiddenListInfo: false,
      iconSize: OptionsBackend.get('icon_size'),
      colors: OptionsBackend.getAll("_tweets_color$")
    };
    if(!OptionsBackend.get('compliant_twitter_display_requirements')) {
      return Object.assign(option, {
        compliantTDR: false,
        hiddenUserIcons: OptionsBackend.get('hidden_user_icons'),
        nameAttribute: OptionsBackend.get('name_attribute'),
        displaySimpleName: OptionsBackend.get('display_simple_name'),
        hiddenFooter: OptionsBackend.get('hidden_footer'),
        hiddenTimestamp: OptionsBackend.get('hidden_timestamp'),
        hiddenReplyInfo: OptionsBackend.get('hidden_reply_info'),
        hiddenRetweetInfo: OptionsBackend.get('hidden_retweet_info'),
        hiddenRetweetCount: OptionsBackend.get('hidden_retweet_count'),
        hiddenLikeCount: OptionsBackend.get('hidden_favorite_count'),
        hiddenClientName: OptionsBackend.get('hidden_client_name'),
        hiddenDMInfo: OptionsBackend.get('hidden_dm_info'),
        hiddenGeoInfo: OptionsBackend.get('hidden_geo_info'),
        hiddenListInfo: OptionsBackend.get('hidden_list_info')
      });
    } else {
      return option;
    }
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
    this.classList.remove("createUserActionMenu");
    const userId = this.dataset.userId || "undefined";
    const userName = this.dataset.userName || "undefined";
    if(userId === "1266336019" || userId === "undefined" || userName === "undefined") {
      if(this.textContent) {
        this.outerHTML = `<span class="user">${this.textContent}</span>`;
      } else {
        this.style.cursor = "auto";
      }
      return;
    }
    const selfId = tweetManager.twitterBackend.userId === userId;
    const isFollowing = tweetManager.isFollowing(userId);
    const isMuting = tweetManager.isMuting(userId);
    const isBlocked = tweetManager.isBlocked(userId);
    const reloadTimeline = () => {
      if(tweetManager.currentTimelineId === TimelineTemplate.UNIFIED
      || tweetManager.currentTimelineId === TimelineTemplate.HOME) {
        prepareAndLoadTimeline();
      }
    };
    $(this).actionMenu({
      showMenu: function(event) {
        if(event.isAlternateClick) {
          Renderer.openTab(Renderer.URLS.BASE + userName, event);
          return false;
        }
        return true;
      },
      actions: [
        {
          name: Renderer.constantStrings.tweets_action,
          action: function(event) {
            TimelineTab.addNewSearchTab(`from:${userName}`, event.isAlternateClick);
          }
        },
        {
          name: Renderer.constantStrings.profile_action,
          action: function(event) {
            Renderer.openTab(Renderer.URLS.BASE + userName, event);
          }
        },
        {
          name: Renderer.constantStrings.follow_action,
          action: function() {
            showLoading();
            tweetManager.followUser(function(success, data) {
              hideLoading();
              if(success) {
                reloadTimeline();
              } else if(data.churn) {
                Renderer.showError(Renderer.constantStrings.churn_action);
              }
            }, userId);
          },
          condition: function() {
            return !selfId && !isFollowing;
          }
        },
        {
          name: Renderer.constantStrings.unfollow_action,
          action: function() {
            showLoading();
            tweetManager.unfollowUser(function(success, data) {
              hideLoading();
              if(success) {
                reloadTimeline();
              } else if(data.churn) {
                Renderer.showError(Renderer.constantStrings.churn_action);
              }
            }, userId);
          },
          condition: function() {
            return !selfId && isFollowing;
          },
          second_level: true
        },
        {
          name: Renderer.constantStrings.mute_action,
          action: function() {
            showLoading();
            tweetManager.muteUser(function(success, data) {
              hideLoading();
              if(success) {
                reloadTimeline();
              } else if(data.churn) {
                Renderer.showError(Renderer.constantStrings.churn_action);
              }
            }, userId);
          },
          condition: function() {
            return !selfId && !isMuting;
          },
          second_level: true
        },
        {
          name: Renderer.constantStrings.unmute_action,
          action: function() {
            showLoading();
            tweetManager.unmuteUser(function(success, data) {
              hideLoading();
              if(success) {
                reloadTimeline();
              } else if(data.churn) {
                Renderer.showError(Renderer.constantStrings.churn_action);
              }
            }, userId);
          },
          condition: function() {
            return !selfId && isMuting;
          },
          second_level: true
        },
        {
          name: Renderer.constantStrings.block_action,
          action: function() {
            showLoading();
            tweetManager.blockUser(function(success, data) {
              hideLoading();
              if(success) {
                reloadTimeline();
              } else if(data.churn) {
                Renderer.showError(Renderer.constantStrings.churn_action);
              }
            }, userId);
          },
          condition: function() {
            return !selfId && !isBlocked;
          },
          second_level: true
        },
        {
          name: Renderer.constantStrings.unblock_action,
          action: function() {
            showLoading();
            tweetManager.unblockUser(function(success, data) {
              hideLoading();
              if(success) {
                reloadTimeline();
              } else if(data.churn) {
                Renderer.showError(Renderer.constantStrings.churn_action);
              }
            }, userId);
          },
          condition: function() {
            return !selfId && isBlocked;
          },
          second_level: true
        },
        {
          name: Renderer.constantStrings.report_action,
          action: function() {
            showLoading();
            tweetManager.reportUser(function(success, data) {
              hideLoading();
              if(success) {
                reloadTimeline();
              } else if(data.churn) {
                Renderer.showError(Renderer.constantStrings.churn_action);
              }
            }, userId);
          },
          condition: function() {
            return !selfId && !isBlocked;
          },
          second_level: true
        }
      ],
      parentContainer: '.inner_timeline'
    });
  },

  handleHashTagFunc: (el) => {
    if(!el || !el.classList) {
      return;
    }
    el.classList.remove("handleHashTag");
    if(!el.dataset.handleHashTag) {
      return;
    }
    AnyClick.anyClick(el, (event) => {
      if(event.isAlternateClick) {
        Renderer.openTab(Renderer.URLS.SEARCH + encodeURIComponent(el.dataset.handleHashTag), event);
      } else {
        TimelineTab.addNewSearchTab(el.dataset.handleHashTag, event.isAlternateClick);
      }
    });
  },

  expandInReplyFunc: (el) => {
    if(!el || !el.classList || !el.dataset.expandInReplyId || !el.dataset.expandInReplyTweet) {
      return;
    }
    try {
      const tweet = JSON.parse(unescape(el.dataset.expandInReplyTweet));
      const tweetSpaceId = el.dataset.expandInReplyId;
      AnyClick.anyClick(el, () => {
        Renderer.toggleInReply(tweet, tweetSpaceId);
      });
      Renderer.expandInReply(tweet, tweetSpaceId, true);
    } catch(e) {

    } finally {
      el.removeAttribute("data-expand-in-reply-tweet");
      el.removeAttribute("data-expand-in-reply-id");
      el.classList.remove("expandInReply");
    }
  },

  handleLinkEachFunc: (el) => {
    if(!el || !el.classList) {
      return;
    }
    el.classList.remove("handleLink");
    const baseUrl = (el.dataset.handleLinkBase === "undefined")? null: el.dataset.handleLinkBase;
    const expandedUrl = (el.dataset.handleLinkExpanded === "undefined")? null: el.dataset.handleLinkExpanded;
    const mediaUrl = (el.dataset.handleLinkMedia === "undefined")? null: el.dataset.handleLinkMedia;
    AnyClick.anyClick(el, (event) => {
      Renderer.openTab(el.dataset.handleLinkBase, event);
    });
    if(!OptionsBackend.get("show_expanded_urls") || el.dataset.handleLinkNoexpand === "true") {
      el.dataset.tooltipContent = `<p>${baseUrl}</p>`;
      return;
    } else {
      el.dataset.tooltipContent = Renderer.constantStrings.expanding_url;
      const toExpandUrl = mediaUrl || expandedUrl || baseUrl;
      const expandCallback = (result) => {
        const resultUrl = result.get("url") || toExpandUrl;
        if(typeof result.get("content") !== "undefined") {
          if(Renderer.entitiesRegexp.quoteTweet.test(resultUrl)) {
            const tweetspaceId = $(el).parents('.tweet_space').attr('id');
            const quotedTweetEntity = escape(JSON.stringify({
             "in_reply_to_status_id_str": Renderer.entitiesRegexp.quoteTweet.exec(resultUrl)[2] || ""
            }));
            el.outerHTML = `
              <span>
                <span class="glyphicon glyphicon-link"></span>
                <a href="${toExpandUrl}"
                   class="expandInReply"
                   data-handle-link-base="${toExpandUrl}"
                   data-handle-link-expanded="${resultUrl}"
                   data-handle-link-media="undefined"
                   data-expand-in-reply-tweet="${quotedTweetEntity}"
                   data-expand-in-reply-id="${tweetspaceId}"
                   title="${Renderer.constantStrings.expand_quote}">${toExpandUrl}</a>
              </span>
            `;
            Renderer.expandInReplyFunc(document.querySelector(`a[data-handle-link-expanded="${resultUrl}"]`));
            return;
          } else {
            el.dataset.tooltipContent = result.get('content');
          }
        } else {
          el.dataset.tooltipContent = `<p>${result.get('url')}</p>`;
        }
        $(el).tooltip({
          create: function (event, ui) {
            $(this).data("ui-tooltip").liveRegion.remove();
          },
          show: {
            delay: 500
          },
          content: function() {
            return this.dataset.tooltipContent || this.getAttribute("title") || this.textContent;
          }
        });
      };
      tweetManager.urlExpander.expand({
        url: toExpandUrl,
        callback: expandCallback
      });
    }
  },

  expandInReply: function(tweet, targetId, showIfVisible) {
    if(showIfVisible && !tweet.replyVisible) {
      return;
    }
    showLoading();
    const callback = (success, data) => {
      hideLoading()
      tweet.replyVisible = true;
      tweet.inReplyToTweet = data;
      const renderedTweet = Renderer.renderTweet(data, Date.now(), Renderer.getDisplayOptions(false));
      const insertTarget = document.querySelector(`#${targetId}`);
      $(renderedTweet).appendTo(insertTarget);
      Renderer.applyObserve(insertTarget);
    };
    if(tweet.inReplyToTweet) {
      callback(true, tweet.inReplyToTweet);
    } else {
      tweetManager.getInReplyToTweet(callback, tweet.in_reply_to_status_id_str);
    }
  },

  toggleInReply: function(tweet, targetId) {
    if(tweet.replyVisible) {
      tweet.replyVisible = false;
      window.dispatchEvent(new CustomEvent("updateVisibility", {detail: tweet.in_reply_to_status_id_str}));
    } else {
      Renderer.expandInReply(tweet, targetId);
    }
  },

  showError: function(msg) {
    Renderer.showMessage({
      type: "error",
      message: msg
    });
  },

  showMessage: function(msg) {
    if(!msg.message) {
      return;
    }
    document.querySelector("silm-snackbar").enqueue({
      type: msg.type || "info",
      message: msg.message
    });
  },

  detach: function() {
    if(!ThemeManager.detachedPos.width || !ThemeManager.detachedPos.height) {
      ThemeManager.detachedPos.width = window.innerWidth;
      ThemeManager.detachedPos.height = window.innerHeight;
    }
    window.open(chrome.extension.getURL('popup.html?window=detached'), 'cb_popup_window',
      'left=' + ThemeManager.detachedPos.left + ',top=' + (ThemeManager.detachedPos.top - 22) + // Magic 22...
      ',width=' + ThemeManager.detachedPos.width + ',height=' + ThemeManager.detachedPos.height +
      'location=no,menubar=no,resizable=yes,status=no,titlebar=yes,toolbar=no');
    window.close();
  },

  openTab: function(tabUrl, event) {
    var background = false;
    if(event && event.button) {
      if(event.button == 2) {
        return true;
      }
      if(event.button == 1 || event.metaKey || event.ctrlKey) {
        background = true;
      }
    }
    if(!(/^https?:\/\//.test(tabUrl))
    && !(/^chrome-extension:\/\//.test(tabUrl))) {
      tabUrl = "http://" + tabUrl;
    }
    tabUrl.replace(/\W.*$/, "");
    if(!background) {
      var obj = chrome.tabs.create({
        url: tabUrl,
        active: !background
      });
      if(background && obj) {
        obj.blur();
      }
    } else {
      chrome.tabs.create({
        url: tabUrl,
        active: !background
      });
    }
    return true;
  },

  preClearance: function(target) {
    if(!target) {
      tweetManager.urlExpander.clear();
    }
    AnyClick.clearEventListeners(target);
    Renderer.removeListenerForNewActions(target);
    Renderer.applyUnobserve(target);
  }
};
