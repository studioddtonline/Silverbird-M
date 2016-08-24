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
    const wrap = {update_at: Date.now(), value};
    localStorage[this.key] = JSON.stringify(wrap);
    return value;
  }
  val() {
    let value = undefined;
    try {
      const parsed = JSON.parse(localStorage[this.key]);
      if(!!parsed.update_at) {
        value = parsed.value;
      } else {
        value = parsed;
      }
    } catch(e) {
      value = localStorage[this.key] || undefined;
    }
    return value;
  }
  updateTime() {
    try {
      return JSON.parse(localStorage[this.key]).update_at;
    } catch(e) {
      return 0;
    }
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
    ['window_position', true],
    ["cached_lists_ownerships", true],
    ["cached_lists_subscriptions", true],
    ["cached_saved_searches", true]
  ]);
  for(let [key, isObject] of keys.entries()) {
    let methodName = key.replace(/_(\w)/g, (m1, m2) => {
      return m2.toUpperCase();
    });
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
