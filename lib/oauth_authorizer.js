function getAuthPin() {
  var pin, msg, port = chrome.runtime.connect({name: 'getAuthPin'});
  port.postMessage({check_pin_needed: true});
  port.onMessage.addListener(function(message) {
    if(message.tokenRequested){
      var fullText = $("#bd").text();
      if((fullText.match(/silverbird/i)) && !fullText.match(/denied/i)) {
        pin = $.trim($("code").text());
        if (!pin || pin.length < 6) {
          port.disconnect();
          return;
        }
        msg = '<h2>' + chrome.i18n.getMessage("authorizing") + "</h2><h2>" + chrome.i18n.getMessage("yourPIN", pin) + '</h2>';
        $("#oauth_pin").find("p").html(msg);
        port.postMessage({cr_oauth_pin: pin});
        return;
      }
    } else if(message.success) {
      if(message.success) {
        msg = chrome.i18n.getMessage("successAuth");
      } else {
        msg = chrome.i18n.getMessage("cbNotAuthorized") + " " + chrome.i18n.getMessage("yourPIN", pin);
      }
      $("#oauth_pin").find("p").html('<h2>' + msg + '</h2>');
    }
    port.disconnect();
  });
}
getAuthPin();
