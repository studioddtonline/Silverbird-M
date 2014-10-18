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
  google: {
    key: '',
    consumerSecret: '',
    consumerKey: ''
  },

  hasValidKeys: function() {
    return (this.twitter.consumerSecret != '' && this.twitter.consumerKey != '');
  }
};
