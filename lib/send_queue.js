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
  enqueueTweet(message, replyId, replyUser, isDM, mediaIds) {
    if(this._isDuplicate(message)) {
      return;
    }
    let queuedTweet = new QueuedTweet(this.twitterBackend, message, replyId, replyUser, isDM, mediaIds);
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
    this.abortedQueue = [];
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
    let ret = false;
    this.queue.forEach((queue) => {
      if(queue.message === message) {
        ret = true;
      }
    });
    return ret;
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
    tweetToSend.send((success, data, status, unuse_context, unuse_request, retry) => {
      this.waitingSendResponse = false;
      let nextRequestWaitTime = 0;
      if(!retry) {
        success = true;
      }
      if(!success && status && status.match(/duplicate/)) {
        success = true;
      }
      if(success) {
        if(data) {
          this._unqueueTweet();
          this._safeCallbackCall(this.onTweetSent, tweetToSend, this.queue.length);
          TweetManager.instance.eachTimeline((timeline) => {
            timeline.onStreamData(data);
          });
        } else {
          this.abortedQueue = this.queue;
          this.queue = [];
          this._safeCallbackCall(this.onSendFailedCallback, status);
        }
      } else {
        if(tweetToSend.shouldCancel) {
          this._unqueueTweet();
        } else {
          // Too bad, something went wrong.
          if(tweetToSend.retryCount >= 3) {
            // Tried too many times, let's abort the whole queue and let the user deal with it.
            this.abortedQueue = this.queue;
            this.queue = [];
            this._safeCallbackCall(this.onSendFailedCallback, status);
          } else {
            // Keep trying a few more times
            nextRequestWaitTime = 10000;
            tweetToSend.lastStatus = status;
          }
        }
      }
      setTimeout(() => {
        this._sender();
      }, nextRequestWaitTime);
    });
  }
}

class QueuedTweet{
  constructor(twitterBackend, message, replyId, replyUser, isDM = false, mediaIds = new Map()) {
    this.twitterBackend = twitterBackend;
    this.message = message;
    this.replyId = replyId;
    this.replyUser = replyUser;
    this.createdAt = Date.now();
    this.lastStatus = null;
    this.lastRetry = null;
    this.retryCount = 0;
    this.shouldCancel = false;
    this.isDM = isDM;
    this.mediaIds = mediaIds;
  }
  send(callback) {
    this.lastRetry = Date.now();
    this.retryCount += 1;
    const arrayedMediaIds = [...this.mediaIds].filter((entry) => Array.isArray(entry)).map(([key, value]) => key);
    if(this.isDM) {
      // Direct Message with Media is not enabled for 3rd-party applications.
      this.twitterBackend.newDM(callback, this.message, this.replyId);
    } else {
      this.twitterBackend.tweet(callback, this.message, this.replyId, arrayedMediaIds);
    }
  }
  cancel() {
    this.shouldCancel = true;
  }
}
