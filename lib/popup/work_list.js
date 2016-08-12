const WorkList = class WorkList{
  static init() {
    if(tweetManager.sendQueue.queueSize() !== 0) {
    }
    tweetManager.sendQueue.onQueueEmpty(function(lastSent) {
      if(!window) {
        return;
      }
      WorkList.sendQueueEmpty(lastSent);
    });
    tweetManager.sendQueue.onTweetEnqueued(function() {
      if(!window) {
        return;
      }
      WorkList.tweetEnqueued();
    });
    tweetManager.sendQueue.onSendFailed(function(status) {
      if(!window) {
        return;
      }
      WorkList.sendFailed(status);
    });
    // Just checking
    WorkList.sendFailed();
  }

  static cancelMessage() {
    let queueItems = tweetManager.sendQueue.queue;
    if(queueItems.length > 0) {
      queueItems[0].cancel();
    }
  }

  static sendQueueEmpty(lastSent) {
    if(OptionsBackend.get('use_streaming_api')) {
      loadNewTweets();
    } else {
      let updateTimelineId = TimelineTemplate.HOME;
      if(lastSent && lastSent.isDM) {
        updateTimelineId = TimelineTemplate.SENT_DMS;
      }
      loadTimeline(true, updateTimelineId);
    }
  }

  static tweetEnqueued() {
  }

  static sendFailed(status) {
    let abortedQueue = tweetManager.sendQueue.abortedStatus();
    if(!abortedQueue || abortedQueue.length === 0) {
      return;
    }
    // If we're here that's because something went wrong
    if(!Composer.isVisible()) {
      // For now let's just show the first enqueued message
      let topMessage = abortedQueue[0];
      Composer.initMessage(topMessage.message, topMessage.replyId, topMessage.replyUser, topMessage.quoteTweetUrl, topMessage.mediaIds, true);
    }
    if(status === 500 || status === 503 || status === 504) {
      Renderer.showError(chrome.i18n.getMessage("ue_twitter_is_now_unable"));
    } else if(status === 261) {
      Renderer.showError(chrome.i18n.getMessage("ue_restricted_write_action"));
    } else if(status === 354) {
      Renderer.showError(chrome.i18n.getMessage("ue_over_dm_character_limit"));
    } else {
      Renderer.showError(chrome.i18n.getMessage("tweet_send_error"));
    }
  }
};
