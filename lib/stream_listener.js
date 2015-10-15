var StreamListener = (function() {

  var props = {
    streamReconnectCount: 0,
    streamReconnectBaseTime: 20000,
    streamReconnectWaitTime: 20000,
    streamMaxStaleTime: 90000,
    streamMaxReconnectWait: 600000
  };

  props.subscribers = [];
  props.twitterLib = null;

  var xhr, onProgress, currentStatus;

  var curry = function(func) {
    var args = [...arguments].slice(1);
    return function() {
      func.apply(this, args);
    };
  };

  var publish = function(data) {
    if(props.twitterLib) {
      if(data.hasOwnProperty('text')) {
        props.twitterLib.normalizeTweets(data);
      } else if(data.hasOwnProperty('direct_message')) {
        props.twitterLib.normalizeTweets(data.direct_message);
      }
    }
    for(var i = 0, len = props.subscribers.length; i < len; ++i) {
      var sub = props.subscribers[i];
      sub.callback.call(sub.context, data);
    }
  };

  var publishDisconnect = curry(publish, {
    event: 'disconnected'
  });

  var publishConnect = curry(publish, {
    event: 'connected'
  });

  var stopStream = function() {
    if(!xhr) {
      currentStatus = undefined;
      return;
    }
    currentStatus = false;
    xhr.removeEventListener("progress", onProgress, false);
    xhr.abort();
  };

  var connectStream = function() {
    if(!OptionsBackend.get('use_streaming_api')) {
      currentStatus = undefined;
      return;
    } else {
      currentStatus = false;
    }
    var MAX_BUFFER = 1024 * 500;
    var url = 'https://userstream.twitter.com/1.1/user.json';
    var params = {
      delimited: 'length',
      stall_warnings: 'true',
      stringify_friend_ids: 'true'
    };

    props.streamReconnectCount += 1;

    xhr = new XMLHttpRequest();
    xhr.open('GET', url + '?' + $.param(params), true);
    xhr.setRequestHeader('X-User-Agent', 'Silverbird M ' + JSON.parse(Persistence.version().val()).join('.'));
    if(props.twitterLib) {
      props.twitterLib.signOauth(xhr, url, params, 'GET');
    }

    var lastLoaded = 0, lastChunkLen, lastProgressTime = Date.now();
    onProgress = function(e) {
      lastProgressTime = Date.now();

      var totalLen = e.loaded;
      if(totalLen > MAX_BUFFER) {
        stopStream();
      }
      var data = xhr.responseText;

      while(lastLoaded < totalLen) {
        if(!lastChunkLen) {
          lastChunkLen = '';
          var curChar = data.charAt(lastLoaded);
          while(curChar != '\n' || lastChunkLen.length === 0) {
            if(curChar.match(/\d/)) {
              lastChunkLen += curChar;
            }
            lastLoaded += 1;
            if(lastLoaded >= totalLen) {
              return;
            }
            curChar = data.charAt(lastLoaded);
          }
          lastLoaded += 1;
          lastChunkLen = parseInt(lastChunkLen, 10);
        }
        if(lastLoaded + lastChunkLen > totalLen) {
          // Let's just wait for the rest of our data
          return;
        }
        var jsonChunk = data.substring(lastLoaded, lastLoaded + lastChunkLen);
        var parsedChunk;
        try {
          parsedChunk = JSON.parse(jsonChunk);
        } catch(e) {
          console.log(e);
          stopStream();
          return;
        }
        publish(parsedChunk);
        if(parsedChunk.warning && parsedChunk.warning.code == "FOLLOWS_OVER_LIMIT") {
          stopStream();
        }
        lastLoaded += lastChunkLen;
        lastChunkLen = null;
      }
    };

    xhr.addEventListener("progress", onProgress, false);
    var intervalHandle;
    xhr.onreadystatechange = function() {
      if(xhr.readyState == 2 && xhr.status == 200) {
        currentStatus = true;
        publishConnect();
        props.streamReconnectWaitTime = props.streamReconnectBaseTime;
      } else if(xhr.status == 320) {
        stopStream();
        props.streamReconnectWaitTime = props.streamReconnectBaseTime;
      } else if(xhr.status == 420) {
        stopStream();
        props.streamReconnectWaitTime = props.streamReconnectBaseTime * 5;
      } else if(xhr.readyState == 4) {
        currentStatus = false;
        publishDisconnect();
        if(intervalHandle) {
          clearInterval(intervalHandle);
          intervalHandle = null;
        }
        if(props.twitterLib) {
          setTimeout(function() {
            connectStream();
          }, props.streamReconnectWaitTime);
          if(props.streamReconnectWaitTime < props.streamMaxReconnectWait) {
            props.streamReconnectWaitTime *= 2;
          }
        }
      }
    };

    xhr.send();

    var checkStaleConnection = function() {
      var time = Date.now();
      if(time - lastProgressTime > props.streamMaxStaleTime) {
        stopStream();
      }
    };
    intervalHandle = setInterval(checkStaleConnection, props.streamMaxStaleTime / 2);

  };

  return {
    events: {
      CONNECTED: 'connected',
      DISCONNECTED: 'disconnected'
    },

    start: function(twitterLib) {
      if(xhr && xhr.readyState !== 0 && xhr.readyState !== 4) {
        // Prevent multiple connections.
        return;
      }
      props.twitterLib = twitterLib;
      connectStream();
    },

    disconnect: function(keepSubscribers) {
      props.twitterLib = null;
      if(!keepSubscribers) {
        props.subscribers = [];
      }
      stopStream();
    },

    unsubscribe: function(context) {
      var newSubscribers = [];
      for(var i = 0, len = props.subscribers.length; i < len; ++i) {
        var sub = props.subscribers[i];
        if(sub.context != context) {
          newSubscribers.push(sub);
        }
      }
      props.subscribers = newSubscribers;
    },

    subscribe: function(callbackOrOptions, context) {
      var options = (typeof callbackOrOptions === 'function') ? {
        callback: callbackOrOptions,
        context: context
      } : callbackOrOptions;
      props.subscribers.push(options);
    },

    getStatus: function() {
      return currentStatus;
    }
  };
}).call({});