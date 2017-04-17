class SendQueue {
  constructor(twitterBackend) {
    this.twitterBackend = twitterBackend;
    this.queue = [];
    this.waitingSendResponse = false;
    this.onQueueEmptyCallback = null;
    this.onTweetEnqueuedCallback = null;
    this.onTweetSentCallback = null;
    this.onSendFailedCallback = null;
    this.abortedQueue = null;
    this.lastSent = null;
  }
  enqueueTweet(message, replyId, replyUser, isDM = false, mediaIds, attachmentUrl = undefined) {
    if(this._isDuplicate(message)) {
      return;
    }
    let queuedTweet;
    if(isDM) {
      queuedTweet = new QueuedDM(this.twitterBackend, message, replyUser);
    } else if (!!attachmentUrl) {
      queuedTweet = new QueuedAttachedTweet(this.twitterBackend, message, replyId, replyUser, attachmentUrl);
    } else {
      queuedTweet = new QueuedTweet(this.twitterBackend, message, replyId, replyUser, mediaIds);
    }
    this.queue.push(queuedTweet);
    this._safeCallbackCall(this.onTweetEnqueuedCallback, queuedTweet, this.queue.length);
    this._sender();
  }
  queueSize() {
    return this.queue.length;
  }
  abortedStatus() {
    if(!this.abortedQueue) {
      return undefined;
    }
    let ret = this.abortedQueue.slice(0);
    this.abortedQueue = null;
    return ret;
  }
  onQueueEmpty(onQueueEmptyCallback) {
    this.onQueueEmptyCallback = onQueueEmptyCallback;
  }
  onTweetEnqueued(onTweetEnqueuedCallback) {
    this.onTweetEnqueuedCallback = onTweetEnqueuedCallback;
  }
  onTweetSent(onTweetSentCallback) {
    this.onTweetSentCallback = onTweetSentCallback;
  }
  onSendFailed(onSendFailedCallback) {
    this.onSendFailedCallback = onSendFailedCallback;
  }
  cleanUpCallbacks() {
    this.onQueueEmptyCallback = null;
    this.onTweetEnqueuedCallback = null;
    this.onTweetSentCallback = null;
    this.onSendFailedCallback = null;
  }
  _safeCallbackCall(callbackFunc) {
    if(callbackFunc) {
      try {
        callbackFunc.apply(this, [...arguments].slice(1));
      } catch(e) {
        /* ignoring, popup dead? */
      }
    }
  }
  _isDuplicate(message) {
    return this.queue.some((queue) => queue.message === message);
  }
  _unqueueTweet() {
    if(this.queue.length > 0) {
      this.lastSent = this.queue.splice(0, 1)[0];
    }
  }
  _sender() {
    if(this.queue.length === 0) {
      this._safeCallbackCall(this.onQueueEmptyCallback, this.lastSent);
      return;
    }
    if(this.waitingSendResponse) {
      return;
    }
    this.waitingSendResponse = true;

    let tweetToSend = this.queue[0];
    tweetToSend.send((success, data, status, unuse_context, unuse_request) => {
      this.waitingSendResponse = false;
      if(!success && /duplicate/i.test(status)) {
        success = true;
      }
      if(!!success) {
        if(!!data) {
          this._unqueueTweet();
          this._safeCallbackCall(this.onTweetSent, tweetToSend, this.queue.length);
          TweetManager.instance.eachTimeline((timeline) => {
            Object.defineProperty(data, "from", {
              value: "post"
            });
            timeline.onStreamData(data);
            if(timeline.shouldListenStream) {
              timeline.mergeNewTweets();
            }
          });
        } else {
          this.abortedQueue = this.queue.slice(0);
          this.queue = [];
          this._safeCallbackCall(this.onSendFailedCallback, status);
        }
      } else {
        this.abortedQueue = this.queue.slice(0);
        this.queue = [];
        this._safeCallbackCall(this.onSendFailedCallback, status);
      }
    });
  }
}

class BaseQueue {
  constructor(twitterBackend) {
    if(!twitterBackend) {
      throw new TypeError("missing twitterBackend");
    }
    this.twitterBackend = twitterBackend;
    this.createdAt = Date.now();
    this.lastStatus = null;
  }
  send() {
    throw new TypeError("needs override");
  }
}

class QueuedTweet extends BaseQueue {
  constructor(twitterBackend, message, replyId, replyUser, mediaIds = new Map()) {
    super(twitterBackend);
    this.message = message;
    this.replyId = replyId;
    this.replyUser = replyUser;
    this.mediaIds = mediaIds;
    this.isDM = false;
  }
  send(callback) {
    const arrayedMediaIds = [...this.mediaIds].filter((entry) => Array.isArray(entry)).map(([key, value]) => key);
    this.twitterBackend.tweet(callback, this.message, this.replyId, arrayedMediaIds, undefined);
  }
}

class QueuedDM extends QueuedTweet {
  constructor(twitterBackend, message, replyUser) {
    super(twitterBackend, message, null, replyUser);
    this.isDM = true;
  }
  send(callback) {
    this.twitterBackend.newDM(callback, this.message, this.replyUser);
  }
}

class QueuedAttachedTweet extends QueuedTweet {
  constructor(twitterBackend, message, replyId, replyUser, attachmentUrl) {
    super(twitterBackend);
    this.message = message;
    this.replyId = replyId;
    this.replyUser = replyUser;
    this.attachmentUrl = attachmentUrl;
  }
  send(callback) {
    this.twitterBackend.tweet(callback, this.message, this.replyId, [], this.attachmentUrl);
  }
}
