(function() {
  var pin, port = chrome.runtime.connect({name: 'getAuthPin'});
  port.postMessage({check_pin_needed: true});
  port.onMessage.addListener(function(message) {
    if(message.tokenRequested){
      var fullText = document.getElementById('bd').textContent;
      var codeElement = document.querySelector('code');
      if((fullText.match(/silverbird/i)) && !fullText.match(/denied/i) && codeElement) {
        pin = (codeElement.textContent || '').trim();
        if (!pin || pin.length < 6) {
          port.disconnect();
          return;
        }
        document.querySelector('#oauth_pin p').innerHTML = '<h2>' + chrome.i18n.getMessage('authorizing') + '</h2><h2>' + chrome.i18n.getMessage('yourPIN', pin) + '</h2>';
        port.postMessage({cr_oauth_pin: pin});
        return;
      }
    } else if(typeof message.success !== 'undefined') {
      document.querySelector('#oauth_pin p').innerHTML = '<h2>' + (message.success ? chrome.i18n.getMessage("successAuth"): chrome.i18n.getMessage("cbNotAuthorized") + " " + chrome.i18n.getMessage("yourPIN", pin)) + '</h2>';
    }
    port.disconnect();
  });
})()
