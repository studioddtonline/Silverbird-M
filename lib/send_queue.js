function SendQueue(twitterBackend) {
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
SendQueue.prototype = {
  enqueueTweet: function(message, replyId, replyUser, isDM, mediaIds) {
    if(this._isDuplicate(message)) {
      return;
    }
    var queuedTweet = new QueuedTweet(this.twitterBackend, message, replyId, replyUser, isDM, mediaIds);
    this.queue.push(queuedTweet);
    this._safeCallbackCall(this.onTweetEnqueuedCallback, queuedTweet, this.queue.length);
    this._sender();
  },

  queueSize: function() {
    return this.queue.length;
  },

  abortedStatus: function() {
    if(!this.abortedQueue)
      return undefined;
    var ret = this.abortedQueue.slice(0);
    this.abortedQueue = [];
    return ret;
  },

  onQueueEmpty: function(onQueueEmptyCallback) {
    this.onQueueEmptyCallback = onQueueEmptyCallback;
  },

  onTweetEnqueued: function(onTweetEnqueuedCallback) {
    this.onTweetEnqueuedCallback = onTweetEnqueuedCallback;
  },

  onTweetSent: function(onTweetSentCallback) {
    this.onTweetSentCallback = onTweetSentCallback;
  },

  onSendFailed: function(onSendFailedCallback) {
    this.onSendFailedCallback = onSendFailedCallback;
  },

  cleanUpCallbacks: function() {
    this.onQueueEmptyCallback = null;
    this.onTweetEnqueuedCallback = null;
    this.onTweetSentCallback = null;
    this.onSendFailedCallback = null;
  },

  _safeCallbackCall: function(callbackFunc) {
    if(callbackFunc) {
      try {
        var args = Array.prototype.slice.call(arguments);
        callbackFunc.apply(this, args.slice(1, args.length));
      } catch(e) {
        /* ignoring, popup dead? */
      }
    }
  },

  _isDuplicate: function(message) {
    for(var i = 0, len = this.queue.length; i < len; ++i) {
      if(this.queue[i].message == message) {
        return true;
      }
    }
    return false;
  },

  _unqueueTweet: function() {
    if(this.queue.length > 0) {
      this.lastSent = this.queue.splice(0, 1)[0];
    }
  },

  _sender: function() {
    if(this.queue.length === 0) {
      this._safeCallbackCall(this.onQueueEmptyCallback, this.lastSent);
      return;
    }
    if(this.waitingSendResponse) return;
    this.waitingSendResponse = true;

    var tweetToSend = this.queue[0];
    tweetToSend.send((function(self) {
      return function(success, data, status, unuse_context, unuse_request, retry) {
        self.waitingSendResponse = false;
        var nextRequestWaitTime = 0;

        if(!retry) success = true;
        if(!success && status && status.match(/duplicate/)) {
          success = true;
        }
        if(success) {
          if(data) {
            self._unqueueTweet();
            self._safeCallbackCall(self.onTweetSent, tweetToSend, self.queue.length);
            TweetManager.instance.eachTimeline(function(timeline) {
              timeline.onStreamData(data);
            });
          } else {
            self.abortedQueue = self.queue;
            self.queue = [];
            self._safeCallbackCall(self.onSendFailedCallback, status);
          }
        } else {
          if(tweetToSend.shouldCancel) {
            self._unqueueTweet();
          } else {
            // Too bad, something went wrong.
            if(tweetToSend.retryCount >= 3) {
              // Tried too many times, let's abort the whole queue and let the user deal with it.
              self.abortedQueue = self.queue;
              self.queue = [];
              self._safeCallbackCall(self.onSendFailedCallback, status);
            } else {
              // Keep trying a few more times
              nextRequestWaitTime = 10000;
              tweetToSend.lastStatus = status;
            }
          }
        }
        setTimeout(function(self) {
          self._sender();
        }, nextRequestWaitTime, self);
      };
    })(this));
  }
};

function QueuedTweet(twitterBackend, message, replyId, replyUser, isDM, mediaIds) {
  this.twitterBackend = twitterBackend;
  this.message = message;
  this.replyId = replyId;
  this.replyUser = replyUser;
  this.createdAt = null;
  this.lastStatus = null;
  this.lastRetry = null;
  this.retryCount = 0;
  this.shouldCancel = false;
  this.isDM = isDM || false;
  this.mediaIds = mediaIds || new Map();
}
QueuedTweet.prototype = {
  send: function(callback) {
    if(!this.createdAt) {
      this.createdAt = Date.now();
    }
    this.lastRetry = Date.now();
    this.retryCount += 1;
    var arrayedMediaIds = [];
    if(this.mediaIds.size > 0) {
      for(var mediaId of this.mediaIds.keys()) {
        arrayedMediaIds.push(mediaId);
      }
    }
    if(this.isDM) {
      // Direct Message with Media is not enabled for 3rd-party applications.
      this.twitterBackend.newDM(callback, this.message, this.replyId);
    } else {
      this.twitterBackend.tweet(callback, this.message, this.replyId, arrayedMediaIds);
    }
  },
  cancel: function() {
    this.shouldCancel = true;
  }
};
