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
    consumerKey: '',
    oauth2: '',
    login: '',
    key: ''
  },
  yfrog: {
    key: ''
  },
  twitpic: {
    key: ''
  },
  viame: {
    consumerSecret: '',
    consumerKey: ''
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

  hasValidKeys: function() {
    return (this.twitter.consumerSecret != '' && this.twitter.consumerKey != '');
  }
};
