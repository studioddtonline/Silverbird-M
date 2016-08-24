"use strict";
class ValueWrapper {
  constructor(key, isObject) {
    if(!key) {
      throw new TypeError("ValueWrapper needs key");
    }
    this.key = key;
    this.isObject = !!isObject;
  }
  save(value) {
    if((typeof value) !== 'string') {
      value = JSON.stringify(value);
    }
    localStorage[this.key] = value;
    return value;
  }
  val() {
    let value = localStorage[this.key];
    if(!value) {
      return undefined;
    }
    try {
      if(this.isObject) {
        value = JSON.parse(value);
      }
    } catch(e) {
      value = undefined;
    }
    return value;
  }
  remove() {
    return localStorage.removeItem(this.key);
  }
};

let Persistence = (() => {
  let persistence = Object.create(null);
  let keys = new Map([
    ['options', true],
    ['timeline_order', true],
    ['oauth_token_data', false],
    ['version', true],
    ['popup_size', true],
    ['window_position', true]
  ]);
  for(let key of keys.keys()) {
    let methodName = key.replace(/_(\w)/g, (m1, m2) => {
      return m2.toUpperCase();
    });
    let isObject = keys.get(key);
    Object.defineProperty(persistence, methodName, {
      value: () => {
        return new ValueWrapper(key, isObject);
      }
    });
  }
  // clean up
  localStorage.removeItem('password');
  localStorage.removeItem('logged');
  localStorage.removeItem('username');
  localStorage.removeItem('remember');
  localStorage.removeItem('current_theme');
  localStorage.removeItem('oauth_token_service');
  localStorage.removeItem('previous_user_id');
  localStorage.removeItem('selected_lists');
  localStorage.removeItem('object_keys');
  // return
  return persistence;
})();
