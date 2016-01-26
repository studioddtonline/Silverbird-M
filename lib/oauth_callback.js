'use strict';
chrome.runtime.getBackgroundPage(function(backgroundPage) {
  const shortener = backgroundPage.TweetManager.instance.shortener.backend;
  const url_shortener = backgroundPage.TweetManager.instance.getOptionsBackend().get('url_shortener');
  const code = location.search.substr(1).split(/[&#]/).filter(function(entry) {
    const splited = entry.toLowerCase().split('=');
    if(splited[0] === 'code') {
      return true;
    }
  }).shift().split('=')[1] || '';
  if(url_shortener === 'bit.ly' && shortener.tokenRequested && code !== '') {
    shortener.getAccessToken(code);
  } else {
    document.body.textContent = 'error';
  }
});
