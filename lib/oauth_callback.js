var backgroundPage = chrome.extension.getBackgroundPage();
var shrotener = backgroundPage.TweetManager.instance.shortener.backend;
var url_shortener = backgroundPage.OptionsBackend.get('url_shortener');
if(shrotener.tokenRequested) {
  if(url_shortener == 'goo.gl' && location.search.search('oauth_verifier') !== -1){
    shrotener.getAccessToken(location.search);
    return;
  } else if(url_shortener == 'bit.ly' && location.search.search('code') !== -1) {
    shrotener.getAccessToken(location.search);
    return;
  }
}
$(document.body).html('<p>ERROR</p>');
