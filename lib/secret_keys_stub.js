/*
  You should fill this file with your API keys
*/
var SecretKeys = {
  twitter: {
    consumerSecret: '',
    consumerKey: '',
    bearerCredentials: ''
  },
  bitly: {
    consumerSecret: '',
    consumerKey: ''
  },
  yfrog: {
    key: ''
  },
  flickr: {
    consumerSecret: '',
    consumerKey: ''
  },
  pixiv: {
    key: ''
  },
  google: {
    key: '',
    consumerSecret: '',
    consumerKey: ''
  },
  mobypicture: {
    key: ''
  },
  slideshare: {
    key: '',
    secret: ''
  },

  hasValidKeys: function() {
    return (this.twitter.consumerSecret != '' && this.twitter.consumerKey != '');
  }
};
