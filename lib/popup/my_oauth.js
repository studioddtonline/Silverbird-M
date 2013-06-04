var myOAuth = {
  registerPin: function() {
    var pinNumber = $("#enter_pin").find("input").eq(0).val();
    $("#loading_oauth").show();
    twitterBackend.oauthLib.getAccessToken(pinNumber, function(result) {
      $("#loading_oauth").hide();
      $("#enter_pin").hide();
      if(result) {
        location.reload();
      } else {
        var errMsg = twitterBackend.oauthLib.error || chrome.i18n.getMessage("undefined_message");
        $("#error_pin").show().html(chrome.i18n.getMessage("oAuthError", errMsg));
      }
    });
  },
  requestNewToken: function() {
    twitterBackend.startAuthentication();
    window.close();
  }
};
