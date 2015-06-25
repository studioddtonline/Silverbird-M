/*
  You should fill this file with your API keys
*/
var SecretKeys = {
  twitter: {
    consumerSecret: '',
    consumerKey: ''
  },
  bitly: {
    consumerSecret: '',
    consumerKey: ''
  },
  google: {
    clientId: '',
    clientSecret: ''
  },

  hasValidKeys: function() {
    return (this.twitter.consumerSecret != '' && this.twitter.consumerKey != '');
  }
};
