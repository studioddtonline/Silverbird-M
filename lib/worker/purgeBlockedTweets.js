onmessage = function(message) {
  var tweetsCache = message.data.tweetsCache || [],
      blockedUserNames = message.data.blockedUserNames || {},
      result = [];
  for(var i = 0, len = tweetsCache.length; i < len; i++) {
    var tweet = tweetsCache[i];
    if((tweet.retweeted_status && blockedUserNames[tweet.retweeted_status.user.screen_name])
    || (tweet.user && blockedUserNames[tweet.user.screen_name])) {
      continue;
    } else {
      result[result.length] = tweet;
    }
  }
  postMessage(result);
}
