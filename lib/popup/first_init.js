$.ajaxSetup({
  timeout: OptionsBackend.get('request_timeout')
});

var url_shortener = OptionsBackend.get('url_shortener');
var shortener = new Shortener(url_shortener);
