var backgroundPage = chrome.extension.getBackgroundPage();
var url_shortener = backgroundPage.OptionsBackend.get('url_shortener');
if(backgroundPage.Shortener.tokenRequested) {
  if(url_shortener == 'googl' && location.search.search('oauth_verifier') !== -1){
    backgroundPage.GooglShortener.getAccessToken(location.search);
  } else if(url_shortener == 'bitly' && location.search.search('code') !== -1) {
    backgroundPage.BitLyShortener.getAccessToken(location.search);
  } else {
    $(document.body).html('<p>ERROR</p>');
  }
}
