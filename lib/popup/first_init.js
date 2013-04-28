$.ajaxSetup({
  timeout: OptionsBackend.get('request_timeout')
});

var url_shortener = OptionsBackend.get('url_shortener');
var reply_all = OptionsBackend.get('reply_all');
var shortener = new Shortener(url_shortener);
