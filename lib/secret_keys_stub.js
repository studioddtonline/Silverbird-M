/*
  You should fill this file with your API keys
*/
var SecretKeys = {
  twitter: {
    consumerSecret: '',
    consumerKey: ''
  },
  bitly: {
    clientId: '',
    clientSecret: ''
  },
  google: {
    clientId: '',
    clientSecret: ''
  },

  hasValidKeys: function() {
    return (this.twitter.consumerSecret != '' && this.twitter.consumerKey != '');
  }
};
