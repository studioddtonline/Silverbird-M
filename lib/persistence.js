"use strict";
var Persistence = {
  isObject: function(key) {
    if(this.hasOwnProperty("keys")) {
      return this.keys.get(key) || false;
    } else {
      throw new TypeError("Persistence is not initialized");
    }
  },
  init: function() {
    Object.defineProperty(this, "keys", {
      value: new Map([
        ['options', false],
        ['timeline_order', false],
        ['oauth_token_data', false],
        ['version', false],
        ['popup_size', false],
        ['window_position', false]
      ])
    });
    for(let key of this.keys.keys()) {
      let methodName = key.replace(/_(\w)/g, (m1, m2) => {
        return m2.toUpperCase();
      });
      Object.defineProperty(this, methodName, {
        value: () => {
          return new ValueWrapper(key);
        }
      });
    }
    this.cleanupOldData();
  },
  cleanupOldData: function() {
    localStorage.removeItem('password');
    localStorage.removeItem('logged');
    localStorage.removeItem('username');
    localStorage.removeItem('remember');
    localStorage.removeItem('current_theme');
    localStorage.removeItem('oauth_token_service');
    localStorage.removeItem('previous_user_id');
    localStorage.removeItem('selected_lists');
    localStorage.removeItem('object_keys');
  }
};

function ValueWrapper(key) {
  this.key = key;
}
ValueWrapper.prototype = {
  save: function(value) {
    if((typeof value) != 'string') {
      value = JSON.stringify(value);
    }
    localStorage[this.key] = value;
    return value;
  },
  val: function() {
    var value = localStorage[this.key];
    if(!value) {
      return undefined;
    }
    try {
      if(Persistence.isObject(this.key)) {
        value = JSON.parse(value);
      }
    } catch(e) {
      value = undefined;
    }
    return value;
  },
  remove: function() {
    return localStorage.removeItem(this.key);
  }
};

Persistence.init();
