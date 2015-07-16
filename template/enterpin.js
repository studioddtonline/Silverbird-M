$(document.body)
.append(document.getElementById('importEnterPin').import.querySelector('#templateEnterPin').content)
.on('click.enterpin', '#btnAuthorize', function(event) {
  var pinNumber = document.getElementById('input_pin').value || '';
  var loading = $("#loading_oauth");
  loading.show();
  twitterBackend.oauthLib.getAccessToken(pinNumber, function(result) {
    loading.hide();
    $("#enter_pin").hide();
    if(result) {
      setTimeout(location.reload, 5 * 1000);
    } else {
      $("#error_pin")
      .show()
      .html(chrome.i18n.getMessage("oAuthError", twitterBackend.oauthLib.error || chrome.i18n.getMessage("undefined_message")));
    }
  });
})
.on('click.enterpin', '#newToken', function(event) {
  twitterBackend.startAuthentication();
  window.close();
});
doLocalization();

